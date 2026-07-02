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
 * P5b.21 (B9 tensor mod-routing): Tier 1 now ships the FOUR implemented binding
 * rules — `broadcast`, `sampleAt`, `scanOver`, `integrate`. This widening is
 * LOCKSTEP with the engine renderer (P5b.22, backend modulation/routing.py): the
 * resolver honors exactly these four. The other 4 rules (`painted`, `hilbert`,
 * `polar`, `learned`) are flag-gated research rules, REJECTED at the loader trust
 * boundary (backend project/schema.py) when their flag is off.
 *
 * NB: this is the MOD-ROUTING accept-set. Automation LANE axis-bindings keep
 * their own narrower tier-1 rule set (broadcast only) — see
 * `renderer/stores/automation.ts` (lane rendering does not implement the other
 * three rules yet, so widening lanes here would be a half-state).
 */
export const TIER_1_BINDING_RULES: BindingRule[] = [
  'broadcast',
  'sampleAt',
  'scanOver',
  'integrate',
];

/**
 * The 4 flag-gated research rules. Accepted by the 8-member union and preserved
 * on round-trip, but NOT implemented in the engine and REJECTED at the loader
 * boundary when their experimental flag is off. Mirrors the backend
 * `RESEARCH_BINDING_RULES` set in modulation/schema.py.
 */
export const RESEARCH_BINDING_RULES: BindingRule[] = [
  'painted',
  'hilbert',
  'polar',
  'learned',
];

/** True iff `rule` is one of the 4 flag-gated research rules. */
export function isResearchBindingRule(rule: BindingRule): boolean {
  return RESEARCH_BINDING_RULES.includes(rule);
}

/**
 * The B9 mod-route axis defaults: a mapping with no srcAxis/dstAxis/bindingRule
 * resolves to time→time broadcast (legacy byte-identical scalar→all). Mirrors the
 * backend resolver defaults in modulation/routing.py.
 */
export const MOD_ROUTE_AXIS_DEFAULTS: {
  srcAxis: Axis;
  dstAxis: Axis;
  bindingRule: BindingRule;
} = { srcAxis: 't', dstAxis: 't', bindingRule: 'broadcast' };

/**
 * Resolve a (possibly legacy) mapping's axis-routing fields to concrete values,
 * filling absent fields with the t/t/broadcast defaults. Pure — does not mutate.
 */
export function resolveModRouteAxes(m: {
  srcAxis?: Axis;
  dstAxis?: Axis;
  bindingRule?: BindingRule;
}): { srcAxis: Axis; dstAxis: Axis; bindingRule: BindingRule } {
  return {
    srcAxis: m.srcAxis ?? MOD_ROUTE_AXIS_DEFAULTS.srcAxis,
    dstAxis: m.dstAxis ?? MOD_ROUTE_AXIS_DEFAULTS.dstAxis,
    bindingRule: m.bindingRule ?? MOD_ROUTE_AXIS_DEFAULTS.bindingRule,
  };
}

/**
 * Validate a mod-routing binding rule for the operator store (P5b.21).
 *
 * Returns null when the rule is one of the 4 implemented Tier-1 rules; else an
 * error string. Unknown (non-union) and research (flagged-off) rules are
 * rejected — the store never enables a rule the engine cannot honor today. This
 * is the FRONTEND save-time guard; the backend loader (project/schema.py) is the
 * authoritative trust boundary.
 */
export function validateModRouteBindingRule(rule: unknown): string | null {
  if (typeof rule !== 'string') {
    return `bindingRule must be a string, got ${typeof rule}`;
  }
  if (!ALL_BINDING_RULES.includes(rule as BindingRule)) {
    return `unknown bindingRule: ${rule}`;
  }
  if (!TIER_1_BINDING_RULES.includes(rule as BindingRule)) {
    return `bindingRule '${rule}' is a flag-gated research rule and cannot be saved (implemented: ${TIER_1_BINDING_RULES.join(', ')})`;
  }
  return null;
}

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
