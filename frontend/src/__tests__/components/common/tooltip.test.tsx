import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import React from 'react'

import Tooltip from '../../../renderer/components/common/Tooltip'

// UC2 — name-matched component test for the generic Tooltip primitive
// (hover tooltip with text, optional shortcut/description, 500ms delay).

const HOVER_DELAY = 500

function setup(overrides: Partial<React.ComponentProps<typeof Tooltip>> = {}) {
  const utils = render(
    <Tooltip text="Play" {...overrides}>
      <button type="button">target</button>
    </Tooltip>,
  )
  const wrapper = utils.container.querySelector('.tooltip-wrapper') as HTMLElement
  return { ...utils, wrapper }
}

describe('Tooltip', () => {
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
      expect(container.querySelector('button')?.textContent).toBe('target')
      expect(container.querySelector('[role="tooltip"]')).toBeNull()
    })
  })

  describe('core interaction', () => {
    it('shows role="tooltip" with text, shortcut, and description after 500ms hover', () => {
      const { container, wrapper } = setup({
        shortcut: 'Cmd+P',
        description: 'Starts playback',
      })
      fireEvent.mouseEnter(wrapper)
      expect(container.querySelector('[role="tooltip"]')).toBeNull() // not yet
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      const tip = container.querySelector('[role="tooltip"]')
      expect(tip).not.toBeNull()
      expect(container.querySelector('.tooltip__text')?.textContent).toBe('Play')
      expect(container.querySelector('kbd.tooltip__shortcut')?.textContent).toBe('Cmd+P')
      expect(container.querySelector('.tooltip__description')?.textContent).toBe('Starts playback')
    })

    it('hides on mouse leave', () => {
      const { container, wrapper } = setup()
      fireEvent.mouseEnter(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      expect(container.querySelector('[role="tooltip"]')).not.toBeNull()
      fireEvent.mouseLeave(wrapper)
      expect(container.querySelector('[role="tooltip"]')).toBeNull()
    })

    it('applies the position modifier class (default top, explicit bottom)', () => {
      const first = setup()
      fireEvent.mouseEnter(first.wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      expect(first.container.querySelector('.tooltip--top')).not.toBeNull()
      first.unmount()

      const second = setup({ position: 'bottom' })
      fireEvent.mouseEnter(second.wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      expect(second.container.querySelector('.tooltip--bottom')).not.toBeNull()
    })
  })

  describe('edge cases', () => {
    it('never shows if the pointer leaves before the 500ms delay elapses', () => {
      const { container, wrapper } = setup()
      fireEvent.mouseEnter(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY - 1))
      fireEvent.mouseLeave(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY * 2))
      expect(container.querySelector('[role="tooltip"]')).toBeNull()
    })

    it('omits shortcut and description elements when not provided', () => {
      const { container, wrapper } = setup()
      fireEvent.mouseEnter(wrapper)
      act(() => vi.advanceTimersByTime(HOVER_DELAY))
      expect(container.querySelector('[role="tooltip"]')).not.toBeNull()
      expect(container.querySelector('.tooltip__shortcut')).toBeNull()
      expect(container.querySelector('.tooltip__description')).toBeNull()
    })
  })
})
