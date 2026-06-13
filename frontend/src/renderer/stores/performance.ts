/**
 * Performance store — pad grid, ADSR envelopes, choke groups.
 * All pad evaluation happens frontend-only. Backend receives modulated chains.
 *
 * P5a.3: modal perform-mode flag RETIRED — pads are armed whenever a performance
 * track is selected in the timeline. Use `useTimelineStore` selectedTrackId + track
 * type to determine arming status. Per-track TriggerEvents are appended here
 * and consumed by the render path in App.tsx via evaluateVoices (voiceFSM.ts).
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
import { useUndoStore, undoable } from './undo';
import { useMIDIStore } from './midi';
import type { TriggerEvent } from '../components/instruments/voiceFSM';

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
    modRoutes: [],
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

/** Monotonic event index counter — increments per append, unique within a session. */
let _eventIndex = 0;

interface PerformanceState {
  drumRack: DrumRack;
  isPadEditorOpen: boolean;
  padStates: Record<string, PadRuntimeState>;
  /**
   * P5a.3: per-performance-track event log.
   * trackId → array of TriggerEvents, in append order (ascending eventIndex).
   * Consumed by evaluateVoices in the App.tsx render effect.
   * Old saves do NOT have this field — loads cleanly as undefined → defaults to {}.
   */
  trackEvents: Record<string, TriggerEvent[]>;

  // Pad trigger actions
  triggerPad: (padId: string, frameIndex: number, trackId?: string) => void;
  /**
   * B4-editor — trigger a Sample Rack pad. Writes a TriggerEvent to
   * `trackEvents['${trackId}:${padId}']` (the COMPOSITE key the rack render path
   * reads in App.tsx — buildRackLayers reads `trackEvents[\`${trackId}:${padId}\`]`).
   * Event shape is identical to triggerPad's, with `instrumentId='${trackId}:${padId}'`.
   * This is the missing UI→render link that makes a rack pad audible.
   *
   * B4-choke — when `chokeGroup` is a non-null int AND `chokeSiblingPadIds` is a
   * non-empty array, this:
   *   (1) STAMPS the triggered pad's own trigger event with `chokeGroup` (so the
   *       voice carries `_chokeGroup` — frontend voiceFSM ~315 and backend
   *       voice_replay.py ~305-308 both read it onto the voice); and
   *   (2) writes a silencing `kind:'choke'` event (carrying that same `chokeGroup`
   *       + `instrumentId='${trackId}:${siblingId}'`) into EACH sibling pad's
   *       composite-key stream (`trackEvents['${trackId}:${siblingId}']`) at the
   *       SAME `frameIndex`.
   *
   * Because buildRackLayers evaluates each pad's stream INDEPENDENTLY
   * (evaluateVoices per pad), a 'choke' event in a sibling's isolated single-pad
   * stream idles that sibling's active voice atomically at the trigger frame
   * (T8 — voiceFSM matches voices by `_chokeGroup === group`). This is the
   * per-pad-stream analogue of the drumRack choke-on-trigger.
   *
   * Why 'choke' not 'panic': the backend buckets 'panic' GLOBALLY
   * (export.py ~1212/1319: `... or kind=='panic'`), so a synthetic panic written
   * into a sibling stream would over-choke EVERY pad and EVERY per-track sampler
   * in EXPORT. 'choke' is bucketed PER-INSTRUMENTID (no global clause), so a choke
   * stamped with the sibling's composite key reaches ONLY that sibling's bucket —
   * correct in BOTH preview and export, with ZERO backend changes.
   *
   * Decoupling: the rack model (pad chokeGroups) lives in the instruments store;
   * THIS store does not import it. The COMPONENT (RackDevice) resolves the group +
   * sibling ids and passes them in. Omitting them (or a null group / empty array)
   * = today's behavior exactly (regression-safe).
   *
   * B5.3 — `branchPath` (the INDEX-based `bN_`-joined path from
   * `rackEditPathToBranchPath`) makes a NESTED branch-child pad fire in LIVE
   * PREVIEW. When non-empty, the composite key (and each sibling's choke key) is
   * PATH-PREFIXED — `${trackId}:${branchPath}_${padId}` — matching the key the
   * preview render path reads (App.tsx gatherPadEvents →
   * `padEventKey(branchPath, pad.id)` → buildRackLayers). The triggered event's
   * `instrumentId` carries that SAME prefixed key so evaluateVoices matches it.
   * OMITTED / EMPTY branchPath → the bare `${trackId}:${padId}` key, BYTE-IDENTICAL
   * to B4/B5.1/B5.2 (flat trigger unchanged).
   */
  triggerRackPad: (
    trackId: string,
    padId: string,
    frameIndex: number,
    chokeSiblingPadIds?: string[],
    chokeGroup?: number | null,
    branchPath?: string,
  ) => void;
  /**
   * B4-pad-delete — clear a deleted rack pad's trigger events. Immutably removes
   * the composite key `${trackId}:${padId}` from `trackEvents` so a deleted pad
   * leaves no orphaned events. The symmetric counterpart to triggerRackPad's
   * composite-key write; called by RackDevice alongside removeRackPad. No-op if
   * the key is absent.
   */
  clearRackPadEvents: (trackId: string, padId: string) => void;
  releasePad: (padId: string, frameIndex: number, trackId?: string) => void;
  forceOffPad: (padId: string) => void;
  panicAll: () => void;

