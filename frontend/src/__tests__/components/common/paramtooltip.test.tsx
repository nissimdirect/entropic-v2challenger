import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import React from 'react'

import ParamTooltip from '../../../renderer/components/common/ParamTooltip'

// UC2 — name-matched component test for the ParamTooltip primitive
// (hover tooltip wrapping knobs/sliders; 500ms delay).

const HOVER_DELAY = 500

function setup(overrides: Partial<React.ComponentProps<typeof ParamTooltip>> = {}) {
  const utils = render(
    <ParamTooltip label="Cutoff" {...overrides}>
      <button type="button">child control</button>
    </ParamTooltip>,
  )
  const wrapper = utils.container.querySelector('.param-tooltip-wrapper') as HTMLElement
  return { ...utils, wrapper }
}

describe('ParamTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('render', () => {
    it('renders its children and no tooltip before hover', () => {
      const { container, wrapper } = setup()
      expect(wrapper).not.toBeNull()
      expect(container.querySelector('button')?.textContent).toBe('child control')
      expect(container.querySelector('.param-tooltip')).toBeNull()
    })
  })

  describe('core interaction', () => {
    it('shows label, description, range, and default after 500ms hover', () => {
      const { container, wrapper } = setup({
        description: 'Filter cutoff frequency',
        min: 20,
        max: 20000,
        unit: 'Hz',
        defaultValue: 440,
      })
      fireEvent.mouseEnter(wrapper)
      expect(container.querySelector('.param-tooltip')).toBeNull() // not yet
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      const tip = container.querySelector('.param-tooltip')
      expect(tip).not.toBeNull()
      expect(container.querySelector('.param-tooltip__label')?.textContent).toBe('Cutoff')
      expect(container.querySelector('.param-tooltip__desc')?.textContent).toBe(
        'Filter cutoff frequency',
      )
      expect(container.querySelector('.param-tooltip__range')?.textContent).toContain('20')
      expect(container.querySelector('.param-tooltip__range')?.textContent).toContain('20000')
      expect(container.querySelector('.param-tooltip__range')?.textContent).toContain('Hz')
      expect(container.querySelector('.param-tooltip__default')?.textContent).toBe('Default: 440')
    })

    it('hides again on mouse leave', () => {
      const { container, wrapper } = setup()
      fireEvent.mouseEnter(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      expect(container.querySelector('.param-tooltip')).not.toBeNull()
      fireEvent.mouseLeave(wrapper)
      expect(container.querySelector('.param-tooltip')).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('never shows if the pointer leaves before the 500ms delay elapses', () => {
      const { container, wrapper } = setup()
      fireEvent.mouseEnter(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY - 1))
      fireEvent.mouseLeave(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY * 2))
      expect(container.querySelector('.param-tooltip')).toBeNull()
    })

    it('omits range and default when min/max/defaultValue are not provided', () => {
      const { container, wrapper } = setup({ description: 'desc only' })
      fireEvent.mouseEnter(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      expect(container.querySelector('.param-tooltip')).not.toBeNull()
      expect(container.querySelector('.param-tooltip__range')).toBeNull()
      expect(container.querySelector('.param-tooltip__default')).toBeNull()
    })

    it('renders a false boolean default (falsy but defined)', () => {
      const { container, wrapper } = setup({ defaultValue: false })
      fireEvent.mouseEnter(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      expect(container.querySelector('.param-tooltip__default')?.textContent).toBe('Default: false')
    })
  })
})
