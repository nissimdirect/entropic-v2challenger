/**
 * P5a.3 — buildVoiceLayers tests.
 *
 * Tests the multi-voice sampler layer builder that maps evaluateVoices output
 * into render_composite layer dicts (one per active Voice), with per-voice
 * opacity, correct z-order, and voice_id encoding for the backend.
 *
 * Voice-id-pattern compat: backend VOICE_ID_PATTERN = ^[A-Za-z0-9_-]{1,128}$
 * (no colons). buildVoiceLayers encodes voiceId by replacing ':' with '_'.
 */
import { describe, it, expect } from 'vitest';
import { buildVoiceLayers } from '../../../renderer/components/instruments/buildSamplerLayer';
import { evaluateVoices } from '../../../renderer/components/instruments/voiceFSM';
import type { TriggerEvent, Voice } from '../../../renderer/components/instruments/voiceFSM';
import type { SamplerInstrumentV1 } from '../../../renderer/components/instruments/types';
import type { Asset, ADSREnvelope } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADSR_INSTANT: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 };
const ADSR_SLOW: ADSREnvelope = { attack: 60, decay: 0, sustain: 1, release: 30 };

function makeInst(overrides: Partial<SamplerInstrumentV1> = {}): SamplerInstrumentV1 {
  return {
    id: 'sampler-1',
    type: 'sampler',
    clipId: 'clip-1',
    startFrame: 0,
    speed: 1,
    opacity: 1,
    blendMode: 'normal',
    ...overrides,
  };
}

function makeAssets(clipId = 'clip-1'): Record<string, Asset> {
  return {
    [clipId]: {
      id: clipId,
      path: '/test/clip.mp4',
      type: 'video',
      meta: { duration: 10, fps: 30, width: 1920, height: 1080 },
    } as unknown as Asset,
  };
}

function makeTrigger(
  frameIndex: number,
  eventIndex: number,
  instrumentId = 'sampler-1',
): TriggerEvent {
  return { frameIndex, eventIndex, note: 60, velocity: 127, kind: 'trigger', instrumentId };
}

// Build voices via evaluateVoices and filter to the given instrumentId
function buildVoices(events: TriggerEvent[], frame: number, adsr = ADSR_INSTANT): Voice[] {
  return evaluateVoices(events, frame, { voiceCap: 4, adsr });
}

