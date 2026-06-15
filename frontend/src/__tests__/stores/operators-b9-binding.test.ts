/**
 * P5b.21 (B9) — axis-extended OperatorMapping: save-time bindingRule validation,
 * default resolution, and serialization of the new srcAxis/dstAxis/bindingRule
 * fields.
 *
 * The operator store is the FRONTEND save-time guard; the backend loader
 * (project/schema.py) is the authoritative trust boundary. These tests assert the
 * widened Tier-1 accept-set (broadcast/sampleAt/scanOver/integrate) saves, the 4
 * research rules (painted/hilbert/polar/learned) are rejected, and legacy
 * mappings without axis fields keep working.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import { resolveModRouteAxes } from '../../shared/axis-binding'
import type { OperatorMapping } from '../../shared/types'

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

function addLfoWithMapping(mapping: OperatorMapping): string {
  useOperatorStore.getState().addOperator('lfo')
  const id = useOperatorStore.getState().operators[0].id
  useOperatorStore.getState().addMapping(id, mapping)
  return id
}

function baseMapping(over: Partial<OperatorMapping> = {}): OperatorMapping {
  return {
    targetEffectId: 'fx-blur',
    targetParamKey: 'radius',
    depth: 1.0,
    min: 0.0,
    max: 1.0,
    curve: 'linear',
    blendMode: 'add',
    ...over,
  }
}

describe('B9 OperatorMapping — save-time bindingRule validation', () => {
  beforeEach(resetStores)

  it('accepts broadcast/sampleAt/scanOver/integrate post-widening', () => {
    for (const rule of ['broadcast', 'sampleAt', 'scanOver', 'integrate'] as const) {
      resetStores()
      const id = addLfoWithMapping(baseMapping({ bindingRule: rule, srcAxis: 'y', dstAxis: 't' }))
      const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
      expect(op.mappings).toHaveLength(1)
      expect(op.mappings[0].bindingRule).toBe(rule)
    }
  })

  it('rejects painted on save when flag off', () => {
    const id = addLfoWithMapping(baseMapping({ bindingRule: 'painted' }))
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    expect(op.mappings).toHaveLength(0)
  })

  it('rejects hilbert on save when flag off', () => {
    const id = addLfoWithMapping(baseMapping({ bindingRule: 'hilbert' }))
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    expect(op.mappings).toHaveLength(0)
  })

  it('rejects polar on save when flag off', () => {
    const id = addLfoWithMapping(baseMapping({ bindingRule: 'polar' }))
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    expect(op.mappings).toHaveLength(0)
  })

  it('rejects learned on save when flag off', () => {
    const id = addLfoWithMapping(baseMapping({ bindingRule: 'learned' }))
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    expect(op.mappings).toHaveLength(0)
  })

  it('rejects an unknown binding rule on save', () => {
    // @ts-expect-error — intentionally invalid for the runtime trust boundary
    const id = addLfoWithMapping(baseMapping({ bindingRule: 'zigzag' }))
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    expect(op.mappings).toHaveLength(0)
  })

  it('non-finite depth rejected', () => {
    const id = addLfoWithMapping(baseMapping({ depth: Number.NaN }))
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    expect(op.mappings).toHaveLength(0)
  })

  it('updateMapping rejects a research rule on a previously-valid mapping', () => {
    const id = addLfoWithMapping(baseMapping({ bindingRule: 'scanOver' }))
    useOperatorStore.getState().updateMapping(id, 0, { bindingRule: 'painted' })
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    // The update is rejected — the mapping keeps its valid scanOver rule.
    expect(op.mappings[0].bindingRule).toBe('scanOver')
  })
})

describe('B9 OperatorMapping — defaults + serialization', () => {
  beforeEach(resetStores)

  it('old mapping without axis fields gets defaults', () => {
    const id = addLfoWithMapping(baseMapping()) // no srcAxis/dstAxis/bindingRule
    const op = useOperatorStore.getState().operators.find((o) => o.id === id)!
    const m = op.mappings[0]
    expect(m.srcAxis).toBeUndefined()
    expect(m.dstAxis).toBeUndefined()
    expect(m.bindingRule).toBeUndefined()
    // The default resolver fills t/t/broadcast.
    expect(resolveModRouteAxes(m)).toEqual({ srcAxis: 't', dstAxis: 't', bindingRule: 'broadcast' })
  })

  it('serializes axis fields as snake_case only when set (legacy byte-identical)', () => {
    resetStores()
    const legacyId = addLfoWithMapping(baseMapping()) // legacy
    const legacy = useOperatorStore.getState().getSerializedOperators()[0]
    expect(legacy.mappings).toBeDefined()
    const lm = (legacy.mappings as Record<string, unknown>[])[0]
    // No axis keys emitted for a legacy mapping.
    expect('src_axis' in lm).toBe(false)
    expect('dst_axis' in lm).toBe(false)
    expect('binding_rule' in lm).toBe(false)

    resetStores()
    addLfoWithMapping(baseMapping({ bindingRule: 'scanOver', srcAxis: 'y', dstAxis: 'x' }))
    const b9 = useOperatorStore.getState().getSerializedOperators()[0]
    const bm = (b9.mappings as Record<string, unknown>[])[0]
    expect(bm.src_axis).toBe('y')
    expect(bm.dst_axis).toBe('x')
    expect(bm.binding_rule).toBe('scanOver')
  })
})
