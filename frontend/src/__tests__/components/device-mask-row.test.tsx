/**
 * MK.3 — DeviceCard mask-routing row tests (the minimal per-device mask UI;
 * rich UI is MK.13's job).
 *
 * What this covers (vitest layer):
 *   - device WITH a maskRef shows the mask row (named test)
 *   - device with NO maskRef and NO available nodes hides the row (additive/legacy)
 *   - available mask nodes populate the dropdown as options
 *   - selecting a node fires onSetMaskRef with the right ref (snake_case happens
 *     at the serialize layer, not here — here it's the camelCase MatteRef)
 *   - selecting "None" clears the ref (onSetMaskRef(null))
 *   - the INV button toggles invert and is disabled when no ref is assigned
 *
 * What stays at the serialize/store layers:
 *   - mask_ref snake_case on the wire → ipc-serialize.test.ts
 *   - undoability of the assignment → stores/project.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, within } from '@testing-library/react'

import DeviceCard from '../../renderer/components/device-chain/DeviceCard'
import type { EffectInstance, EffectInfo, MatteNode } from '../../shared/types'

const effectInfo: EffectInfo = {
  id: 'fx.invert',
  name: 'Invert',
  category: 'color',
  params: {},
} as unknown as EffectInfo

function makeEffect(overrides: Partial<EffectInstance> = {}): EffectInstance {
  return {
    id: 'e1',
    effectId: 'fx.invert',
    isEnabled: true,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1.0,
    mask: null,
    ...overrides,
  }
}

const rectNode: MatteNode = {
  id: 'rectL',
  kind: 'rect',
  params: { x: 0, y: 0, w: 0.5, h: 1 },
  op: 'add',
  invert: false,
  feather: 0,
  growShrink: 0,
  enabled: true,
}

const ellipseNode: MatteNode = { ...rectNode, id: 'ovalC', kind: 'ellipse' }

function renderCard(props: Partial<React.ComponentProps<typeof DeviceCard>> = {}) {
  const onSetMaskRef = vi.fn()
  const utils = render(
    <DeviceCard
      effect={makeEffect()}
      effectInfo={effectInfo}
      isSelected={false}
      onSelect={() => {}}
      onToggle={() => {}}
      onRemove={() => {}}
      onUpdateParam={() => {}}
      onSetMix={() => {}}
      onSetMaskRef={onSetMaskRef}
      {...props}
    />,
  )
  return { ...utils, onSetMaskRef }
}

describe('MK.3 — DeviceCard mask row', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('device with maskRef shows mask row', () => {
    const { getByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'rectL', invert: false } }),
      maskNodes: [],
    })
    expect(getByTestId('device-mask')).toBeTruthy()
    expect(getByTestId('device-mask-select')).toBeTruthy()
  })

  it('hides the mask row when there is no maskRef and no available nodes', () => {
    const { queryByTestId } = renderCard({ effect: makeEffect(), maskNodes: [] })
    expect(queryByTestId('device-mask')).toBeNull()
  })

  it('shows the mask row when the clip has assignable nodes (even before assignment)', () => {
    const { getByTestId } = renderCard({ maskNodes: [rectNode, ellipseNode] })
    const select = getByTestId('device-mask-select') as HTMLSelectElement
    // None + 2 nodes = 3 options.
    expect(select.querySelectorAll('option')).toHaveLength(3)
  })

  it('selecting a node fires onSetMaskRef with that node id', () => {
    const { getByTestId, onSetMaskRef } = renderCard({ maskNodes: [rectNode, ellipseNode] })
    fireEvent.change(getByTestId('device-mask-select'), { target: { value: 'ovalC' } })
    expect(onSetMaskRef).toHaveBeenCalledWith('e1', { nodeId: 'ovalC', invert: false })
  })

  it('selecting "None" clears the ref', () => {
    const { getByTestId, onSetMaskRef } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'rectL', invert: false } }),
      maskNodes: [rectNode],
    })
    fireEvent.change(getByTestId('device-mask-select'), { target: { value: '' } })
    expect(onSetMaskRef).toHaveBeenCalledWith('e1', null)
  })

  it('INV button toggles invert and preserves the assigned node', () => {
    const { getByTestId, onSetMaskRef } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'rectL', invert: false } }),
      maskNodes: [rectNode],
    })
    fireEvent.click(getByTestId('device-mask-invert'))
    expect(onSetMaskRef).toHaveBeenCalledWith('e1', { nodeId: 'rectL', invert: true })
  })

  it('INV button is disabled when no ref is assigned', () => {
    const { getByTestId } = renderCard({ maskNodes: [rectNode] })
    expect((getByTestId('device-mask-invert') as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps a stale assigned node visible if it left the clip stack', () => {
    const { getByTestId } = renderCard({
      effect: makeEffect({ maskRef: { nodeId: 'gone', invert: false } }),
      maskNodes: [rectNode],
    })
    const select = getByTestId('device-mask-select')
    // None + rectL + the stale 'gone (missing)' option = 3.
    expect(within(select).getAllByRole('option')).toHaveLength(3)
    expect(select.querySelector('option[value="gone"]')).toBeTruthy()
  })
})