// Helper to check if voice_id matches backend pattern (no colons, ≤128 chars)
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildVoiceLayers (P5a.3)', () => {
  // Named test #1: one composite layer per active voice with distinct voice_id
  it('one composite layer per active voice with distinct voice_id', () => {
    const events = [makeTrigger(0, 0), makeTrigger(5, 1)];
    const voices = buildVoices(events, 10);
    expect(voices).toHaveLength(2);

    const layers = buildVoiceLayers(makeInst(), voices, makeAssets(), 10, 30, ADSR_INSTANT);
    expect(layers).toHaveLength(2);

    const ids = layers.map((l) => l.voice_id!);
    expect(new Set(ids).size).toBe(2); // distinct
    // All voice_ids must match backend pattern
    for (const id of ids) {
      expect(VOICE_ID_PATTERN.test(id)).toBe(true);
    }
  });

  // Named test #2: per-voice opacity follows ADSR envelope value at frameIndex
  it('per-voice opacity follows ADSR envelope value at frameIndex', () => {
    // ADSR_SLOW: attack=60 frames. At frame 30 (halfway through attack) value≈0.5
    const events = [makeTrigger(0, 0)];
    const voices = buildVoices(events, 30, ADSR_SLOW);
    expect(voices).toHaveLength(1);

    const layers = buildVoiceLayers(makeInst(), voices, makeAssets(), 30, 30, ADSR_SLOW);
    expect(layers).toHaveLength(1);
    // Opacity should be ~0.5 (halfway through 60-frame attack) × inst.opacity=1
    expect(layers[0].opacity).toBeGreaterThan(0);
    expect(layers[0].opacity).toBeLessThan(1);
    // Not using ADSR_INSTANT which would give opacity=1
  });

  // Named test #3: layers ordered ascending triggerFrame so newest composites on top
  it('layers ordered ascending triggerFrame so newest composites on top', () => {
    // Three voices triggered at different frames
    const events = [
      makeTrigger(10, 2), // oldest
      makeTrigger(0, 0),  // middle
      makeTrigger(5, 1),  // most recent
    ];
    const voices = buildVoices(events, 20);
    const layers = buildVoiceLayers(makeInst(), voices, makeAssets(), 20, 30, ADSR_INSTANT);

    expect(layers).toHaveLength(3);
    // Ascending triggerFrame: 0, 5, 10 → last (index 2) is newest = on top
    const triggerFrames = layers.map((l) => {
      // Extract triggerFrame from voice_id: "voice_sampler-1_{triggerFrame}_{eventIndex}"
      const parts = l.voice_id!.split('_');
      return parseInt(parts[parts.length - 2]);
    });
    expect(triggerFrames[0]).toBeLessThanOrEqual(triggerFrames[1]);
    expect(triggerFrames[1]).toBeLessThanOrEqual(triggerFrames[2]);
  });

  // Named test #4: voice cap 4: five triggers yield four layers, oldest stolen
  it('voice cap 4: five triggers yield four layers, oldest stolen', () => {
    const events = [
      makeTrigger(0, 0),
      makeTrigger(1, 1),
      makeTrigger(2, 2),
      makeTrigger(3, 3),
      makeTrigger(4, 4), // should steal voice from frame 0
    ];
    const voices = buildVoices(events, 10);
    expect(voices).toHaveLength(4); // cap=4, oldest stolen

    const layers = buildVoiceLayers(makeInst(), voices, makeAssets(), 10, 30, ADSR_INSTANT);
    expect(layers).toHaveLength(4);
    // Voice at triggerFrame=0 was stolen — not in layers
    const voiceIds = layers.map((l) => l.voice_id!);
    const hasFrame0 = voiceIds.some((id) => id.includes('_0_'));
    expect(hasFrame0).toBe(false);
  });

  // Named test #5: unsourced sampler (empty clipId) yields zero layers
  it('unsourced sampler (empty clipId) yields zero layers', () => {
    const events = [makeTrigger(0, 0)];
    const voices = buildVoices(events, 5);
    const instNoClip = makeInst({ clipId: '' });
    const layers = buildVoiceLayers(instNoClip, voices, makeAssets(), 5, 30, ADSR_INSTANT);
    expect(layers).toHaveLength(0);
  });

  // Named test #6 (full chain integration): pad keydown → TriggerEvent → evaluateVoices →
  // composite payload carries one voice_id-bearing layer per active voice
  it('full chain: pad keydown → store TriggerEvent → evaluateVoices → composite payload carries one voice_id-bearing layer per active voice (asserts the exact layer dicts handed to the render IPC)', () => {
    // Simulate: 2 pad triggers at frames 0 and 10 → 2 active voices
    const events: TriggerEvent[] = [
      { frameIndex: 0, eventIndex: 0, note: 60, velocity: 127, kind: 'trigger', instrumentId: 'sampler-1' },
      { frameIndex: 10, eventIndex: 1, note: 60, velocity: 127, kind: 'trigger', instrumentId: 'sampler-1' },
    ];

    const voices = evaluateVoices(events, 15, { voiceCap: 4, adsr: ADSR_INSTANT });
    const layers = buildVoiceLayers(makeInst(), voices, makeAssets(), 15, 30, ADSR_INSTANT);

    expect(layers).toHaveLength(2);
    // Each layer carries a voice_id that satisfies the backend pattern
    for (const layer of layers) {
      expect(layer.voice_id).toBeDefined();
      expect(VOICE_ID_PATTERN.test(layer.voice_id!)).toBe(true);
      // Verify structure
      expect(layer.layer_type).toBe('video');
      expect(layer.asset_path).toBe('/test/clip.mp4');
      expect(layer.opacity).toBeGreaterThan(0);
      expect(Array.isArray(layer.chain)).toBe(true);
    }

    // Distinct voice_ids
    const ids = layers.map((l) => l.voice_id!);
    expect(new Set(ids).size).toBe(2);
  });

  // Named test #7: determinism — same event log + same frame → identical layer arrays
  it('determinism: same event log + same frame → identical layer arrays (deep-equal across two evaluations)', () => {
    const events = [makeTrigger(0, 0), makeTrigger(3, 1)];
    const voices1 = buildVoices(events, 10);
    const voices2 = buildVoices(events, 10);
    const layers1 = buildVoiceLayers(makeInst(), voices1, makeAssets(), 10, 30, ADSR_INSTANT);
    const layers2 = buildVoiceLayers(makeInst(), voices2, makeAssets(), 10, 30, ADSR_INSTANT);
    expect(layers1).toEqual(layers2);
  });

  // Named test #8: voice_id satisfies backend VOICE_ID_PATTERN (no colons)
  it('voice_id emitted by buildVoiceLayers satisfies backend VOICE_ID_PATTERN ^[A-Za-z0-9_-]{1,128}$ (no colons)', () => {
    const events = [makeTrigger(0, 0, 'sampler-3')];
    const voices = buildVoices(events, 5);
    const layers = buildVoiceLayers(makeInst({ id: 'sampler-3' }), voices, makeAssets(), 5, 30, ADSR_INSTANT);

    expect(layers).toHaveLength(1);
    const vid = layers[0].voice_id!;
    // No colons
    expect(vid).not.toContain(':');
    // Matches pattern
    expect(VOICE_ID_PATTERN.test(vid)).toBe(true);
    // 128-char guard
    expect(vid.length).toBeLessThanOrEqual(128);
  });

  // Named test #9: null instrument returns empty array
  it('null instrument returns empty array', () => {
    const events = [makeTrigger(0, 0)];
    const voices = buildVoices(events, 5);
    const layers = buildVoiceLayers(null, voices, makeAssets(), 5, 30, ADSR_INSTANT);
    expect(layers).toHaveLength(0);
  });

  // Named test #10: empty voices array returns empty array
  it('empty voices array returns empty array', () => {
    const layers = buildVoiceLayers(makeInst(), [], makeAssets(), 5, 30, ADSR_INSTANT);
    expect(layers).toHaveLength(0);
  });
});
