/**
 * Performance store — pad grid, ADSR envelopes, choke groups.
 * All pad evaluation happens frontend-only. Backend receives modulated chains.
 */
import { create } from 'zustand';
import type {
  Pad,
  DrumRack,
  PadRuntimeState,
  ADSREnvelope,
  ModulationRoute,
  PadMode,
} from '../../shared/types';
import { DEFAULT_PAD_BINDINGS, DEFAULT_ADSR, RESERVED_KEYS } from '../../shared/constants';
import { computeADSR } from '../components/performance/computeADSR';
import { useUndoStore } from './undo';
import { useMIDIStore } from './midi';

function clampADSR(env: ADSREnvelope): ADSREnvelope {
  return {
    attack: Math.max(0, Math.min(300, Number.isFinite(env.attack) ? env.attack : 0)),
    decay: Math.max(0, Math.min(300, Number.isFinite(env.decay) ? env.decay : 0)),
    sustain: Math.max(0, Math.min(1, Number.isFinite(env.sustain) ? env.sustain : 1)),
    release: Math.max(0, Math.min(300, Number.isFinite(env.release) ? env.release : 0)),
  };
}

function createDefaultPads(): Pad[] {
  return DEFAULT_PAD_BINDINGS.map((code, i) => ({
    id: `pad-${i}`,
    label: `Pad ${i + 1}`,
    keyBinding: code,
    midiNote: null,
    mode: 'gate' as PadMode,
    chokeGroup: null,
    envelope: { ...DEFAULT_ADSR },
    mappings: [],
    color: '#4ade80',
  }));
}

function createDefaultRack(): DrumRack {
  return { grid: '4x4', pads: createDefaultPads() };
}

function defaultPadState(): PadRuntimeState {
  return {
    phase: 'idle',
    triggerFrame: 0,
    releaseFrame: 0,
    currentValue: 0,
    releaseStartValue: 0,
  };
}

interface PerformanceState {
  drumRack: DrumRack;
  isPerformMode: boolean;
  isPadEditorOpen: boolean;
  padStates: Record<string, PadRuntimeState>;

  // Pad trigger actions
  triggerPad: (padId: string, frameIndex: number) => void;
  releasePad: (padId: string, frameIndex: number) => void;
  forceOffPad: (padId: string) => void;
  panicAll: () => void;

  // Config actions (undo-integrated)
  updatePad: (padId: string, updates: Partial<Pad>) => void;
  addPadMapping: (padId: string, mapping: ModulationRoute) => void;
  removePadMapping: (padId: string, index: number) => void;
  setPadKeyBinding: (padId: string, key: string | null) => void;
  setChokeGroup: (padId: string, group: number | null) => void;

  // Mode actions
  setPerformMode: (on: boolean) => void;
  setPadEditorOpen: (open: boolean) => void;

  // Lifecycle
  resetDrumRack: () => void;
  loadDrumRack: (rack: DrumRack) => void;

  // Envelope evaluation
  getEnvelopeValues: (frameIndex: number) => Record<string, number>;
}

