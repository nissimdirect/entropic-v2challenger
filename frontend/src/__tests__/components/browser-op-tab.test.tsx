/**
 * P4.6 — Browser op tab + drag-to-add operators.
 *
 * Named tests per packet spec:
 *  1. op tab lists exactly 10 operator types grouped as MODULATION(6) INPUTS(3) GATING(1)
 *  2. drop on track header adds an operator of the dragged type
 *  3. drop on a param knob adds operator plus auto-mapping at depth 1.0 linear
 *  4. drop is refused with a toast when operator count is at the 64 cap
 *  5. drop on an invalid target is a no-op without console errors
 *  6. rapid double-drop adds exactly two operators not three
 *
 * DnD MECHANISM REUSED FROM:
 *   frontend/src/renderer/components/effects/EffectBrowser.tsx:17-74
 *   (EFFECT_DRAG_TYPE + CREATRIX_NONCE_TYPE + SESSION_NONCE + parseDragPayload).
 *   No new drag system / no new npm drag lib — see operator-drag.ts header.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import EffectBrowser, {
  EFFECT_DRAG_TYPE,
  CREATRIX_NONCE_TYPE,
  SESSION_NONCE,
} from '../../renderer/components/effects/EffectBrowser'
import { OPERATOR_ENTRIES } from '../../renderer/components/effects/operator-drag'
import DeviceCard from '../../renderer/components/device-chain/DeviceCard'
import { TrackHeader } from '../../renderer/components/timeline/Track'
import { useBrowserStore } from '../../renderer/stores/browser'
import { useOperatorStore } from '../../renderer/stores/operators'
import { useToastStore } from '../../renderer/stores/toast'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import { LIMITS } from '../../shared/limits'
import type { EffectInfo, EffectInstance, Track, OperatorType } from '../../shared/types'

// ── Test fixtures ────────────────────────────────────────────────────────────
const MOCK_EFFECT: EffectInstance = {
  id: 'fx-1',
  effectId: 'pixelsort',
  isEnabled: true,
  isFrozen: false,
  parameters: { threshold: 0.5 },
  modulations: {},
  mix: 1.0,
  mask: null,
}

const MOCK_INFO: EffectInfo = {
  id: 'pixelsort',
  name: 'Pixel Sort',
  category: 'glitch',
  params: {
    threshold: { type: 'float', min: 0, max: 1, default: 0.5, label: 'Threshold' },
  },
}

const MOCK_TRACK: Track = {
  id: 'track-1',
  type: 'video',
  name: 'V1',
  color: '#4ade80',
  isMuted: false,
  isSoloed: false,
  clips: [],
  effectChain: [],
  automationLanes: [],
}

/**
 * Build a jsdom-safe DataTransfer that round-trips setData → getData, so the
 * EXACT operator payload written by startOperatorDrag can be replayed into a
 * drop target. (jsdom has no real DataTransfer.) `kind` defaults to 'operator'.
 */
function operatorDataTransfer(opType: string, opts?: { nonce?: string; kind?: string }): DataTransfer {
  const store: Record<string, string> = {
    [EFFECT_DRAG_TYPE]: JSON.stringify({ kind: opts?.kind ?? 'operator', id: `builtin:${opType}` }),
    [CREATRIX_NONCE_TYPE]: opts?.nonce ?? SESSION_NONCE,
  }
  return {
    getData: (type: string) => store[type] ?? '',
    setData: (type: string, val: string) => { store[type] = val },
    types: Object.keys(store),
    dropEffect: '',
    effectAllowed: '',
  } as unknown as DataTransfer
}

function resetStores() {
  useBrowserStore.setState({ activeTab: 'fx' })
  useToastStore.setState({ toasts: [] })
  useOperatorStore.getState().resetOperators()
  useUndoStore.getState().clear()
  useTimelineStore.getState().reset()
}

