/**
 * DeviceChain + DeviceCard component tests (Phase 13A).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useEffectsStore } from '../../renderer/stores/effects'
import { useEngineStore } from '../../renderer/stores/engine'
import { useToastStore } from '../../renderer/stores/toast'
import { useAutomationStore } from '../../renderer/stores/automation'
import { useUndoStore } from '../../renderer/stores/undo'
import DeviceChain from '../../renderer/components/device-chain/DeviceChain'
import DeviceCard from '../../renderer/components/device-chain/DeviceCard'
import { SESSION_NONCE } from '../../renderer/components/effects/EffectBrowser'
import type { EffectInstance, EffectInfo } from '../../shared/types'

// D2 (Epic 02): V1_TRACK_ID is the active track that DeviceChain displays.
let V1_TRACK_ID: string

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
  useTimelineStore.getState().reset()
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
  // Epic 02: create V1 track. Auto-select fires via addTrack's D1 logic
  // (no prior selection → new track becomes selected/active).
  V1_TRACK_ID = useTimelineStore.getState().addTrack('V1', '#ff0000')!
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
    // D2 (Epic 02): DeviceChain reads the active track's chain via useActiveEffectChain().
    // Seed the V1 track chain (not the global effectChain).
    useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT, { ...MOCK_EFFECT, id: 'fx-2', effectId: 'pixelsort' }])
    const { getAllByTestId, unmount } = render(<DeviceChain />)
    expect(getAllByTestId('device-card')).toHaveLength(2)
    unmount()
  })

  it('shows chain depth indicator', () => {
    useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT])
    const { container, unmount } = render(<DeviceChain />)
    expect(container.textContent).toContain('1 / 10')
    unmount()
  })

  it('shows chain timing', () => {
    useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT])
    useEngineStore.setState({ lastFrameMs: 42 })
    const { container, unmount } = render(<DeviceChain />)
    expect(container.textContent).toContain('42ms')
    unmount()
  })

  it('renders arrows between devices', () => {
    useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT, { ...MOCK_EFFECT, id: 'fx-2' }])
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
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT, { ...MOCK_EFFECT, id: 'fx-2' }])
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
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT])
      const { container, unmount } = render(<DeviceChain />)
      const firstCard = container.querySelector('[data-testid="device-card"]') as HTMLElement
      fireEvent.contextMenu(firstCard, { clientX: 5, clientY: 5 })
      expect(container.textContent ?? '').not.toContain('Freeze up to here')
      unmount()
    })

    it('forwards correct cutIndex to onFreezeUpTo (clicked-effect index)', () => {
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [
        MOCK_EFFECT,
        { ...MOCK_EFFECT, id: 'fx-2' },
        { ...MOCK_EFFECT, id: 'fx-3' },
      ])
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

  // LIVE-M2 (#435): right-click a param knob → "Automate" creates/reveals +
  // arms the automation lane for that exact param (Ableton-style parity).
  describe('Automate context menu (LIVE-M2 #435)', () => {
    beforeEach(() => {
      useAutomationStore.getState().resetAutomation()
      useUndoStore.getState().clear()
    })

    function clickAutomate(container: HTMLElement) {
      const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Automate',
      )
      expect(btn).toBeTruthy()
      fireEvent.click(btn!)
    }

    it('shows "Automate" on right-click of a param knob, without also opening the device-level menu', () => {
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT])
      const { container, unmount } = render(<DeviceChain onSaveAsPreset={vi.fn()} />)
      const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement
      fireEvent.contextMenu(knob, { clientX: 20, clientY: 20 })
      expect(container.textContent).toContain('Automate')
      // Bubbling would also show the device-level "Save as Preset…" entry —
      // the knob wrapper must stop propagation so only ONE menu opens.
      expect(container.textContent ?? '').not.toContain('Save as Preset')
      unmount()
    })

    it('creates a lane addressed effectId.paramKey and arms the track when no lane exists yet', () => {
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT])
      expect(useAutomationStore.getState().getLanesForTrack(V1_TRACK_ID)).toHaveLength(0) // fail-before

      const { container, unmount } = render(<DeviceChain />)
      const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement
      fireEvent.contextMenu(knob, { clientX: 20, clientY: 20 })
      clickAutomate(container)

      const lanes = useAutomationStore.getState().getLanesForTrack(V1_TRACK_ID) // pass-after
      expect(lanes).toHaveLength(1)
      expect(lanes[0].paramPath).toBe('fx-1.threshold')
      expect(lanes[0].isVisible).toBe(true)
      expect(useAutomationStore.getState().armedTrackId).toBe(V1_TRACK_ID)
      unmount()
    })

    it('reveals + arms the existing lane instead of duplicating it when one already exists', () => {
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT])
      useAutomationStore.getState().addLane(V1_TRACK_ID, 'fx-1', 'threshold', '#4ade80')
      const existingLane = useAutomationStore.getState().getLanesForTrack(V1_TRACK_ID)[0]
      useAutomationStore.getState().setLaneVisible(V1_TRACK_ID, existingLane.id, false) // hidden
      useAutomationStore.getState().armTrack(null) // not armed

      const { container, unmount } = render(<DeviceChain />)
      const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement
      fireEvent.contextMenu(knob, { clientX: 20, clientY: 20 })
      clickAutomate(container)

      const lanes = useAutomationStore.getState().getLanesForTrack(V1_TRACK_ID)
      expect(lanes).toHaveLength(1) // no duplicate
      expect(lanes[0].id).toBe(existingLane.id)
      expect(lanes[0].isVisible).toBe(true) // revealed
      expect(useAutomationStore.getState().armedTrackId).toBe(V1_TRACK_ID) // armed
      unmount()
    })

    it('cleans up the lane created via Automate when the effect is deleted (delete-effect is a distributed transaction, PLAY-004)', () => {
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () => [MOCK_EFFECT])
      const { container, unmount } = render(<DeviceChain />)
      const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement
      fireEvent.contextMenu(knob, { clientX: 20, clientY: 20 })
      clickAutomate(container)
      expect(useAutomationStore.getState().getLanesForTrack(V1_TRACK_ID)).toHaveLength(1) // fail-before (pre-delete)

      useProjectStore.getState().removeEffect(V1_TRACK_ID, 'fx-1')

      expect(useAutomationStore.getState().getLanesForTrack(V1_TRACK_ID)).toHaveLength(0) // pass-after (post-delete)
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
      // Epic 01: addEffect now writes to track chain, not global effectChain.
      // TODO(Epic02): use active track.
      const chain = useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
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
      // D2 (Epic 02): effects land on track chain, not global effectChain.
      const chain = useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
      expect(chain).toHaveLength(0)
      unmount()
    })

    it('rejects drops whose effectId exceeds 64 chars (RT-3 length cap)', () => {
      const { container, unmount } = render(<DeviceChain />)
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const huge = 'a'.repeat(10_000)
      const dt = mockDataTransfer({ 'application/x-entropic-effect-id': huge })
      fireEvent.drop(root, { dataTransfer: dt })
      const chain = useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
      expect(chain).toHaveLength(0)
      unmount()
    })

    it('rejects drops when chain is at MAX_EFFECTS_PER_CHAIN', () => {
      // Fill the V1 track chain to capacity.
      useTimelineStore.getState().updateTrackEffectChain(V1_TRACK_ID, () =>
        Array.from({ length: 10 }, (_, i) => ({
          ...MOCK_EFFECT,
          id: `fx-fill-${i}`,
        })),
      )
      const { container, unmount } = render(<DeviceChain />)
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const dt = mockDataTransfer({ 'application/x-entropic-effect-id': 'pixelsort' })
      fireEvent.drop(root, { dataTransfer: dt })
      // Still 10 — drop was rejected.
      const chain = useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
      expect(chain).toHaveLength(10)
      unmount()
    })

    it('ignores drops with an unknown effect id (registry miss)', () => {
      const { container, unmount } = render(<DeviceChain />)
      const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
      const dt = mockDataTransfer({ 'application/x-entropic-effect-id': 'fx.does_not_exist' })
      fireEvent.drop(root, { dataTransfer: dt })
      const chain = useTimelineStore.getState().tracks.find((t) => t.id === V1_TRACK_ID)?.effectChain ?? []
      expect(chain).toHaveLength(0)
      unmount()
    })
  })
})

// M.2 (Master-Out Bus PRD) — instruments-reject guard on the Master track.
describe('DeviceChain — Master bus instruments/composite reject guard (M.2)', () => {
  // jsdom doesn't implement DataTransfer; spy on getData / types (mirrors the
  // drag-add drop target tests above).
  function mockDataTransfer(payload: Record<string, string>): DataTransfer {
    return {
      types: Object.keys(payload),
      getData: (type: string) => payload[type] ?? '',
      setData: () => {},
      dropEffect: 'copy',
      effectAllowed: 'copy',
    } as unknown as DataTransfer
  }

  let MASTER_TRACK_ID: string

  beforeEach(() => {
    resetStores()
    MASTER_TRACK_ID = useTimelineStore.getState().addMasterTrack()!
    useTimelineStore.getState().selectTrack(MASTER_TRACK_ID)
    useToastStore.setState({ toasts: [] })
  })

  it('rejects an instruments-kind drop on the Master with a guard toast', () => {
    const { container, unmount } = render(<DeviceChain />)
    const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
    const dt = mockDataTransfer({
      'application/x-entropic-effect-id': JSON.stringify({ kind: 'instruments', id: 'builtin:sampler' }),
      'application/x-creatrix-nonce': SESSION_NONCE,
    })
    fireEvent.drop(root, { dataTransfer: dt })

    const chain = useTimelineStore.getState().tracks.find((t) => t.id === MASTER_TRACK_ID)?.effectChain ?? []
    expect(chain).toHaveLength(0)

    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.message.includes("Instruments can't go on the Master"))).toBe(true)
    unmount()
  })

  it('rejects a composite-kind drop on the Master (terminal composite is meaningless post-composite)', () => {
    const { container, unmount } = render(<DeviceChain />)
    const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
    const dt = mockDataTransfer({
      'application/x-entropic-effect-id': JSON.stringify({ kind: 'composite', id: 'builtin:composite' }),
      'application/x-creatrix-nonce': SESSION_NONCE,
    })
    fireEvent.drop(root, { dataTransfer: dt })

    const chain = useTimelineStore.getState().tracks.find((t) => t.id === MASTER_TRACK_ID)?.effectChain ?? []
    expect(chain).toHaveLength(0)
    unmount()
  })

  it('still allows a plain fx-kind drop on the Master (fx/op/tool are allowed per PRD)', () => {
    const { container, unmount } = render(<DeviceChain />)
    const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
    const dt = mockDataTransfer({
      'application/x-entropic-effect-id': JSON.stringify({ kind: 'fx', id: 'builtin:pixelsort' }),
      'application/x-creatrix-nonce': SESSION_NONCE,
    })
    fireEvent.drop(root, { dataTransfer: dt })

    const chain = useTimelineStore.getState().tracks.find((t) => t.id === MASTER_TRACK_ID)?.effectChain ?? []
    expect(chain).toHaveLength(1)
    expect(chain[0].effectId).toBe('pixelsort')
    unmount()
  })

  it('a non-master track still accepts an instruments-kind drop attempt without the Master toast (registry-miss no-op, pre-existing behavior)', () => {
    // V1_TRACK_ID (video track) is auto-selected by resetStores(); switch back to it.
    useTimelineStore.getState().selectTrack(V1_TRACK_ID)
    const { container, unmount } = render(<DeviceChain />)
    const root = container.querySelector('[data-testid="device-chain"]') as HTMLElement
    const dt = mockDataTransfer({
      'application/x-entropic-effect-id': JSON.stringify({ kind: 'instruments', id: 'builtin:sampler' }),
      'application/x-creatrix-nonce': SESSION_NONCE,
    })
    fireEvent.drop(root, { dataTransfer: dt })
    const toasts = useToastStore.getState().toasts
    expect(toasts.some((t) => t.message.includes("Instruments can't go on the Master"))).toBe(false)
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
