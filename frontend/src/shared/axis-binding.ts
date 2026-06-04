/**
 * B4-lite axis-binding schema (SPEC-2 / DEC-Q7-015).
 *
 * Ships as a standalone module to avoid collision with future Creatrix PR-B
 * edits to `shared/types.ts:AutomationLane`. When PR-B lands, it imports
 * `LaneAxisBinding` from here and adds an optional `axisBinding` field to
 * the existing AutomationLane interface.
 *
 * Tier 1 validator only accepts `broadcast`; tier 3+ enables the other
 * 7 rules. Painted / hilbert / polar / learned are research-tier and
 * remain experimental until user-test validates per Vision §11.
 */

/**
 * Lowercase canonical axis. SPEC-2 §1 locks: t = time, y = vertical scanline,
 * x = horizontal scanline, c = color channel, f = frequency band, l = latent space.
 */
export type Axis = 't' | 'y' | 'x' | 'c' | 'f' | 'l';

/**
 * 8-member BindingRule union. SPEC-2 §3 reconciliation (2026-06-03).
 *
 * - broadcast (Tier 1): scalar value applied to every cell
 * - sampleAt (Tier 3): sample scalar at a single coordinate
 * - scanOver (Tier 3): sweep a 1D function across an axis
 * - integrate (Tier 3): accumulate value over a range
 * - painted (Tier 3, research): hand-drawn spatial mask
 * - hilbert (Tier 3, research): Hilbert-curve-traversed value
 * - polar (Tier 3, research): polar-coordinate domain
 * - learned (Tier 3, research): neural binding from training data
 */
export type BindingRule =
  | 'broadcast'
  | 'sampleAt'
  | 'scanOver'
  | 'integrate'
  | 'painted'
  | 'hilbert'
  | 'polar'
  | 'learned';

/**
 * Interpolation mode for lane evaluation between keyframes.
 *
 * Used when `lane.axisBinding` is set; the renderer reads this to decide
 * how to interpolate between the lane's points along the chosen domain.
 */
export type InterpolationMode = 'linear' | 'step' | 'cubic' | 'cosine';

/**
 * Per-lane axis binding metadata. Optional add-on to AutomationLane.
 *
 * When absent: lane evaluates at `t` (time) with linear interpolation
 * (current behavior preserved). When present: renderer evaluates at the
 * chosen `domain` axis using the `bindingRule` semantics.
 */
export interface LaneAxisBinding {
  domain: Axis;
  bindingRule: BindingRule;
  interpolationMode: InterpolationMode;
}

/**
 * Tier 1 ships only `broadcast`. The other 7 rules light up at Tier 3
 * (per SPEC-2 §3) when the runtime can handle their compute cost.
 */
export const TIER_1_BINDING_RULES: BindingRule[] = ['broadcast'];

export const ALL_BINDING_RULES: BindingRule[] = [
  'broadcast',
  'sampleAt',
  'scanOver',
  'integrate',
  'painted',
  'hilbert',
  'polar',
  'learned',
];

export const ALL_AXES: Axis[] = ['t', 'y', 'x', 'c', 'f', 'l'];

export const ALL_INTERPOLATION_MODES: InterpolationMode[] = [
  'linear',
  'step',
  'cubic',
  'cosine',
];

export function isTier1BindingRule(rule: BindingRule): boolean {
  return TIER_1_BINDING_RULES.includes(rule);
}

/**
 * Tier-gated validator. Rejects rules above the current shipping tier.
 *
 * Tier 1: ships at v1 (only broadcast).
 * Tier 3: ships when SG-5 (dynamic cycle detection) + SG-3 (latent NaN) land.
 */
export function validateBindingRule(rule: BindingRule, tier: 1 | 3): boolean {
  if (!ALL_BINDING_RULES.includes(rule)) return false;
  if (tier === 1) return isTier1BindingRule(rule);
  // tier === 3 accepts all 8 rules
  return true;
}

/**
 * Validate a complete LaneAxisBinding against a tier.
 *
 * Returns `null` if valid, or a string describing the first failure.
 */
export function validateLaneAxisBinding(
  binding: LaneAxisBinding,
  tier: 1 | 3,
): string | null {
  if (!ALL_AXES.includes(binding.domain)) {
    return `invalid axis: ${String(binding.domain)} (expected one of ${ALL_AXES.join(', ')})`;
  }
  if (!validateBindingRule(binding.bindingRule, tier)) {
    if (tier === 1) {
      return `bindingRule ${binding.bindingRule} requires tier 3; tier 1 supports only 'broadcast'`;
    }
    return `unknown bindingRule: ${binding.bindingRule}`;
  }
  if (!ALL_INTERPOLATION_MODES.includes(binding.interpolationMode)) {
    return `invalid interpolationMode: ${binding.interpolationMode}`;
  }
  return null;
}