export const usePerformanceStore = create<PerformanceState>((set, get) => ({
  drumRack: createDefaultRack(),
  isPerformMode: false,
  isPadEditorOpen: false,
  padStates: {},

  triggerPad: (padId, frameIndex) => {
    const { drumRack, padStates } = get();
    const pad = drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    // H1: Atomic choke+activate in single set()
    const newStates: Record<string, PadRuntimeState> = { ...padStates };

    // Choke: force off all other pads in the same choke group
    if (pad.chokeGroup !== null) {
      for (const other of drumRack.pads) {
        if (other.id !== padId && other.chokeGroup === pad.chokeGroup) {
          newStates[other.id] = defaultPadState();
        }
      }
    }

    // Activate this pad
    newStates[padId] = {
      phase: 'attack',
      triggerFrame: frameIndex,
      releaseFrame: 0,
      currentValue: 0,
      releaseStartValue: 0,
    };

    set({ padStates: newStates });
  },

  releasePad: (padId, frameIndex) => {
    const { padStates, drumRack } = get();
    const state = padStates[padId];
    if (!state || state.phase === 'idle' || state.phase === 'release') return;

    const pad = drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    // Compute current value at release moment
    const currentResult = computeADSR(pad.envelope, state, frameIndex);

    set({
      padStates: {
        ...padStates,
        [padId]: {
          ...state,
          phase: 'release',
          releaseFrame: frameIndex,
          releaseStartValue: currentResult.value,
        },
      },
    });
  },

  forceOffPad: (padId) => {
    set((s) => ({
      padStates: {
        ...s.padStates,
        [padId]: defaultPadState(),
      },
    }));
  },

  panicAll: () => {
    set({ padStates: {} });
  },

  updatePad: (padId, updates) => {
    const { drumRack } = get();
    const oldPad = drumRack.pads.find((p) => p.id === padId);
    if (!oldPad) return;

    const newEnvelope = updates.envelope
      ? clampADSR(updates.envelope)
      : oldPad.envelope;

    const { id: _ignoreId, ...safeUpdates } = updates as Record<string, unknown>;
    const newPad = { ...oldPad, ...safeUpdates, id: oldPad.id, envelope: newEnvelope };

    const forward = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) => (p.id === padId ? newPad : p)) } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) => (p.id === padId ? oldPad : p)) } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Update pad ${oldPad.label}`,
      timestamp: Date.now(),
    });
  },

  addPadMapping: (padId, mapping) => {
    const pad = get().drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    const oldMappings = [...pad.mappings];
    const newMappings = [...oldMappings, mapping];

    const forward = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, mappings: newMappings } : p,
      ) } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, mappings: oldMappings } : p,
      ) } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Add mapping to ${pad.label}`,
      timestamp: Date.now(),
    });
  },

  removePadMapping: (padId, index) => {
    const pad = get().drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    const oldMappings = [...pad.mappings];
    if (index < 0 || index >= oldMappings.length) return;
    const newMappings = oldMappings.filter((_, i) => i !== index);

    const forward = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, mappings: newMappings } : p,
      ) } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, mappings: oldMappings } : p,
      ) } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Remove mapping from ${pad.label}`,
      timestamp: Date.now(),
    });
  },

  setPadKeyBinding: (padId, key) => {
    if (key !== null && RESERVED_KEYS.has(key)) return;

    const { drumRack } = get();
    const pad = drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    const oldKey = pad.keyBinding;

    // H4: Steal binding from old pad if duplicate — capture by ID
    let stolenFromId: string | null = null;
    let stolenOldKey: string | null = null;
    if (key !== null) {
      const stolenPad = drumRack.pads.find(
        (p) => p.id !== padId && p.keyBinding === key,
      );
      if (stolenPad) {
        stolenFromId = stolenPad.id;
        stolenOldKey = stolenPad.keyBinding;
      }
    }

    const forward = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) => {
        if (p.id === padId) return { ...p, keyBinding: key };
        if (stolenFromId && p.id === stolenFromId) return { ...p, keyBinding: null };
        return p;
      }) } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) => {
        if (p.id === padId) return { ...p, keyBinding: oldKey };
        if (stolenFromId && p.id === stolenFromId) return { ...p, keyBinding: stolenOldKey };
        return p;
      }) } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Set key binding for ${pad.label}`,
      timestamp: Date.now(),
    });
  },

  setChokeGroup: (padId, group) => {
    const pad = get().drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    const oldGroup = pad.chokeGroup;

    const forward = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, chokeGroup: group } : p,
      ) } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, chokeGroup: oldGroup } : p,
      ) } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Set choke group for ${pad.label}`,
      timestamp: Date.now(),
    });
  },

  setPerformMode: (on) => {
    if (!on) {
      // H5: panicAll when leaving perform mode
      get().panicAll();
    }
    set({ isPerformMode: on });
  },

  setPadEditorOpen: (open) => set({ isPadEditorOpen: open }),

  resetDrumRack: () => {
    set({
      drumRack: createDefaultRack(),
      padStates: {},
      isPerformMode: false,
      isPadEditorOpen: false,
    });
  },

  loadDrumRack: (rack) => {
    // Validate and clamp ADSR values on load
    const pads = rack.pads.map((p) => ({
      ...p,
      envelope: clampADSR(p.envelope),
    }));
    set({
      drumRack: { ...rack, pads },
      padStates: {},
    });
    // Clear undo — pad IDs changed, old closures reference stale state
    useUndoStore.getState().clear();
    // Reconcile MIDI: clear padMidiNotes for pads that no longer exist
    const newPadIds = new Set(pads.map((p) => p.id));
    const midi = useMIDIStore.getState();
    const currentNotes = midi.getMIDIPersistData().padMidiNotes;
    let needsClean = false;
    for (const padId of Object.keys(currentNotes)) {
      if (!newPadIds.has(padId)) { needsClean = true; break; }
    }
    if (needsClean) {
      // Reset MIDI state — new rack may have different pad IDs
      useMIDIStore.getState().resetMIDI();
    }
  },

  getEnvelopeValues: (frameIndex) => {
    const { drumRack, padStates } = get();
    const values: Record<string, number> = {};
    // Collect phase transitions, apply in single set() after loop
    const phaseUpdates: Record<string, { phase: typeof padStates[string]['phase']; currentValue: number }> = {};

    for (const pad of drumRack.pads) {
      const state = padStates[pad.id];
      if (!state || state.phase === 'idle') continue;

      const result = computeADSR(pad.envelope, state, frameIndex);
      if (result.value > 0) {
        values[pad.id] = result.value;
      }

      if (result.phase !== state.phase) {
        phaseUpdates[pad.id] = { phase: result.phase, currentValue: result.value };
      }
    }

    // Single batched set() for all phase transitions
    if (Object.keys(phaseUpdates).length > 0) {
      const newStates = { ...get().padStates };
      for (const [padId, update] of Object.entries(phaseUpdates)) {
        newStates[padId] = { ...newStates[padId], ...update };
      }
      set({ padStates: newStates });
    }

    return values;
  },
}));
