import { describe, it, expect } from 'vitest';
import { applyPadModulations } from '../../../renderer/components/performance/applyPadModulations';
import type { EffectInstance, Pad, ParamDef } from '../../../shared/types';

function makeEffect(id: string, effectId: string, params: Record<string, number>): EffectInstance {
  return {
    id,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: { ...params },
    modulations: {},
    mix: 1.0,
    mask: null,
  };
}

function makePad(id: string, mappings: Pad['mappings']): Pad {
  return {
    id,
    label: id,
    keyBinding: null,
    mode: 'gate',
    chokeGroup: null,
    envelope: { attack: 0, decay: 0, sustain: 1.0, release: 0 },
    mappings,
    color: '#4ade80',
  };
}

describe('applyPadModulations', () => {
  it('single pad modulates single param', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 0 })];
    const pads = [makePad('p1', [{
      sourceId: 'p1', depth: 1.0, min: 0, max: 360,
      curve: 'linear', effectId: 'e1', paramKey: 'amount',
    }])];

    const result = applyPadModulations(chain, pads, { p1: 1.0 });
    expect(result[0].parameters.amount).toBe(360);
  });

  it('single pad modulates multiple params', () => {
    const chain = [makeEffect('e1', 'blur', { radius: 0, strength: 0 })];
    const pads = [makePad('p1', [
      { sourceId: 'p1', depth: 1.0, min: 0, max: 10, curve: 'linear', effectId: 'e1', paramKey: 'radius' },
      { sourceId: 'p1', depth: 0.5, min: 0, max: 1, curve: 'linear', effectId: 'e1', paramKey: 'strength' },
    ])];

    const result = applyPadModulations(chain, pads, { p1: 1.0 });
    expect(result[0].parameters.radius).toBe(10);
    expect(result[0].parameters.strength).toBe(0.5);
  });

  it('multiple pads targeting same param are additive', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 0 })];
    const pads = [
      makePad('p1', [{ sourceId: 'p1', depth: 1.0, min: 0, max: 100, curve: 'linear', effectId: 'e1', paramKey: 'amount' }]),
      makePad('p2', [{ sourceId: 'p2', depth: 1.0, min: 0, max: 100, curve: 'linear', effectId: 'e1', paramKey: 'amount' }]),
    ];

    const result = applyPadModulations(chain, pads, { p1: 0.5, p2: 0.5 });
    expect(result[0].parameters.amount).toBe(100); // 50 + 50
  });

  it('additive result clamped to ParamDef bounds', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 0 })];
    const pads = [
      makePad('p1', [{ sourceId: 'p1', depth: 1.0, min: 0, max: 360, curve: 'linear', effectId: 'e1', paramKey: 'amount' }]),
      makePad('p2', [{ sourceId: 'p2', depth: 1.0, min: 0, max: 360, curve: 'linear', effectId: 'e1', paramKey: 'amount' }]),
    ];

    const registry = new Map<string, Record<string, ParamDef>>();
    registry.set('hue_shift', {
      amount: { type: 'float', min: 0, max: 360, default: 0, label: 'Amount' },
    });

    const result = applyPadModulations(chain, pads, { p1: 1.0, p2: 1.0 }, registry);
    expect(result[0].parameters.amount).toBe(360); // clamped to max
  });

  it('zero envelope value = no modification', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 50 })];
    const pads = [makePad('p1', [{
      sourceId: 'p1', depth: 1.0, min: 0, max: 360,
      curve: 'linear', effectId: 'e1', paramKey: 'amount',
    }])];

    const result = applyPadModulations(chain, pads, {});
    expect(result[0].parameters.amount).toBe(50);
  });

  it('missing effectId in chain = no crash', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 50 })];
    const pads = [makePad('p1', [{
      sourceId: 'p1', depth: 1.0, min: 0, max: 360,
      curve: 'linear', effectId: 'nonexistent', paramKey: 'amount',
    }])];

    const result = applyPadModulations(chain, pads, { p1: 1.0 });
    expect(result[0].parameters.amount).toBe(50);
  });

  it('depth=0 = no change', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 50 })];
    const pads = [makePad('p1', [{
      sourceId: 'p1', depth: 0, min: 0, max: 360,
      curve: 'linear', effectId: 'e1', paramKey: 'amount',
    }])];

    const result = applyPadModulations(chain, pads, { p1: 1.0 });
    expect(result[0].parameters.amount).toBe(50);
  });

  it('original chain is unmodified (immutability)', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 0 })];
    const original = chain[0].parameters.amount;

    const pads = [makePad('p1', [{
      sourceId: 'p1', depth: 1.0, min: 0, max: 360,
      curve: 'linear', effectId: 'e1', paramKey: 'amount',
    }])];

    applyPadModulations(chain, pads, { p1: 1.0 });
    expect(chain[0].parameters.amount).toBe(original);
  });

  it('C3: structuredClone failure returns original chain', () => {
    // Create an effect with a non-cloneable property
    const chain = [makeEffect('e1', 'hue_shift', { amount: 0 })];
    // Add a function (not cloneable)
    (chain[0] as Record<string, unknown>).fn = () => {};

    const pads = [makePad('p1', [{
      sourceId: 'p1', depth: 1.0, min: 0, max: 360,
      curve: 'linear', effectId: 'e1', paramKey: 'amount',
    }])];

    const result = applyPadModulations(chain, pads, { p1: 1.0 });
    // Should return original chain, not crash
    expect(result).toBe(chain);
  });

  it('C2: NaN envelope value = no modification', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 50 })];
    const pads = [makePad('p1', [{
      sourceId: 'p1', depth: 1.0, min: 0, max: 360,
      curve: 'linear', effectId: 'e1', paramKey: 'amount',
    }])];

    const result = applyPadModulations(chain, pads, { p1: NaN });
    expect(result[0].parameters.amount).toBe(50);
  });

  it('performance: 10-effect chain completes in <1ms', () => {
    const chain = Array.from({ length: 10 }, (_, i) =>
      makeEffect(`e${i}`, `effect_${i}`, { amount: 0, strength: 0.5 }),
    );
    const pads = [makePad('p1', chain.map((e) => ({
      sourceId: 'p1', depth: 1.0, min: 0, max: 100,
      curve: 'linear' as const, effectId: e.id, paramKey: 'amount',
    })))];

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      applyPadModulations(chain, pads, { p1: 0.5 });
    }
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(1); // <1ms per call
  });

  it('empty active pads returns original chain reference', () => {
    const chain = [makeEffect('e1', 'hue_shift', { amount: 0 })];
    const pads = [makePad('p1', [])];

    const result = applyPadModulations(chain, pads, {});
    expect(result).toBe(chain); // same reference, no clone
  });
});
