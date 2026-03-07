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
    const padIndex = drumRack.pads.findIndex((p) => p.id === padId);
    if (padIndex === -1) return;

    const oldPad = drumRack.pads[padIndex];
    const newEnvelope = updates.envelope
      ? clampADSR(updates.envelope)
      : oldPad.envelope;

    const newPad = { ...oldPad, ...updates, envelope: newEnvelope };

    const forward = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = newPad;
      set({ drumRack: { ...current, pads } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = oldPad;
      set({ drumRack: { ...current, pads } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Update pad ${oldPad.label}`,
      timestamp: Date.now(),
    });
  },

  addPadMapping: (padId, mapping) => {
    const { drumRack } = get();
    const padIndex = drumRack.pads.findIndex((p) => p.id === padId);
    if (padIndex === -1) return;

    const oldMappings = [...drumRack.pads[padIndex].mappings];
    const newMappings = [...oldMappings, mapping];

    const forward = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = { ...pads[padIndex], mappings: newMappings };
      set({ drumRack: { ...current, pads } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = { ...pads[padIndex], mappings: oldMappings };
      set({ drumRack: { ...current, pads } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Add mapping to ${drumRack.pads[padIndex].label}`,
      timestamp: Date.now(),
    });
  },

  removePadMapping: (padId, index) => {
    const { drumRack } = get();
    const padIndex = drumRack.pads.findIndex((p) => p.id === padId);
    if (padIndex === -1) return;

    const oldMappings = [...drumRack.pads[padIndex].mappings];
    if (index < 0 || index >= oldMappings.length) return;
    const newMappings = oldMappings.filter((_, i) => i !== index);

    const forward = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = { ...pads[padIndex], mappings: newMappings };
      set({ drumRack: { ...current, pads } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = { ...pads[padIndex], mappings: oldMappings };
      set({ drumRack: { ...current, pads } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Remove mapping from ${drumRack.pads[padIndex].label}`,
      timestamp: Date.now(),
    });
  },

  setPadKeyBinding: (padId, key) => {
    if (key !== null && RESERVED_KEYS.has(key)) return;

    const { drumRack } = get();
    const padIndex = drumRack.pads.findIndex((p) => p.id === padId);
    if (padIndex === -1) return;

    const oldKey = drumRack.pads[padIndex].keyBinding;

    // H4: Steal binding from old pad if duplicate
    let stolenFromIndex = -1;
    let stolenOldKey: string | null = null;
    if (key !== null) {
      stolenFromIndex = drumRack.pads.findIndex(
        (p) => p.id !== padId && p.keyBinding === key,
      );
      if (stolenFromIndex !== -1) {
        stolenOldKey = drumRack.pads[stolenFromIndex].keyBinding;
      }
    }

    const forward = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      if (stolenFromIndex !== -1) {
        pads[stolenFromIndex] = { ...pads[stolenFromIndex], keyBinding: null };
      }
      pads[padIndex] = { ...pads[padIndex], keyBinding: key };
      set({ drumRack: { ...current, pads } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = { ...pads[padIndex], keyBinding: oldKey };
      if (stolenFromIndex !== -1) {
        pads[stolenFromIndex] = {
          ...pads[stolenFromIndex],
          keyBinding: stolenOldKey,
        };
      }
      set({ drumRack: { ...current, pads } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Set key binding for ${drumRack.pads[padIndex].label}`,
      timestamp: Date.now(),
    });
  },

  setChokeGroup: (padId, group) => {
    const { drumRack } = get();
    const padIndex = drumRack.pads.findIndex((p) => p.id === padId);
    if (padIndex === -1) return;

    const oldGroup = drumRack.pads[padIndex].chokeGroup;

    const forward = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = { ...pads[padIndex], chokeGroup: group };
      set({ drumRack: { ...current, pads } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      const pads = [...current.pads];
      pads[padIndex] = { ...pads[padIndex], chokeGroup: oldGroup };
      set({ drumRack: { ...current, pads } });
    };

    useUndoStore.getState().execute({
      forward,
      inverse,
      description: `Set choke group for ${drumRack.pads[padIndex].label}`,
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
  },

  getEnvelopeValues: (frameIndex) => {
    const { drumRack, padStates } = get();
    const values: Record<string, number> = {};

    for (const pad of drumRack.pads) {
      const state = padStates[pad.id];
      if (!state || state.phase === 'idle') continue;

      const result = computeADSR(pad.envelope, state, frameIndex);
      if (result.value > 0) {
        values[pad.id] = result.value;
      }

      // Update phase in store if it changed (e.g., release → idle)
      if (result.phase !== state.phase) {
        const newStates = { ...get().padStates };
        newStates[pad.id] = {
          ...state,
          phase: result.phase,
          currentValue: result.value,
        };
        set({ padStates: newStates });
      }
    }

    return values;
  },
}));
