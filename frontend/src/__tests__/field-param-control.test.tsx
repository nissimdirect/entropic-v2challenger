/**
 * P6.6 — DeviceCard "Field…" assignment control tests (vitest component layer).
 *
 * Covers (named in packet TEST PLAN):
 *   - field option only on fieldParams entries
 *   - assign sets __field__ value
 *   - clear restores scalar
 *   - undo round-trip (store-level, via project store updateParam undoable)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

import DeviceCard from '../renderer/components/device-chain/DeviceCard'
import type { EffectInstance, EffectInfo, ParamValue } from '../shared/types'
import { isFieldRef, makeFieldRef } from '../shared/field-param'
import { useProjectStore } from '../renderer/stores/project'
import { useTimelineStore } from '../renderer/stores/timeline'
import { useUndoStore } from '../renderer/stores/undo'

const effectInfo: EffectInfo = {
  id: 'fx.blur',
  name: 'Blur',
  category: 'blur',
  params: {
    radius: { type: 'float', min: 0, max: 20, default: 5, label: 'Radius' },
    angle: { type: 'float', min: 0, max: 360, default: 0, label: 'Angle' },
  },
  fieldParams: ['radius'], // only radius is field-capable
}

function makeEffect(overrides: Partial<EffectInstance> = {}): EffectInstance {
  return {
    id: 'e1',
    effectId: 'fx.blur',
    isEnabled: true,
    isFrozen: false,
    parameters: { radius: 5, angle: 0 },
    modulations: {},
    mix: 1.0,
    mask: null,
    ...overrides,
  }
}

const sources = [
  { id: 'asset-1', label: 'clip.mp4', kind: 'video' as const },
  { id: 'asset-2', label: 'photo.png', kind: 'image' as const },
]

function renderCard(props: Partial<React.ComponentProps<typeof DeviceCard>> = {}) {
  const onUpdateParam = vi.fn()
  const utils = render(
    <DeviceCard
      effect={makeEffect()}
      effectInfo={effectInfo}
      isSelected={false}
      onSelect={() => {}}
      onToggle={() => {}}
      onRemove={() => {}}
      onUpdateParam={onUpdateParam}
      onSetMix={() => {}}
      fieldSources={sources}
      {...props}
    />,
  )
  return { ...utils, onUpdateParam }
}

describe('DeviceCard Field… control', () => {
  beforeEach(() => {
    // jsdom: ensure window.entropic absent → mask thumbnail effect is a no-op
    ;(globalThis as any).window = globalThis as any
  })
  afterEach(() => cleanup())

  it('field option only on fieldParams entries', () => {
    const { queryByTestId } = renderCard()
    // radius IS field-capable → field-assign select present
    expect(queryByTestId('field-assign-e1-radius')).toBeTruthy()
    // angle is NOT field-capable → no field-assign select
    expect(queryByTestId('field-assign-e1-angle')).toBeNull()
  })

  it('assign sets __field__ value', () => {
    const { getByTestId, onUpdateParam } = renderCard()
    const select = getByTestId('field-assign-e1-radius') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'asset-1' } })
    expect(onUpdateParam).toHaveBeenCalledTimes(1)
    const [effectId, paramName, value] = onUpdateParam.mock.calls[0]
    expect(effectId).toBe('e1')
    expect(paramName).toBe('radius')
    expect(isFieldRef(value)).toBe(true)
    expect((value as any).__field__).toMatchObject({
      kind: 'video',
      source_id: 'asset-1',
      gain: 1,
      invert: false,
    })
  })

  it('clear restores scalar', () => {
    // Render with an already-field-valued radius; Clear should restore default (5)
    const fieldEffect = makeEffect({
      parameters: {
        radius: { __field__: { kind: 'image', source_id: 'asset-2', gain: 2, invert: false } } as ParamValue,
        angle: 0,
      },
    })
    const { getByTestId, onUpdateParam } = renderCard({ effect: fieldEffect })
    // a field badge renders instead of a knob
    expect(getByTestId('field-badge-e1-radius')).toBeTruthy()
    fireEvent.click(getByTestId('field-clear-e1-radius'))
    expect(onUpdateParam).toHaveBeenCalledTimes(1)
    const [, paramName, value] = onUpdateParam.mock.calls[0]
    expect(paramName).toBe('radius')
    // No prior scalar stashed in this fresh render → restores the param default (5)
    expect(value).toBe(5)
  })

  it('gain slider clamps and invert toggles on a field value', () => {
    const fieldEffect = makeEffect({
      parameters: {
        radius: { __field__: { kind: 'image', source_id: 'asset-2', gain: 1, invert: false } } as ParamValue,
        angle: 0,
      },
    })
    const { getByTestId, onUpdateParam } = renderCard({ effect: fieldEffect })
    fireEvent.change(getByTestId('field-gain-e1-radius'), { target: { value: '3.5' } })
    expect((onUpdateParam.mock.calls[0][2] as any).__field__.gain).toBeCloseTo(3.5, 5)
    fireEvent.click(getByTestId('field-invert-e1-radius'))
    expect((onUpdateParam.mock.calls[1][2] as any).__field__.invert).toBe(true)
  })
})

describe('field param undo round-trip (store layer)', () => {
  beforeEach(() => {
    useTimelineStore.getState().reset()
    useUndoStore.getState().clear()
  })

  function addBlurEffect(trackId: string): string {
    const effect: EffectInstance = {
      id: `blur-${trackId}`,
      effectId: 'fx.blur',
      isEnabled: true,
      isFrozen: false,
      parameters: { radius: 5 },
      modulations: {},
      mix: 1,
      mask: null,
    }
    useProjectStore.getState().addEffect(trackId, effect)
    return effect.id
  }

  function radiusOf(trackId: string, effectId: string): ParamValue | undefined {
    const chain = useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.effectChain
    return chain.find((e) => e.id === effectId)!.parameters.radius
  }

  it('undo round-trip restores the scalar after a field assignment', () => {
    const trackId = useTimelineStore.getState().addTrack('V1', '#ff0000')!
    const eid = addBlurEffect(trackId)
    expect(radiusOf(trackId, eid)).toBe(5)

    useUndoStore.getState().clear()
    useProjectStore.getState().updateParam(trackId, eid, 'radius', makeFieldRef('image', 'asset-2', 1, false))
    expect(isFieldRef(radiusOf(trackId, eid))).toBe(true)

    useUndoStore.getState().undo()
    expect(radiusOf(trackId, eid)).toBe(5)

    useUndoStore.getState().redo()
    expect(isFieldRef(radiusOf(trackId, eid))).toBe(true)
  })
})
