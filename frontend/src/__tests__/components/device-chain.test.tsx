/**
 * DeviceChain + DeviceCard component tests (Phase 13A).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
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
    expect(getByText('Add effects from the browser')).toBeTruthy()
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
