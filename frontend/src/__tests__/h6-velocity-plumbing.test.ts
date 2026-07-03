/**
 * H6 — velocity plumbing.
 *
 * Chain under test: handleMIDIMessage (stores/midi.ts) → handlePadTrigger /
 * triggerPadWithCapture (components/performance/padActions.ts) →
 * usePerformanceStore.triggerPad (stores/performance.ts) →
 * PadRuntimeState.velocity → computeADSR envelope-peak scaling
 * (components/performance/computeADSR.ts) → applyPadModulations (the live
 * "performance/instrument layer" consumer, App.tsx's modulateChain) — and,
 * when a trackId is supplied, TriggerEvent.velocity (voiceFSM.ts /
 * project-persistence.ts / export payload).
 *
 * Before H6: midi.ts read the note-on velocity byte (byte2) but discarded
 * it — triggerPad always hardcoded velocity to 127 regardless of how hard
 * the pad was hit. This file asserts velocity V now propagates through
 * (not clamped to a constant), while keyboard/mouse triggers (no velocity
 * source) remain byte-identical to pre-H6 behavior (default 127).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useMIDIStore } from '../renderer/stores/midi';
import { usePerformanceStore } from '../renderer/stores/performance';
import { useUndoStore } from '../renderer/stores/undo';
import { computeADSR, sanitizeVelocity } from '../renderer/components/performance/computeADSR';
import { handlePadTrigger } from '../renderer/components/performance/padActions';
import type { ADSREnvelope, PadRuntimeState } from '../shared/types';

function resetStores() {
  useMIDIStore.getState().resetMIDI();
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
  useMIDIStore.setState({ devices: [], activeDeviceId: null, isSupported: true });
}

/** Build a 3-byte MIDI note-on message. */
function noteOn(note: number, velocity: number): Uint8Array {
  return new Uint8Array([0x90, note, velocity]);
}

function setPadDirect(padId: string, updates: Record<string, unknown>) {
  const { drumRack } = usePerformanceStore.getState();
  const idx = drumRack.pads.findIndex((p) => p.id === padId);
  if (idx === -1) throw new Error(`Pad ${padId} not found`);
  const pads = [...drumRack.pads];
  pads[idx] = { ...pads[idx], ...updates };
  usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });
}

function makeState(overrides: Partial<PadRuntimeState> = {}): PadRuntimeState {
  return {
    phase: 'attack',
    triggerFrame: 0,
    releaseFrame: 0,
    currentValue: 0,
    releaseStartValue: 0,
    ...overrides,
  };
}

describe('H6 — MIDI note-on velocity propagates to the pad-trigger path', () => {
  beforeEach(resetStores);

  it('noteOn with velocity V propagates V to padStates (not clamped to a constant)', () => {
    setPadDirect('pad-0', { midiNote: 60 });

    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 42), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].velocity).toBe(42);

    usePerformanceStore.getState().resetDrumRack();
    setPadDirect('pad-0', { midiNote: 60 });

    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].velocity).toBe(100);
  });

  it('a soft hit (low velocity) and a hard hit (velocity 127) produce DIFFERENT padStates.velocity — proves it is not hardcoded', () => {
    setPadDirect('pad-0', { midiNote: 60 });
    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 5), 0);
    const soft = usePerformanceStore.getState().padStates['pad-0'].velocity;

    usePerformanceStore.getState().resetDrumRack();
    setPadDirect('pad-0', { midiNote: 60 });
    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 127), 0);
    const hard = usePerformanceStore.getState().padStates['pad-0'].velocity;

    expect(soft).toBe(5);
    expect(hard).toBe(127);
    expect(soft).not.toBe(hard);
  });

  it('handlePadTrigger threads an explicit velocity through triggerPad (direct unit path, mirrors midi.ts call site)', () => {
    const perfStore = usePerformanceStore.getState();
    const pad = perfStore.drumRack.pads[0];

    handlePadTrigger(pad, perfStore, 0, 'midi', 77);

    expect(usePerformanceStore.getState().padStates[pad.id].velocity).toBe(77);
  });

  it('keyboard/mouse triggers (no velocity source) default to 127 — byte-identical to pre-H6 behavior', () => {
    const perfStore = usePerformanceStore.getState();
    const pad = perfStore.drumRack.pads[0];

    // No velocity arg — mirrors App.tsx's keyboard handler call site exactly.
    handlePadTrigger(pad, perfStore, 0, 'keyboard');

    expect(usePerformanceStore.getState().padStates[pad.id].velocity).toBe(127);
  });

  it('triggerPad(trackId, velocity) stamps the SAME real velocity onto TriggerEvent.velocity (was hardcoded 127)', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 10, 'track-h6', 33);

    const events = usePerformanceStore.getState().trackEvents['track-h6'];
    expect(events).toHaveLength(1);
    expect(events[0].velocity).toBe(33);
    expect(events[0].velocity).not.toBe(127);
  });

  it('triggerPad without a velocity arg still defaults TriggerEvent.velocity to 127 (regression-safe for existing callers)', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 10, 'track-h6');

    const events = usePerformanceStore.getState().trackEvents['track-h6'];
    expect(events[0].velocity).toBe(127);
  });

  it('an out-of-range velocity byte (>127) is clamped, not passed through raw', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 10, 'track-h6', 999);
    const events = usePerformanceStore.getState().trackEvents['track-h6'];
    expect(events[0].velocity).toBe(127);
  });

  it('note-off (velocity 0) is NOT treated as a note-on trigger — MIDI spec semantics preserved', () => {
    setPadDirect('pad-0', { midiNote: 60, mode: 'gate' });
    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 100), 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');

    // velocity=0 note-on == note-off per MIDI convention; existing branch
    // (statusByte===0x90 && byte2===0) routes to release, untouched by H6.
    useMIDIStore.getState().handleMIDIMessage(noteOn(60, 0), 5);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('release');
  });
});

