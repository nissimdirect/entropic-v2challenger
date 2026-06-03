"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_INTERPOLATION_MODES = exports.ALL_AXES = exports.ALL_BINDING_RULES = exports.TIER_1_BINDING_RULES = void 0;
exports.isTier1BindingRule = isTier1BindingRule;
exports.validateBindingRule = validateBindingRule;
exports.validateLaneAxisBinding = validateLaneAxisBinding;
/**
 * Tier 1 ships only `broadcast`. The other 7 rules light up at Tier 3
 * (per SPEC-2 §3) when the runtime can handle their compute cost.
 */
exports.TIER_1_BINDING_RULES = ['broadcast'];
exports.ALL_BINDING_RULES = [
    'broadcast',
    'sampleAt',
    'scanOver',
    'integrate',
    'painted',
    'hilbert',
    'polar',
    'learned',
];
exports.ALL_AXES = ['t', 'y', 'x', 'c', 'f', 'l'];
exports.ALL_INTERPOLATION_MODES = [
    'linear',
    'step',
    'cubic',
    'cosine',
];
function isTier1BindingRule(rule) {
    return exports.TIER_1_BINDING_RULES.includes(rule);
}
/**
 * Tier-gated validator. Rejects rules above the current shipping tier.
 *
 * Tier 1: ships at v1 (only broadcast).
 * Tier 3: ships when SG-5 (dynamic cycle detection) + SG-3 (latent NaN) land.
 */
function validateBindingRule(rule, tier) {
    if (!exports.ALL_BINDING_RULES.includes(rule))
        return false;
    if (tier === 1)
        return isTier1BindingRule(rule);
    // tier === 3 accepts all 8 rules
    return true;
}
/**
 * Validate a complete LaneAxisBinding against a tier.
 *
 * Returns `null` if valid, or a string describing the first failure.
 */
function validateLaneAxisBinding(binding, tier) {
    if (!exports.ALL_AXES.includes(binding.domain)) {
        return "invalid axis: ".concat(String(binding.domain), " (expected one of ").concat(exports.ALL_AXES.join(', '), ")");
    }
    if (!validateBindingRule(binding.bindingRule, tier)) {
        if (tier === 1) {
            return "bindingRule ".concat(binding.bindingRule, " requires tier 3; tier 1 supports only 'broadcast'");
        }
        return "unknown bindingRule: ".concat(binding.bindingRule);
    }
    if (!exports.ALL_INTERPOLATION_MODES.includes(binding.interpolationMode)) {
        return "invalid interpolationMode: ".concat(binding.interpolationMode);
    }
    return null;
}
