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
import { LIMITS } from '../../shared/limits'
import type { Operator, OperatorMapping } from '../../shared/types'

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

// --- PRODUCTION REHYDRATION PATH (loadOperators is the real trust boundary) ---
//
// Review Tiger 1/4: the live app rehydrates operators via loadOperators, NOT the
// backend deserialize path. A hand-edited .glitch must be defended HERE — a
// flag-off/unknown bindingRule or non-finite depth must be DROPPED, and the
// project-wide MAX_MOD_EDGES_TOTAL must be enforced summed across operators.

function makeOperator(id: string, mappings: OperatorMapping[]): Operator {
  return {
    id,
    type: 'lfo',
    label: 'LFO',
    isEnabled: true,
    parameters: { waveform: 'sine', rate_hz: 1.0 },
    processing: [],
    mappings,
  }
}

describe('B9 loadOperators — production rehydration trust boundary', () => {
  beforeEach(resetStores)

  it("loadOperators drops a rehydrated mapping with bindingRule:'learned' (flag off)", () => {
    useOperatorStore.getState().loadOperators([
      makeOperator('op-1', [
        baseMapping({ bindingRule: 'broadcast' }),
        baseMapping({ bindingRule: 'learned' }), // research rule — dropped
      ]),
    ])
    const op = useOperatorStore.getState().operators.find((o) => o.id === 'op-1')!
    expect(op.mappings).toHaveLength(1)
    expect(op.mappings[0].bindingRule).toBe('broadcast')
  })

  it("loadOperators drops bindingRule:'zigzag' (unknown)", () => {
    useOperatorStore.getState().loadOperators([
      // @ts-expect-error — intentionally invalid for the runtime trust boundary
      makeOperator('op-1', [baseMapping({ bindingRule: 'zigzag' })]),
    ])
    const op = useOperatorStore.getState().operators.find((o) => o.id === 'op-1')!
    expect(op.mappings).toHaveLength(0)
  })

  it('loadOperators drops a mapping with non-finite depth', () => {
    useOperatorStore.getState().loadOperators([
      makeOperator('op-1', [
        baseMapping({ depth: Number.POSITIVE_INFINITY }),
        baseMapping({ depth: 0.5 }),
      ]),
    ])
    const op = useOperatorStore.getState().operators.find((o) => o.id === 'op-1')!
    expect(op.mappings).toHaveLength(1)
    expect(op.mappings[0].depth).toBe(0.5)
  })

  it('loadOperators keeps the 4 implemented rules on rehydration', () => {
    const rules = ['broadcast', 'sampleAt', 'scanOver', 'integrate'] as const
    useOperatorStore.getState().loadOperators([
      makeOperator(
        'op-1',
        rules.map((r) => baseMapping({ bindingRule: r })),
      ),
    ])
    const op = useOperatorStore.getState().operators.find((o) => o.id === 'op-1')!
    expect(op.mappings.map((m) => m.bindingRule)).toEqual([...rules])
  })

  it('loadOperators enforces MAX_MOD_EDGES_TOTAL summed across operators', () => {
    // 64 operators × 32 mappings each = 2048 = MAX_MOD_EDGES_TOTAL. Add ONE more
    // operator with mappings to exceed the project-wide total. The per-operator
    // (32) and operator-count (64) clamps alone would NOT catch this.
    const ops: Operator[] = []
    for (let i = 0; i < LIMITS.MAX_OPERATORS; i++) {
      ops.push(
        makeOperator(
          `op-${i}`,
          Array.from({ length: LIMITS.MAX_MAPPINGS_PER_OPERATOR }, () => baseMapping()),
        ),
      )
    }
    useOperatorStore.getState().loadOperators(ops)
    const loaded = useOperatorStore.getState().operators
    const total = loaded.reduce((sum, o) => sum + o.mappings.length, 0)
    expect(total).toBeLessThanOrEqual(LIMITS.MAX_MOD_EDGES_TOTAL)
    expect(total).toBe(LIMITS.MAX_MOD_EDGES_TOTAL)
  })

  it('loadOperators truncates mappings beyond the total cap (boundary)', () => {
    // 63 ops × 32 = 2016 edges, then one op with 64 mappings (clamped to 32 by
    // the per-op cap) → 2016 + 32 = 2048 exactly. Push a 65th-equivalent by using
    // two extra ops so the total would be 2016 + 32 + 32 = 2080 > 2048 → truncated.
    const ops: Operator[] = []
    for (let i = 0; i < 63; i++) {
      ops.push(
        makeOperator(
          `op-${i}`,
          Array.from({ length: LIMITS.MAX_MAPPINGS_PER_OPERATOR }, () => baseMapping()),
        ),
      )
    }
    // one more operator (64th, under MAX_OPERATORS) carrying a full 32 mappings.
    ops.push(
      makeOperator(
        'op-63',
        Array.from({ length: LIMITS.MAX_MAPPINGS_PER_OPERATOR }, () => baseMapping()),
      ),
    )
    useOperatorStore.getState().loadOperators(ops)
    const total = useOperatorStore
      .getState()
      .operators.reduce((sum, o) => sum + o.mappings.length, 0)
    expect(total).toBe(LIMITS.MAX_MOD_EDGES_TOTAL) // 2048, none over
  })
})