beforeEach(() => {
  setupMockEntropic()
  resetStores()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
  resetStores()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('P4.6 — op tab listing', () => {
  it('op tab lists exactly 10 operator types grouped as MODULATION(6) INPUTS(3) GATING(1)', () => {
    useBrowserStore.setState({ activeTab: 'op' })
    const { container } = render(
      <EffectBrowser registry={[]} isLoading={false} onAddEffect={vi.fn()} chainLength={0} />,
    )

    // Exactly 10 operator entries.
    const items = container.querySelectorAll('.effect-browser__item--operator')
    expect(items).toHaveLength(10)

    // Grouped: MODULATION(6) INPUTS(3) GATING(1).
    const mod = container.querySelector('[data-testid="op-group-MODULATION"]')
    const inp = container.querySelector('[data-testid="op-group-INPUTS"]')
    const gat = container.querySelector('[data-testid="op-group-GATING"]')
    expect(mod).toBeTruthy()
    expect(inp).toBeTruthy()
    expect(gat).toBeTruthy()
    expect(mod!.querySelectorAll('.effect-browser__item--operator')).toHaveLength(6)
    expect(inp!.querySelectorAll('.effect-browser__item--operator')).toHaveLength(3)
    expect(gat!.querySelectorAll('.effect-browser__item--operator')).toHaveLength(1)

    // The 3 newly-enabled implemented types are present; stubs are absent.
    expect(container.querySelector('[data-testid="op-item-sidechain"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="op-item-gate"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="op-item-midiEnvStutter"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="op-item-kentaroCluster"]')).toBeTruthy()
    // Out-of-scope stubs (S&H / Random / MATH / MIDI-CC / Playhead) NOT listed.
    const labels = Array.from(items).map((b) => b.textContent)
    expect(labels.some((l) => /S&H|Random|Clamp|MIDI CC|Playhead|Multiply|^Add$/.test(l ?? ''))).toBe(false)

    // Total matches the flat entries list.
    expect(items).toHaveLength(OPERATOR_ENTRIES.length)
  })

  it('each op entry is a drag source writing the reused EFFECT_DRAG_TYPE + nonce payload', () => {
    useBrowserStore.setState({ activeTab: 'op' })
    const { container } = render(
      <EffectBrowser registry={[]} isLoading={false} onAddEffect={vi.fn()} chainLength={0} />,
    )
    const lfo = container.querySelector('[data-testid="op-item-lfo"]') as HTMLButtonElement
    expect(lfo.getAttribute('draggable')).toBe('true')

    const captured: Record<string, string> = {}
    const dt = { setData: (t: string, v: string) => { captured[t] = v }, effectAllowed: '' } as unknown as DataTransfer
    fireEvent.dragStart(lfo, { dataTransfer: dt })

    expect(captured[CREATRIX_NONCE_TYPE]).toBe(SESSION_NONCE)
    const parsed = JSON.parse(captured[EFFECT_DRAG_TYPE])
    expect(parsed.kind).toBe('operator')
    expect(parsed.id).toBe('builtin:lfo')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('P4.6 — drop on track header', () => {
  it('drop on track header adds an operator of the dragged type', () => {
    // Seed the timeline store with the track so TrackHeader's store reads resolve.
    useTimelineStore.setState({ tracks: [MOCK_TRACK] } as never)
    const { container } = render(<TrackHeader track={MOCK_TRACK} isSelected={false} />)
    const header = container.querySelector('.track-header') as HTMLElement
    expect(header).toBeTruthy()

    expect(useOperatorStore.getState().operators).toHaveLength(0)
    fireEvent.drop(header, { dataTransfer: operatorDataTransfer('envelope') })

    const ops = useOperatorStore.getState().operators
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('envelope')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('P4.6 — drop on param knob', () => {
  function renderCard() {
    return render(
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
  }

  it('drop on a param knob adds operator plus auto-mapping at depth 1.0 linear', () => {
    const { container } = renderCard()
    const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement
    expect(knob).toBeTruthy()

    fireEvent.drop(knob, { dataTransfer: operatorDataTransfer('lfo') })

    const ops = useOperatorStore.getState().operators
    expect(ops).toHaveLength(1)
    expect(ops[0].type).toBe('lfo')
    expect(ops[0].mappings).toHaveLength(1)
    const m = ops[0].mappings[0]
    expect(m.targetEffectId).toBe('fx-1')
    expect(m.targetParamKey).toBe('threshold')
    expect(m.depth).toBe(1.0)
    expect(m.min).toBe(0)
    expect(m.max).toBe(1)
    expect(m.curve).toBe('linear')
  })

  it('drop is refused with a toast when operator count is at the 64 cap', () => {
    // Fill to the MAX_OPERATORS cap.
    for (let i = 0; i < LIMITS.MAX_OPERATORS; i++) useOperatorStore.getState().addOperator('lfo')
    expect(useOperatorStore.getState().operators).toHaveLength(LIMITS.MAX_OPERATORS)

    const { container } = renderCard()
    const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement
    fireEvent.drop(knob, { dataTransfer: operatorDataTransfer('lfo') })

    // Store stays at exactly 64 (no 65th operator, no mapping added).
    expect(useOperatorStore.getState().operators).toHaveLength(LIMITS.MAX_OPERATORS)
    // Exactly ONE toast, carrying a source field (rate-limit key). Not silent.
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].source).toBe('operator-cap')
  })

  it('drop on an invalid target is a no-op without console errors', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderCard()
    const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement

    // 1) A non-operator drag (kind:'fx') → rejected by parseOperatorDrop.
    fireEvent.drop(knob, { dataTransfer: operatorDataTransfer('lfo', { kind: 'fx' }) })
    // 2) A spoofed/external drag (wrong nonce) → rejected.
    fireEvent.drop(knob, { dataTransfer: operatorDataTransfer('lfo', { nonce: 'bad-nonce' }) })

    expect(useOperatorStore.getState().operators).toHaveLength(0)
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('rapid double-drop adds exactly two operators not three', () => {
    const { container } = renderCard()
    const knob = container.querySelector('[data-testid="param-knob-fx-1-threshold"]') as HTMLElement

    fireEvent.drop(knob, { dataTransfer: operatorDataTransfer('lfo') })
    fireEvent.drop(knob, { dataTransfer: operatorDataTransfer('lfo') })

    const ops = useOperatorStore.getState().operators
    expect(ops).toHaveLength(2)
    // Each drop produced its own operator + one mapping (no phantom third).
    expect(ops.every((o) => o.mappings.length === 1)).toBe(true)
  })
})
