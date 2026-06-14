/**
 * OperatorKentaroCluster editor tests (P4.4).
 *
 * Covers: per-LFO row rendering up to lfo_count, lfo_count clamping [2,8] with
 * garbage rejection (never NaN in store), master depth slider → store, per-LFO
 * target mapping creates a mapping with the correct sourceKey, legacy (no `lfos`
 * param) load without crash, and document-level pointer-listener balance on
 * unmount-mid-drag. At least one case mounts THROUGH OperatorRack to catch a
 * missing editor branch.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'

;(globalThis as any).window = {
  entropic: {
    sendCommand: async () => ({ ok: true }),
    onEngineStatus: () => {},
    onExportProgress: () => {},
  },
}

import OperatorKentaroCluster from '../../renderer/components/operators/OperatorKentaroCluster'
import OperatorRack from '../../renderer/components/operators/OperatorRack'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useUndoStore } from '../../renderer/stores/undo'
import type { Operator, EffectInfo } from '../../shared/types'

function resetStores() {
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
}

const registry: EffectInfo[] = [
  {
    id: 'fx.glitch',
    name: 'Glitch',
    category: 'glitch',
    params: {
      intensity: { type: 'float', label: 'Intensity', default: 0.5, min: 0, max: 1 },
      seed: { type: 'int', label: 'Seed', default: 1, min: 0, max: 99 },
    },
  } as unknown as EffectInfo,
]
const effectChain = [{ id: 'inst-1', effectId: 'fx.glitch' }]

/** Add a kentaroCluster to the store and return the (typed) operator. */
function addCluster(): Operator {
  useOperatorStore.getState().addOperator('kentaroCluster')
  const op = useOperatorStore.getState().operators[0]
  return op
}

function getCluster(): Operator {
  return useOperatorStore.getState().operators[0]
}

describe('OperatorKentaroCluster editor', () => {
  beforeEach(resetStores)
  afterEach(cleanup)

  it('renders one row per LFO up to the configured lfo_count', () => {
    const op = addCluster()
    // Seed lfo_count = 5 (default P4.1 seeds lfo_count: 8 with no lfos array).
    useOperatorStore.getState().updateOperator(op.id, {
      parameters: { ...op.parameters, lfo_count: 5 },
    })
    const { container } = render(
      <OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />,
    )
    const rows = container.querySelectorAll('.operator-kentaro__lfo-row')
    expect(rows).toHaveLength(5)
  })

  it('clamps lfo_count input between 2 and 8', () => {
    const op = addCluster()
    const { getByLabelText, rerender } = render(
      <OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />,
    )
    const input = getByLabelText('lfo count') as HTMLInputElement

    // 0 → clamps to 2
    fireEvent.change(input, { target: { value: '0' } })
    expect(getCluster().parameters.lfo_count).toBe(2)
    expect(Number.isNaN(getCluster().parameters.lfo_count as number)).toBe(false)
    rerender(<OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />)

    // 99 → clamps to 8
    fireEvent.change(input, { target: { value: '99' } })
    expect(getCluster().parameters.lfo_count).toBe(8)
    rerender(<OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />)

    // -3 → clamps to 2
    fireEvent.change(input, { target: { value: '-3' } })
    expect(getCluster().parameters.lfo_count).toBe(2)
    rerender(<OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />)

    // 'e' / garbage → rejected (no-op), value stays valid and never NaN
    const before = getCluster().parameters.lfo_count
    fireEvent.change(input, { target: { value: 'e' } })
    expect(getCluster().parameters.lfo_count).toBe(before)
    expect(Number.isNaN(getCluster().parameters.lfo_count as number)).toBe(false)
  })

  it('master depth slider updates operator parameters in the store', () => {
    addCluster()
    const { getByLabelText } = render(
      <OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />,
    )
    const slider = getByLabelText('master depth') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '0.42' } })
    expect(getCluster().parameters.master_depth).toBeCloseTo(0.42, 5)
  })

  it('per-LFO target mapping creates a mapping with the correct sourceKey', () => {
    const op = addCluster()
    // Ensure lfos exist so row 2 is present.
    useOperatorStore.getState().updateOperator(op.id, {
      parameters: { ...op.parameters, lfo_count: 4 },
    })
    const { container } = render(
      <OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />,
    )
    // Map lfo2 (the "+ Map" button in the 3rd row).
    const mapBtn = container.querySelector('[aria-label="map lfo 2"]') as HTMLButtonElement
    expect(mapBtn).toBeTruthy()
    fireEvent.click(mapBtn)

    const mappings = getCluster().mappings
    expect(mappings).toHaveLength(1)
    expect(mappings[0].sourceKey).toBe('lfo2')
    expect(mappings[0].targetEffectId).toBe('inst-1')
  })

  it('loads a legacy kentaroCluster operator with missing lfos param without crashing', () => {
    // Simulate a pre-P4.4 operator: parameters have NO `lfos` array.
    const legacy: Operator = {
      id: 'op-legacy-1',
      type: 'kentaroCluster',
      label: 'Kentaro Cluster',
      isEnabled: true,
      parameters: { lfo_count: 3, master_rate_hz: 1.0, master_depth: 1.0, bpm_sync: false },
      processing: [],
      mappings: [],
    }
    useOperatorStore.getState().loadOperators([legacy])
    const { container } = render(
      <OperatorKentaroCluster operator={legacy} effectChain={effectChain} registry={registry} />,
    )
    // Synthesized 3 rows from lfo_count, no throw.
    expect(container.querySelectorAll('.operator-kentaro__lfo-row')).toHaveLength(3)
  })

  it('renders through OperatorRack (catches a missing editor branch)', () => {
    addCluster()
    const { container } = render(
      <OperatorRack effectChain={effectChain} registry={registry} operatorValues={{}} hasAudio={false} />,
    )
    // The editor body must be present inside the rack card.
    expect(container.querySelector('.operator-kentaro')).toBeTruthy()
    expect(container.querySelectorAll('.operator-kentaro__lfo-row').length).toBeGreaterThan(0)
  })

  it('unmounting mid-drag removes all document-level pointer listeners', () => {
    addCluster()
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { container, unmount } = render(
      <OperatorKentaroCluster operator={getCluster()} effectChain={effectChain} registry={registry} />,
    )
    const overlay = container.querySelector('[data-lfo-overlay="0"]') as HTMLDivElement
    expect(overlay).toBeTruthy()

    // Begin a drag — attaches document-level pointer listeners.
    act(() => {
      fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 })
    })

    const pointerAdds = addSpy.mock.calls.filter((c) =>
      String(c[0]).startsWith('pointer'),
    ).length
    expect(pointerAdds).toBeGreaterThan(0)

    // Unmount WHILE dragging — cleanup must remove every listener it added.
    act(() => {
      unmount()
    })

    const pointerRemoves = removeSpy.mock.calls.filter((c) =>
      String(c[0]).startsWith('pointer'),
    ).length
    expect(pointerRemoves).toBe(pointerAdds)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
