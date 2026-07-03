import { describe, it, expect } from 'vitest'
import type { AutomationLane, EffectInfo, EffectInstance } from '../../shared/types'
import {
  evaluateAutomationOverrides,
  applyAutomationOverridesToChain,
} from '../../renderer/utils/evaluateAutomationOverrides'
import { buildMasterChainPayload, shouldUseCompositePath } from '../../shared/ipc-serialize'

/**
 * M.3 (Master-Out Bus PRD) — HARD ORACLE: a Master effect param under an
 * automation lane must produce the automated (time-varying) value in BOTH
 * the preview render_composite payload path AND the export
 * automation_by_frame/master_chain path, and the two must agree
 * (preview==export parity).
 *
 * This test exercises the exact frontend pipeline both App.tsx call sites
 * run through:
 *   - Preview (App.tsx requestRenderFrame, ~line 1435): evaluate
 *     `evaluateAutomationOverrides(lanes, currentTime, registry)`, fold the
 *     result onto the Master's effectChain via `applyAutomationOverridesToChain`
 *     BEFORE `buildMasterChainPayload` serializes it into the render_composite
 *     payload.
 *   - Export (App.tsx handleExport, ~line 2860): pre-resolve
 *     `evaluateAutomationOverrides(lanes, f / fps, registry)` PER SOURCE FRAME
 *     into `automation_by_frame[f]`, sent alongside the STATIC `master_chain`
 *     — the backend (engine/export.py's `modulate_chain_for_frame`, reused
 *     for master_chain in M.3) resolves the same override at render time.
 *
 * Because both sites call the SAME evaluator, this test proves parity at the
 * frontend evaluation boundary; backend/tests/test_master_automation_export.py
 * proves the backend actually folds automation_by_frame onto master_chain
 * per output frame (the other half of the seam).
 */

const registry: EffectInfo[] = [
  {
    id: 'fx.color_invert',
    name: 'Color Invert',
    category: 'color',
    params: {
      amount: { type: 'float', min: 0, max: 1, default: 1, label: 'Amount' },
    },
  },
]

function makeMasterEffect(): EffectInstance {
  return {
    id: 'master-invert-instance-1',
    effectId: 'fx.color_invert',
    isEnabled: true,
    isFrozen: false,
    parameters: { amount: 0, channel: 'all' },
    modulations: {},
    mix: 1.0,
    mask: null,
  } as EffectInstance
}

function makeMasterAmountLane(): AutomationLane {
  // Key convention: `${effect.effectId}.${paramKey}` — see
  // evaluateAutomationOverrides.ts's applyAutomationOverridesToChain
  // docstring for why (export-side backend matching requires the TYPE id,
  // not the per-instance uuid).
  return {
    id: 'lane-master-amount',
    paramPath: 'fx.color_invert.amount',
    color: '#4ade80',
    isVisible: true,
    mode: 'smooth',
    points: [
      { time: 0, value: 0, curve: 0 },
      { time: 1, value: 1, curve: 0 },
    ],
  }
}

describe('M.3 — Master automation preview==export parity', () => {
  it('produces the SAME resolved value from the preview evaluator and the export per-frame evaluator at matching times', () => {
    const lanes = [makeMasterAmountLane()]
    const fps = 30

    // Preview: one render call at currentTime = 0.5s.
    const previewTime = 0.5
    const previewOverrides = evaluateAutomationOverrides(lanes, previewTime, registry)

    // Export: the per-source-frame loop (App.tsx) evaluates at t = f / fps.
    // frame 15 @ 30fps = 0.5s — the SAME instant as the preview call above.
    const exportFrame = 15
    const exportOverrides = evaluateAutomationOverrides(lanes, exportFrame / fps, registry)

    expect(previewOverrides['fx.color_invert.amount']).toBeCloseTo(0.5, 5)
    // Preview and export evaluate to the identical value at the same instant.
    expect(exportOverrides['fx.color_invert.amount']).toBeCloseTo(
      previewOverrides['fx.color_invert.amount'],
      10,
    )
  })

  it('bakes the automated value into the Master chain before render_composite serialization (preview path)', () => {
    const masterEffect = makeMasterEffect()
    const lanes = [makeMasterAmountLane()]

    const at0 = evaluateAutomationOverrides(lanes, 0, registry)
    const at1 = evaluateAutomationOverrides(lanes, 1, registry)

    const chainAt0 = applyAutomationOverridesToChain([masterEffect], at0)
    const chainAt1 = applyAutomationOverridesToChain([masterEffect], at1)

    // Time-varying: the SAME effect instance's `amount` differs across time.
    expect(chainAt0[0].parameters.amount).toBeCloseTo(0, 5)
    expect(chainAt1[0].parameters.amount).toBeCloseTo(1, 5)
    expect(chainAt0[0].parameters.amount).not.toBeCloseTo(chainAt1[0].parameters.amount as number, 2)

    // The original chain/effect objects are untouched (pure, no mutation).
    expect(masterEffect.parameters.amount).toBe(0)

    // What actually reaches the wire — buildMasterChainPayload's serialized
    // shape carries the RESOLVED (automated) value, not the static default.
    const payloadAt1 = buildMasterChainPayload(chainAt1)
    expect(payloadAt1.master_chain?.[0].params.amount).toBeCloseTo(1, 5)

    // shouldUseCompositePath still sees a non-empty master chain post-bake
    // (override application never changes chain length) — the M.2b "THE
    // TRAP fix" seam that forces render_composite is unaffected by M.3.
    expect(
      shouldUseCompositePath({
        hasMultipleLayers: false,
        activeVideoClipCount: 1,
        masterChainLength: chainAt1.length,
      }),
    ).toBe(true)
  })

  it('no automation lanes → Master chain is returned byte-identical (M.1 no-op contract preserved)', () => {
    const masterEffect = makeMasterEffect()
    const chain = [masterEffect]
    const result = applyAutomationOverridesToChain(chain, undefined)
    expect(result).toBe(chain) // same array reference — no clone when no-op
    expect(result[0]).toBe(masterEffect) // same effect object reference too
  })
})
