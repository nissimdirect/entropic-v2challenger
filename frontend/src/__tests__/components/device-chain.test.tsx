/**
 * DeviceChain + DeviceCard component tests (Phase 13A).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useProjectStore } from '../../renderer/stores/project'
import { useEffectsStore } from '../../renderer/stores/effects'
import { useEngineStore } from '../../renderer/stores/engine'
import DeviceChain from '../../renderer/components/device-chain/DeviceChain'
import DeviceCard from '../../renderer/components/device-chain/DeviceCard'
import type { EffectInstance, EffectInfo } from '../../shared/types'

const MOCK_EFFECT: EffectInstance = {
  id: 'fx-1',
  effectId: 'pixelsort',
  isEnabled: true,
  isFrozen: false,
  parameters: { threshold: 0.5, direction: 90 },
  modulations: {},
  mix: 0.75,
  mask: null,
}

const MOCK_INFO: EffectInfo = {
  id: 'pixelsort',
  name: 'Pixel Sort',
  category: 'glitch',
  params: {
    threshold: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Threshold' },
    direction: { type: 'int', min: 0, max: 360, default: 0, label: 'Direction', unit: '°' },
  },
}

function resetStores() {
  useProjectStore.setState({
    effectChain: [],
    selectedEffectId: null,
    assets: {},
    currentFrame: 0,
    totalFrames: 0,
    isIngesting: false,
    ingestError: null,
    projectPath: null,
    projectName: 'Test',
  })
  useEffectsStore.setState({ registry: [MOCK_INFO], isLoading: false })
  useEngineStore.setState({ status: 'connected', lastFrameMs: 12 })
}

afterEach(cleanup)

describe('DeviceChain', () => {
  beforeEach(resetStores)

  it('renders empty state when no effects', () => {
    const { getByText } = render(<DeviceChain />)
    // F-0514-7 updated copy to advertise both click and drag.
    expect(getByText(/Add effects from the browser/i)).toBeTruthy()
  })

  it('renders device cards for each effect in chain', () => {
    useProjectStore.setState({
      effectChain: [MOCK_EFFECT, { ...MOCK_EFFECT, id: 'fx-2', effectId: 'pixelsort' }],
    })
    const { getAllByTestId, unmount } = render(<DeviceChain />)
    expect(getAllByTestId('device-card')).toHaveLength(2)
    unmount()
  })

  it('shows chain depth indicator', () => {
    useProjectStore.setState({ effectChain: [MOCK_EFFECT] })
    const { container, unmount } = render(<DeviceChain />)
    expect(container.textContent).toContain('1 / 10')
    unmount()
  })

  it('shows chain timing', () => {
    useProjectStore.setState({ effectChain: [MOCK_EFFECT] })
    useEngineStore.setState({ lastFrameMs: 42 })
    const { container, unmount } = render(<DeviceChain />)
    expect(container.textContent).toContain('42ms')
    unmount()
  })

  it('renders arrows between devices', () => {
    useProjectStore.setState({
      effectChain: [MOCK_EFFECT, { ...MOCK_EFFECT, id: 'fx-2' }],
    })
    const { container, unmount } = render(<DeviceChain />)
    const arrows = container.querySelectorAll('.device-chain__arrow')
    expect(arrows).toHaveLength(1)
    unmount()
  })

  // F-0514-16: Freeze / Unfreeze / Flatten context menu wiring.
  // The freezeStore is project-level via MASTER_TRACK_ID; menu items only
  // appear when the parent (App.tsx) hands down the handlers.
  describe('Freeze context menu (F-0514-16)', () => {
    it('shows "Freeze up to here" when handler is wired and chain has effects', () => {
      useProjectStore.setState({
        effectChain: [MOCK_EFFECT, { ...MOCK_EFFECT, id: 'fx-2' }],
      })
      const { container, unmount } = render(
        <DeviceChain
          onFreezeUpTo={vi.fn()}
          onUnfreeze={vi.fn()}
          onFlatten={vi.fn()}
        />,
      )
      const firstCard = container.querySelectorAll('[data-testid="device-card"]')[0] as HTMLElement
      fireEvent.contextMenu(firstCard, { clientX: 10, clientY: 10 })
      expect(container.textContent).toContain('Freeze up to here')
      unmount()
    })

    it('omits Freeze entries when handlers are NOT passed', () => {
      useProjectStore.setState({ effectChain: [MOCK_EFFECT] })
      const { container, unmount } = render(<DeviceChain />)
      const firstCard = container.querySelector('[data-testid="device-card"]') as HTMLElement
      fireEvent.contextMenu(firstCard, { clientX: 5, clientY: 5 })
      expect(container.textContent ?? '').not.toContain('Freeze up to here')
      unmount()
    })

    it('forwards correct cutIndex to onFreezeUpTo (clicked-effect index)', () => {
      useProjectStore.setState({
        effectChain: [
          MOCK_EFFECT,
          { ...MOCK_EFFECT, id: 'fx-2' },
          { ...MOCK_EFFECT, id: 'fx-3' },
        ],
      })
      const onFreezeUpTo = vi.fn()
      const { container, unmount } = render(
        <DeviceChain
          onFreezeUpTo={onFreezeUpTo}
          onUnfreeze={vi.fn()}
          onFlatten={vi.fn()}
        />,
      )
      const cards = container.querySelectorAll('[data-testid="device-card"]')
      fireEvent.contextMenu(cards[1], { clientX: 10, clientY: 10 })
      const buttons = container.querySelectorAll('button')
      const freezeBtn = Array.from(buttons).find((b) => /Freeze up to here/.test(b.textContent ?? ''))
      expect(freezeBtn).toBeTruthy()
      fireEvent.click(freezeBtn!)
      expect(onFreezeUpTo).toHaveBeenCalledWith(1)
      unmount()
    })
  })

  // F-0514-7: drag-add from EffectBrowser → DeviceChain.
  describe('drag-add drop target (F-0514-7)', () => {
    // jsdom doesn't implement DataTransfer; spy on getData / types instead.
    function mockDataTransfer(payload: Record<string, string>): DataTransfer {
      return {
        types: Object.keys(payload),
        getData: (type: string) => payload[type] ?? '',
        setData: () => {},
        dropEffect: 'copy',
        effectAllowed: 'copy',
      } as unknown as DataTransfer
    }

    it('adds an effect when a valid EFFECT_DRAG_TYPE drop lands', () => {
      const { container, unmount } = render(<DeviceChain />)
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const dt = mockDataTransfer({ 'application/x-entropic-effect-id': 'pixelsort' })
      fireEvent.drop(root, { dataTransfer: dt })
      const chain = useProjectStore.getState().effectChain
      expect(chain).toHaveLength(1)
      expect(chain[0].effectId).toBe('pixelsort')
      expect(chain[0].parameters.threshold).toBe(0.5) // default from MOCK_INFO
      unmount()
    })

    it('ignores drops without EFFECT_DRAG_TYPE (e.g. files from outside)', () => {
      const { container, unmount } = render(<DeviceChain />)
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const dt = mockDataTransfer({ 'text/plain': 'not-an-effect' })
      fireEvent.drop(root, { dataTransfer: dt })
      expect(useProjectStore.getState().effectChain).toHaveLength(0)
      unmount()
    })

    it('rejects drops when chain is at MAX_EFFECTS_PER_CHAIN', () => {
      // Fill the chain to capacity.
      useProjectStore.setState({
        effectChain: Array.from({ length: 10 }, (_, i) => ({
          ...MOCK_EFFECT,
          id: `fx-fill-${i}`,
        })),
      })
      const { container, unmount } = render(<DeviceChain />)
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const dt = mockDataTransfer({ 'application/x-entropic-effect-id': 'pixelsort' })
      fireEvent.drop(root, { dataTransfer: dt })
      // Still 10 — drop was rejected.
      expect(useProjectStore.getState().effectChain).toHaveLength(10)
      unmount()
    })

    it('ignores drops with an unknown effect id (registry miss)', () => {
      const { container, unmount } = render(<DeviceChain />)
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const dt = mockDataTransfer({ 'application/x-entropic-effect-id': 'fx.does_not_exist' })
      fireEvent.drop(root, { dataTransfer: dt })
      expect(useProjectStore.getState().effectChain).toHaveLength(0)
      unmount()
    })
  })
})

describe('DeviceCard', () => {
  it('renders effect name', () => {
    const { getByTestId } = render(
      <DeviceCard
        effect={MOCK_EFFECT}
        effectInfo={MOCK_INFO}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )
    expect(getByTestId('device-card-name').textContent).toBe('Pixel Sort')
  })

  it('shows ON when enabled', () => {
    const { getByTestId } = render(
      <DeviceCard
        effect={MOCK_EFFECT}
        effectInfo={MOCK_INFO}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )
    expect(getByTestId('device-toggle').textContent).toBe('ON')
  })

  it('shows OFF when disabled', () => {
    const disabled = { ...MOCK_EFFECT, isEnabled: false }
    const { getByTestId } = render(
      <DeviceCard
        effect={disabled}
        effectInfo={MOCK_INFO}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )
    expect(getByTestId('device-toggle').textContent).toBe('OFF')
  })

  it('shows mix percentage', () => {
    const { getByTestId } = render(
      <DeviceCard
        effect={MOCK_EFFECT}
        effectInfo={MOCK_INFO}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )
    const mix = getByTestId('device-mix')
    expect(mix.textContent).toContain('75%')
  })

  it('applies selected class when isSelected', () => {
    const { getByTestId } = render(
      <DeviceCard
        effect={MOCK_EFFECT}
        effectInfo={MOCK_INFO}
        isSelected={true}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )
    expect(getByTestId('device-card').className).toContain('device-card--selected')
  })

  it('renders params inline', () => {
    const { getByTestId } = render(
      <DeviceCard
        effect={MOCK_EFFECT}
        effectInfo={MOCK_INFO}
        isSelected={false}
        onSelect={vi.fn()}
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        onUpdateParam={vi.fn()}
        onSetMix={vi.fn()}
      />,
    )
    const params = getByTestId('device-params')
    // Should have knobs for threshold and direction
    expect(params.children.length).toBeGreaterThanOrEqual(2)
  })
})
