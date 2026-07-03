/**
 * Pure ADSR envelope state machine.
 * All computation is frontend-only — backend never sees pad state.
 */
import type { ADSREnvelope, ADSRPhase, PadRuntimeState } from '../../../shared/types';

export interface ADSRResult {
  value: number;
  phase: ADSRPhase;
}

/**
 * Compute the current envelope value and phase given the envelope params,
 * current runtime state, and the current frame index.
 *
 * Linear ramps. 0-frame phases = instant transition.
 * Clamps output to [0, 1]. Guards against NaN/Infinity.
 */
export function computeADSR(
  envelope: ADSREnvelope,
  state: PadRuntimeState,
  currentFrame: number,
): ADSRResult {
  // Sanitize envelope values — treat negative/NaN/Infinity as 0
  const attack = sanitize(envelope.attack);
  const decay = sanitize(envelope.decay);
  const sustain = clamp01(sanitize(envelope.sustain));
  const release = sanitize(envelope.release);

  // H6 — velocity (0-127) scales the envelope's PEAK intensity (attack/decay/
  // sustain only). Missing/invalid velocity (keyboard/mouse triggers, or
  // legacy padStates predating H6) defaults to 127 → scale=1, byte-identical
  // to pre-H6 output. The release branch below intentionally does NOT
  // re-apply this scale: it ramps from `state.releaseStartValue`, which was
  // itself computed via this same (already-scaled) attack/decay/sustain path
  // at the moment release began — re-scaling here would double-apply it.
  const velocityScale = clamp01(sanitizeVelocity(state.velocity) / 127);

  if (state.phase === 'idle') {
    return { value: 0, phase: 'idle' };
  }

  const elapsed = currentFrame - state.triggerFrame;

  // Guard: negative elapsed (shouldn't happen, but protect)
  if (elapsed < 0) {
    return { value: 0, phase: 'idle' };
  }

  // Release phase — independent of attack/decay timing
  if (state.phase === 'release') {
    const releaseElapsed = currentFrame - state.releaseFrame;

    if (releaseElapsed < 0) {
      return { value: clamp01(state.releaseStartValue), phase: 'release' };
    }

    if (release === 0) {
      return { value: 0, phase: 'idle' };
    }

    const progress = releaseElapsed / release;
    if (progress >= 1) {
      return { value: 0, phase: 'idle' };
    }

    const value = state.releaseStartValue * (1 - progress);
    return { value: clamp01(value), phase: 'release' };
  }

  // Attack phase
  if (elapsed < attack) {
    const value = (elapsed / attack) * velocityScale;
    return { value: clamp01(value), phase: 'attack' };
  }

  // Instant attack (0 frames): value jumps to 1.0 (pre-velocity-scale)
  const postAttack = elapsed - attack;

  // Decay phase
  if (postAttack < decay) {
    if (decay === 0) {
      return { value: clamp01(sustain * velocityScale), phase: 'sustain' };
    }
    const progress = postAttack / decay;
    const value = (1.0 - (1.0 - sustain) * progress) * velocityScale;
    return { value: clamp01(value), phase: 'decay' };
  }

  // Sustain phase
  return { value: clamp01(sustain * velocityScale), phase: 'sustain' };
}

function sanitize(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * H6 — sanitize a raw velocity value (e.g. a PadRuntimeState.velocity or a
 * MIDI note-on velocity byte) for envelope scaling / TriggerEvent stamping.
 * Missing/non-finite/out-of-range → 127 (full intensity, pre-H6 default).
 * Negative → 0 (silent/no intensity, not full — a malformed negative byte
 * should not be treated as "unset"). Exported so trigger-time call sites
 * (stores/performance.ts) apply the SAME trust-boundary guard as the
 * envelope-scaling read here.
 */
export function sanitizeVelocity(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 127;
  if (v < 0) return 0;
  return Math.min(127, v);
}