describe('H6 — velocity scales computeADSR envelope-peak intensity (the live modulation consumer)', () => {
  const env: ADSREnvelope = { attack: 0, decay: 0, sustain: 1.0, release: 0 };

  it('full velocity (127) reaches peak 1.0 — unchanged from pre-H6 behavior', () => {
    const state = makeState({ phase: 'attack', triggerFrame: 0, velocity: 127 });
    const result = computeADSR(env, state, 0);
    expect(result.value).toBe(1);
  });

  it('half velocity (~64) reaches roughly half peak intensity', () => {
    const state = makeState({ phase: 'attack', triggerFrame: 0, velocity: 64 });
    const result = computeADSR(env, state, 0);
    expect(result.value).toBeCloseTo(64 / 127, 5);
  });

  it('a soft hit (velocity 10) and a hard hit (velocity 127) produce different envelope peaks', () => {
    const soft = computeADSR(env, makeState({ phase: 'attack', triggerFrame: 0, velocity: 10 }), 0);
    const hard = computeADSR(env, makeState({ phase: 'attack', triggerFrame: 0, velocity: 127 }), 0);
    expect(soft.value).toBeLessThan(hard.value);
    expect(soft.value).toBeCloseTo(10 / 127, 5);
  });

  it('missing velocity (legacy padStates predating H6) defaults to full intensity — no regression', () => {
    const state = makeState({ phase: 'attack', triggerFrame: 0 }); // velocity omitted
    const result = computeADSR(env, state, 0);
    expect(result.value).toBe(1);
  });

  it('release phase does NOT re-apply velocity scaling (releaseStartValue is already scaled)', () => {
    const releaseEnv: ADSREnvelope = { attack: 0, decay: 0, sustain: 1.0, release: 10 };
    // releaseStartValue simulates a soft-hit voice already at half intensity;
    // velocity on the release-phase state must not scale it a second time.
    const state = makeState({
      phase: 'release',
      triggerFrame: 0,
      releaseFrame: 0,
      releaseStartValue: 0.5,
      velocity: 64,
    });
    const result = computeADSR(releaseEnv, state, 5);
    expect(result.value).toBeCloseTo(0.25, 5); // 0.5 * (1 - 5/10), NOT further scaled by 64/127
  });
});

describe('H6 — sanitizeVelocity trust boundary', () => {
  it('undefined → 127 (full intensity default)', () => {
    expect(sanitizeVelocity(undefined)).toBe(127);
  });

  it('NaN/Infinity → 127', () => {
    expect(sanitizeVelocity(NaN)).toBe(127);
    expect(sanitizeVelocity(Infinity)).toBe(127);
  });

  it('negative → 0 (not treated as "unset")', () => {
    expect(sanitizeVelocity(-5)).toBe(0);
  });

  it('> 127 → clamped to 127', () => {
    expect(sanitizeVelocity(500)).toBe(127);
  });

  it('valid mid-range values pass through unchanged', () => {
    expect(sanitizeVelocity(1)).toBe(1);
    expect(sanitizeVelocity(64)).toBe(64);
    expect(sanitizeVelocity(127)).toBe(127);
  });
});