  // Config actions (undo-integrated)
  updatePad: (padId: string, updates: Partial<Pad>) => void;
  addPadMapping: (padId: string, mapping: ModulationRoute) => void;
  removePadMapping: (padId: string, index: number) => void;
  setPadKeyBinding: (padId: string, key: string | null) => void;
  setChokeGroup: (padId: string, group: number | null) => void;

  // Mode actions (modal-flag approach retired in P5a.3 — arming is by track selection)
  setPadEditorOpen: (open: boolean) => void;

  // Lifecycle
  resetDrumRack: () => void;
  loadDrumRack: (rack: DrumRack) => void;

  // Envelope evaluation
  getEnvelopeValues: (frameIndex: number) => Record<string, number>;
}

export const usePerformanceStore = create<PerformanceState>((set, get) => ({
  drumRack: createDefaultRack(),
  isPadEditorOpen: false,
  padStates: {},
  trackEvents: {},

  triggerPad: (padId, frameIndex, trackId) => {
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

    // P5a.3: append TriggerEvent to the owning track's event log.
    // Non-finite frameIndex is dropped (trust boundary — numeric guard).
    const updates: Partial<PerformanceState> = { padStates: newStates };
    if (trackId && Number.isFinite(frameIndex) && frameIndex >= 0) {
      const idx = _eventIndex++;
      const ev: TriggerEvent = {
        frameIndex: Math.round(frameIndex),
        eventIndex: idx,
        note: 60, // default MIDI note; extended in P5a.8
        velocity: 127,
        kind: 'trigger',
        instrumentId: trackId,
      };
      const existing = get().trackEvents[trackId] ?? [];
      updates.trackEvents = { ...get().trackEvents, [trackId]: [...existing, ev] };
    }

    set(updates);
  },

  triggerRackPad: (trackId, padId, frameIndex, chokeSiblingPadIds, chokeGroup, branchPath) => {
    // B4-editor — composite key the rack render path consumes (App.tsx:1131).
    // Non-finite / negative frameIndex is dropped (trust boundary — numeric guard,
    // mirrors triggerPad). No drumRack lookup: a rack pad is NOT a drumRack pad.
    if (!trackId || !padId) return;
    if (!Number.isFinite(frameIndex) || frameIndex < 0) return;
    const frame = Math.round(frameIndex);
    // B5.3 — for a NESTED branch-child pad the render reads the PATH-PREFIXED key
    // `${trackId}:${branchPath}_${padId}` (gatherPadEvents → padEventKey). The pad
    // portion of the key is the branch path joined to the pad id; siblings use the
    // SAME prefix. EMPTY / undefined branchPath → bare `padId` (B4 byte-identical).
    const prefix = branchPath ? `${branchPath}_` : '';
    const padKey = `${prefix}${padId}`;
    const key = `${trackId}:${padKey}`;

    // B4-choke — a valid choke group is a finite int (the component passes the
    // triggered pad's chokeGroup; null/undefined → no choke). When present it is
    // (a) STAMPED onto the triggered pad's own trigger event so the voice carries
    // `_chokeGroup`, and (b) carried on each sibling's silencing 'choke' event.
    const hasGroup =
      chokeGroup != null && Number.isInteger(chokeGroup);

    const ev: TriggerEvent = {
      frameIndex: frame,
      eventIndex: _eventIndex++,
      note: 60, // default MIDI note (mirrors triggerPad)
      velocity: 127,
      kind: 'trigger',
      instrumentId: key, // '${trackId}:${padId}' — matches evaluateVoices' instrumentId
      // Stamp the group so the triggered voice carries `_chokeGroup` (voiceFSM ~315
      // / voice_replay.py ~305-308). Without this, a later 'choke' couldn't match.
      ...(hasGroup ? { chokeGroup: chokeGroup as number } : {}),
    };

    // Build the next trackEvents immutably. Start with the triggered pad's append.
    const current = get().trackEvents;
    const existing = current[key] ?? [];
    const next: Record<string, TriggerEvent[]> = {
      ...current,
      [key]: [...existing, ev],
    };

    // B4-choke — silence each SIBLING pad at the SAME frame. Each sibling has its
    // OWN composite-key stream which buildRackLayers evaluates independently, so a
    // 'choke' event (carrying the group + the sibling's own instrumentId) in that
    // isolated single-pad stream idles the sibling's active voice atomically (T8 —
    // voiceFSM matches `_chokeGroup === group`). We use 'choke' (NOT 'panic')
    // because the backend buckets 'panic' GLOBALLY but 'choke' PER-INSTRUMENTID:
    // a panic written here would over-choke every pad + every sampler in EXPORT,
    // whereas a choke stamped with the sibling's key reaches only that bucket.
    // Default (no group / no siblings) = today's behavior exactly (regression-safe).
    if (hasGroup && Array.isArray(chokeSiblingPadIds)) {
      for (const siblingId of chokeSiblingPadIds) {
        // Skip falsy / self ids (defensive — the component already excludes self).
        if (!siblingId || siblingId === padId) continue;
        // B5.3 — siblings at the SAME nested level share the branch prefix so the
        // silencing 'choke' lands under each sibling's path-prefixed stream.
        const siblingKey = `${trackId}:${prefix}${siblingId}`;
        const silence: TriggerEvent = {
          frameIndex: frame,
          eventIndex: _eventIndex++,
          note: 60,
          velocity: 0,
          kind: 'choke',
          instrumentId: siblingKey, // per-instrumentId bucketing → reaches only this sibling
          chokeGroup: chokeGroup as number,
        };
        const sibExisting = next[siblingKey] ?? current[siblingKey] ?? [];
        next[siblingKey] = [...sibExisting, silence];
      }
    }

    set({ trackEvents: next });
  },

  clearRackPadEvents: (trackId, padId) => {
    // B4-pad-delete — symmetric cleanup: drop the deleted pad's composite-key
    // event log. No-op (and no re-render) when the key is absent.
    if (!trackId || !padId) return;
    const key = `${trackId}:${padId}`;
    const events = get().trackEvents;
    if (!(key in events)) return;
    const next = { ...events };
    delete next[key];
    set({ trackEvents: next });
  },

  releasePad: (padId, frameIndex, trackId) => {
    const { padStates, drumRack } = get();
    const state = padStates[padId];
    if (!state || state.phase === 'idle' || state.phase === 'release') return;

    const pad = drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    // Compute current value at release moment
    const currentResult = computeADSR(pad.envelope, state, frameIndex);

    const newPadStates = {
      ...padStates,
      [padId]: {
        ...state,
        phase: 'release' as const,
        releaseFrame: frameIndex,
        releaseStartValue: currentResult.value,
      },
    };

    // P5a.3: append release TriggerEvent to the owning track's event log.
    const updates: Partial<PerformanceState> = { padStates: newPadStates };
    if (trackId && Number.isFinite(frameIndex) && frameIndex >= 0) {
      const idx = _eventIndex++;
      const ev: TriggerEvent = {
        frameIndex: Math.round(frameIndex),
        eventIndex: idx,
        note: 60,
        velocity: 0,
        kind: 'release',
        instrumentId: trackId,
      };
      const existing = get().trackEvents[trackId] ?? [];
      updates.trackEvents = { ...get().trackEvents, [trackId]: [...existing, ev] };
    }

    set(updates);
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
    set({ padStates: {}, trackEvents: {} });
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

    undoable(`Update pad ${oldPad.label}`, forward, inverse);
  },

  addPadMapping: (padId, mapping) => {
    const pad = get().drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    const oldMappings = [...pad.modRoutes];
    const newMappings = [...oldMappings, mapping];

    const forward = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, modRoutes: newMappings } : p,
      ) } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, modRoutes: oldMappings } : p,
      ) } });
    };

    undoable(`Add mapping to ${pad.label}`, forward, inverse);
  },

  removePadMapping: (padId, index) => {
    const pad = get().drumRack.pads.find((p) => p.id === padId);
    if (!pad) return;

    const oldMappings = [...pad.modRoutes];
    if (index < 0 || index >= oldMappings.length) return;
    const newMappings = oldMappings.filter((_, i) => i !== index);

    const forward = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, modRoutes: newMappings } : p,
      ) } });
    };

    const inverse = () => {
      const { drumRack: current } = get();
      set({ drumRack: { ...current, pads: current.pads.map((p) =>
        p.id === padId ? { ...p, modRoutes: oldMappings } : p,
      ) } });
    };

    undoable(`Remove mapping from ${pad.label}`, forward, inverse);
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

    undoable(`Set key binding for ${pad.label}`, forward, inverse);
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

    undoable(`Set choke group for ${pad.label}`, forward, inverse);
  },

  setPadEditorOpen: (open) => set({ isPadEditorOpen: open }),

  resetDrumRack: () => {
    set({
      drumRack: createDefaultRack(),
      padStates: {},
      isPadEditorOpen: false,
      trackEvents: {},
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
      trackEvents: {},
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
