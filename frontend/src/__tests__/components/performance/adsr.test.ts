import { describe, it, expect } from 'vitest';
import { computeADSR } from '../../../renderer/components/performance/computeADSR';
import type { ADSREnvelope, PadRuntimeState } from '../../../shared/types';
import { ADSR_PRESETS, DEFAULT_ADSR } from '../../../shared/constants';

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

describe('computeADSR', () => {
  // --- Phase transitions ---

  it('idle phase returns value 0', () => {
    const result = computeADSR(DEFAULT_ADSR, makeState({ phase: 'idle' }), 10);
    expect(result.value).toBe(0);
    expect(result.phase).toBe('idle');
  });

  it('attack phase ramps linearly from 0 to 1', () => {
    const env: ADSREnvelope = { attack: 10, decay: 0, sustain: 1.0, release: 0 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    const mid = computeADSR(env, state, 5);
    expect(mid.value).toBeCloseTo(0.5);
    expect(mid.phase).toBe('attack');

    const end = computeADSR(env, state, 10);
    // attack=10 complete at frame 10, decay=0 → instant sustain
    expect(end.phase).toBe('sustain');
  });

  it('decay phase ramps from 1 to sustain level', () => {
    const env: ADSREnvelope = { attack: 10, decay: 10, sustain: 0.5, release: 0 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    // At frame 15 (5 frames into decay)
    const mid = computeADSR(env, state, 15);
    expect(mid.value).toBeCloseTo(0.75); // 1.0 - (0.5 * 0.5) = 0.75
    expect(mid.phase).toBe('decay');
  });

  it('sustain phase holds at sustain level', () => {
    const env: ADSREnvelope = { attack: 5, decay: 5, sustain: 0.7, release: 10 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    const result = computeADSR(env, state, 100);
    expect(result.value).toBeCloseTo(0.7);
    expect(result.phase).toBe('sustain');
  });

  it('release phase ramps from releaseStartValue to 0', () => {
    const env: ADSREnvelope = { attack: 0, decay: 0, sustain: 1.0, release: 10 };
    const state = makeState({
      phase: 'release',
      triggerFrame: 0,
      releaseFrame: 100,
      releaseStartValue: 1.0,
    });

    const mid = computeADSR(env, state, 105);
    expect(mid.value).toBeCloseTo(0.5);
    expect(mid.phase).toBe('release');

    const end = computeADSR(env, state, 110);
    expect(end.value).toBe(0);
    expect(end.phase).toBe('idle');
  });

  // --- 0-frame transitions ---

  it('0-frame attack jumps instantly to peak', () => {
    const env: ADSREnvelope = { attack: 0, decay: 10, sustain: 0.5, release: 0 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    // Frame 0: attack=0 means we skip attack, enter decay
    const result = computeADSR(env, state, 0);
    expect(result.phase).toBe('decay');
  });

  it('0-frame release goes instantly to idle', () => {
    const env: ADSREnvelope = { attack: 0, decay: 0, sustain: 1.0, release: 0 };
    const state = makeState({
      phase: 'release',
      releaseFrame: 10,
      releaseStartValue: 1.0,
    });

    const result = computeADSR(env, state, 10);
    expect(result.value).toBe(0);
    expect(result.phase).toBe('idle');
  });

  it('instant envelope (0/0/1.0/0) goes to sustain immediately', () => {
    const state = makeState({ phase: 'attack', triggerFrame: 0 });
    const result = computeADSR(DEFAULT_ADSR, state, 0);
    expect(result.value).toBe(1.0);
    expect(result.phase).toBe('sustain');
  });

  // --- Release from mid-attack ---

  it('release from mid-attack uses partial ramp value', () => {
    const env: ADSREnvelope = { attack: 10, decay: 0, sustain: 1.0, release: 10 };
    // Triggered at frame 0, released at frame 5 (mid-attack, value ~0.5)
    const state = makeState({
      phase: 'release',
      triggerFrame: 0,
      releaseFrame: 5,
      releaseStartValue: 0.5,
    });

    const mid = computeADSR(env, state, 10);
    expect(mid.value).toBeCloseTo(0.25); // 0.5 * (1 - 0.5)
    expect(mid.phase).toBe('release');
  });

  // --- Presets ---

  it('pluck preset produces expected attack phase', () => {
    const env = ADSR_PRESETS.pluck;
    const state = makeState({ phase: 'attack', triggerFrame: 0 });
    const result = computeADSR(env, state, 0.15);
    expect(result.value).toBeCloseTo(0.5);
    expect(result.phase).toBe('attack');
  });

  it('stab preset has 0 sustain', () => {
    const env = ADSR_PRESETS.stab;
    const state = makeState({ phase: 'attack', triggerFrame: 0 });
    // Well past attack+decay
    const result = computeADSR(env, state, 100);
    expect(result.value).toBe(0);
    expect(result.phase).toBe('sustain');
  });

  it('sustain preset has long attack', () => {
    const env = ADSR_PRESETS.sustain;
    const state = makeState({ phase: 'attack', triggerFrame: 0 });
    const result = computeADSR(env, state, 7.5);
    expect(result.value).toBeCloseTo(0.5);
    expect(result.phase).toBe('attack');
  });

  it('pad preset has very long attack', () => {
    const env = ADSR_PRESETS.pad;
    const state = makeState({ phase: 'attack', triggerFrame: 0 });
    const result = computeADSR(env, state, 30);
    expect(result.value).toBeCloseTo(0.5);
    expect(result.phase).toBe('attack');
  });

  // --- Edge cases ---

  it('negative frame delta returns value 0', () => {
    const env: ADSREnvelope = { attack: 10, decay: 10, sustain: 0.5, release: 10 };
    const state = makeState({ phase: 'attack', triggerFrame: 100 });

    const result = computeADSR(env, state, 50);
    expect(result.value).toBe(0);
    expect(result.phase).toBe('idle');
  });

  it('same-frame trigger+release returns idle', () => {
    const env: ADSREnvelope = { attack: 0, decay: 0, sustain: 1.0, release: 0 };
    const state = makeState({
      phase: 'release',
      triggerFrame: 10,
      releaseFrame: 10,
      releaseStartValue: 1.0,
    });

    const result = computeADSR(env, state, 10);
    expect(result.value).toBe(0);
    expect(result.phase).toBe('idle');
  });

  // --- C2: NaN/Infinity guards ---

  it('NaN envelope values return 0', () => {
    const env: ADSREnvelope = { attack: NaN, decay: NaN, sustain: NaN, release: NaN };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    const result = computeADSR(env, state, 5);
    // NaN attack → treated as 0 → instant attack → sustain (NaN sustain → 0)
    expect(result.value).toBe(0);
    expect(Number.isFinite(result.value)).toBe(true);
  });

  it('Infinity envelope values return finite result', () => {
    const env: ADSREnvelope = { attack: Infinity, decay: 0, sustain: 1.0, release: 0 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    const result = computeADSR(env, state, 5);
    expect(Number.isFinite(result.value)).toBe(true);
  });

  it('negative attack/decay/release treated as 0', () => {
    const env: ADSREnvelope = { attack: -5, decay: -5, sustain: 0.8, release: -5 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    const result = computeADSR(env, state, 0);
    expect(result.value).toBeCloseTo(0.8);
    expect(result.phase).toBe('sustain');
  });

  it('sustain > 1 clamped to 1', () => {
    const env: ADSREnvelope = { attack: 0, decay: 0, sustain: 5.0, release: 0 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    const result = computeADSR(env, state, 0);
    expect(result.value).toBe(1.0);
  });

  it('sustain < 0 clamped to 0', () => {
    const env: ADSREnvelope = { attack: 0, decay: 0, sustain: -1.0, release: 0 };
    const state = makeState({ phase: 'attack', triggerFrame: 0 });

    const result = computeADSR(env, state, 0);
    expect(result.value).toBe(0);
  });
});
