/**
 * Tests for the B4-lite axis-binding schema module (DEC-Q7-015).
 */

import { describe, it, expect } from 'vitest';

import {
  ALL_AXES,
  ALL_BINDING_RULES,
  ALL_INTERPOLATION_MODES,
  Axis,
  BindingRule,
  LaneAxisBinding,
  TIER_1_BINDING_RULES,
  isTier1BindingRule,
  validateBindingRule,
  validateLaneAxisBinding,
} from '../../shared/axis-binding';

describe('axis-binding: type catalogs', () => {
  it('has 6 axes in lowercase canonical form', () => {
    expect(ALL_AXES).toEqual(['t', 'y', 'x', 'c', 'f', 'l']);
  });

  it('has 8 binding rules', () => {
    expect(ALL_BINDING_RULES).toHaveLength(8);
    expect(ALL_BINDING_RULES).toContain('broadcast');
    expect(ALL_BINDING_RULES).toContain('learned');
  });

  it('has 4 interpolation modes', () => {
    expect(ALL_INTERPOLATION_MODES).toEqual(['linear', 'step', 'cubic', 'cosine']);
  });

  it('Tier 1 ships only broadcast', () => {
    expect(TIER_1_BINDING_RULES).toEqual(['broadcast']);
  });
});

describe('isTier1BindingRule', () => {
  it('accepts broadcast', () => {
    expect(isTier1BindingRule('broadcast')).toBe(true);
  });

  it('rejects every other rule', () => {
    const others: BindingRule[] = [
      'sampleAt', 'scanOver', 'integrate',
      'painted', 'hilbert', 'polar', 'learned',
    ];
    for (const rule of others) {
      expect(isTier1BindingRule(rule)).toBe(false);
    }
  });
});

describe('validateBindingRule', () => {
  it('Tier 1 accepts broadcast only', () => {
    expect(validateBindingRule('broadcast', 1)).toBe(true);
    expect(validateBindingRule('sampleAt', 1)).toBe(false);
    expect(validateBindingRule('painted', 1)).toBe(false);
    expect(validateBindingRule('learned', 1)).toBe(false);
  });

  it('Tier 3 accepts all 8 rules', () => {
    for (const rule of ALL_BINDING_RULES) {
      expect(validateBindingRule(rule, 3)).toBe(true);
    }
  });

  it('rejects unknown rule at any tier', () => {
    // @ts-expect-error — intentionally invalid for runtime test
    expect(validateBindingRule('garbage', 1)).toBe(false);
    // @ts-expect-error
    expect(validateBindingRule('garbage', 3)).toBe(false);
  });
});

describe('validateLaneAxisBinding', () => {
  const validT1: LaneAxisBinding = {
    domain: 't',
    bindingRule: 'broadcast',
    interpolationMode: 'linear',
  };

  it('returns null for a valid Tier 1 binding', () => {
    expect(validateLaneAxisBinding(validT1, 1)).toBeNull();
  });

  it('returns null for valid Tier 3 with non-broadcast rule', () => {
    const t3: LaneAxisBinding = {
      domain: 'y',
      bindingRule: 'sampleAt',
      interpolationMode: 'cubic',
    };
    expect(validateLaneAxisBinding(t3, 3)).toBeNull();
  });

  it('returns error when rule above tier', () => {
    const badRule: LaneAxisBinding = {
      domain: 'y',
      bindingRule: 'painted',
      interpolationMode: 'linear',
    };
    const result = validateLaneAxisBinding(badRule, 1);
    expect(result).not.toBeNull();
    expect(result).toContain('tier 3');
  });

  it('returns error for invalid axis', () => {
    const badAxis: LaneAxisBinding = {
      // @ts-expect-error — runtime test
      domain: 'invalid',
      bindingRule: 'broadcast',
      interpolationMode: 'linear',
    };
    const result = validateLaneAxisBinding(badAxis, 1);
    expect(result).not.toBeNull();
  });

  it('returns error for invalid interpolation mode', () => {
    const badMode: LaneAxisBinding = {
      domain: 't',
      bindingRule: 'broadcast',
      // @ts-expect-error
      interpolationMode: 'sinusoidal',
    };
    const result = validateLaneAxisBinding(badMode, 1);
    expect(result).not.toBeNull();
  });
});

describe('axis-binding: type-level smoke', () => {
  it('Axis union is exhaustively typed', () => {
    const axes: Axis[] = ['t', 'y', 'x', 'c', 'f', 'l'];
    expect(axes).toHaveLength(6);
  });

  it('BindingRule union is exhaustively typed', () => {
    const rules: BindingRule[] = [
      'broadcast', 'sampleAt', 'scanOver', 'integrate',
      'painted', 'hilbert', 'polar', 'learned',
    ];
    expect(rules).toHaveLength(8);
  });
});
