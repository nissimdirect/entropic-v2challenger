import { describe, it, expect } from 'vitest';
import { applyCCModulations } from '../../../renderer/components/performance/applyCCModulations';
import type { EffectInstance, CCMapping, ParamDef } from '../../../shared/types';

function makeEffect(id: string, params: Record<string, number>): EffectInstance {
  return {
    id,
    effectId: `fx-${id}`,
    isEnabled: true,
    isFrozen: false,
    parameters: { ...params },
    modulations: {},
    mix: 1.0,
    mask: null,
  };
}

describe('applyCCModulations', () => {
  it('returns original chain when no mappings', () => {
    const chain = [makeEffect('e1', { amount: 0.5 })];
    const result = applyCCModulations(chain, [], {});
    expect(result).toBe(chain); // same reference
  });

  it('applies single CC mapping (absolute set)', () => {
    const chain = [makeEffect('e1', { amount: 0.5 })];
    const mappings: CCMapping[] = [{ cc: 1, effectId: 'e1', paramKey: 'amount' }];
    const ccValues = { 1: 0.75 };

    const registry = new Map<string, Record<string, ParamDef>>();
    registry.set('fx-e1', {
      amount: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Amount' },
    });

    const result = applyCCModulations(chain, mappings, ccValues, registry);
    expect(result[0].parameters.amount).toBeCloseTo(0.75, 4);
  });

  it('scales CC to param range', () => {
    const chain = [makeEffect('e1', { freq: 200 })];
    const mappings: CCMapping[] = [{ cc: 2, effectId: 'e1', paramKey: 'freq' }];
    const ccValues = { 2: 0.5 };

    const registry = new Map<string, Record<string, ParamDef>>();
    registry.set('fx-e1', {
      freq: { type: 'float', min: 20, max: 20000, default: 200, label: 'Freq' },
    });

    const result = applyCCModulations(chain, mappings, ccValues, registry);
    // 20 + 0.5 * (20000 - 20) = 20 + 9990 = 10010
    expect(result[0].parameters.freq).toBeCloseTo(10010, 0);
  });

  it('handles multiple CC mappings on same effect', () => {
    const chain = [makeEffect('e1', { amount: 0.5, rate: 1.0 })];
    const mappings: CCMapping[] = [
      { cc: 1, effectId: 'e1', paramKey: 'amount' },
      { cc: 2, effectId: 'e1', paramKey: 'rate' },
    ];
    const ccValues = { 1: 0.3, 2: 0.8 };

    const result = applyCCModulations(chain, mappings, ccValues);
    expect(result[0].parameters.amount).toBeCloseTo(0.3, 4);
    expect(result[0].parameters.rate).toBeCloseTo(0.8, 4);
  });

  it('skips CC without value', () => {
    const chain = [makeEffect('e1', { amount: 0.5 })];
    const mappings: CCMapping[] = [{ cc: 99, effectId: 'e1', paramKey: 'amount' }];
    const ccValues = {}; // No CC 99 value

    const result = applyCCModulations(chain, mappings, ccValues);
    expect(result).toBe(chain); // no overrides → original chain
  });

  it('does not mutate original chain', () => {
    const chain = [makeEffect('e1', { amount: 0.5 })];
    const mappings: CCMapping[] = [{ cc: 1, effectId: 'e1', paramKey: 'amount' }];
    const ccValues = { 1: 0.9 };

    applyCCModulations(chain, mappings, ccValues);
    expect(chain[0].parameters.amount).toBe(0.5); // unchanged
  });

  it('handles NaN CC value gracefully', () => {
    const chain = [makeEffect('e1', { amount: 0.5 })];
    const mappings: CCMapping[] = [{ cc: 1, effectId: 'e1', paramKey: 'amount' }];
    const ccValues = { 1: NaN };

    const result = applyCCModulations(chain, mappings, ccValues);
    expect(result).toBe(chain); // NaN filtered, no change
  });
});
