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
    const value = elapsed / attack;
    return { value: clamp01(value), phase: 'attack' };
  }

  // Instant attack (0 frames): value jumps to 1.0
  const postAttack = elapsed - attack;

  // Decay phase
  if (postAttack < decay) {
    if (decay === 0) {
      return { value: clamp01(sustain), phase: 'sustain' };
    }
    const progress = postAttack / decay;
    const value = 1.0 - (1.0 - sustain) * progress;
    return { value: clamp01(value), phase: 'decay' };
  }

  // Sustain phase
  return { value: clamp01(sustain), phase: 'sustain' };
}

function sanitize(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
