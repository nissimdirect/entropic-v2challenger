import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'

import Slider from '../../../renderer/components/common/Slider'

// UC2 — name-matched component test for the Slider primitive
// (horizontal slider; keyboard/reset/inline-edit interaction model shared
// with Knob — ARIA render coverage complements knob.test.ts).

function setup(overrides: Partial<React.ComponentProps<typeof Slider>> = {}) {
  const onChange = vi.fn()
  const props = {
    value: 50,
    min: 0,
    max: 100,
    default: 25,
    label: 'Cutoff',
    type: 'float' as const,
    unit: 'Hz',
    onChange,
    ...overrides,
  }
  const utils = render(<Slider {...props} />)
  const track = utils.container.querySelector('[role="slider"]') as HTMLElement
  return { ...utils, track, onChange, props }
}

describe('Slider render', () => {
  it('renders label, formatted value, and an ARIA slider track', () => {
    const { container, track } = setup()
    expect(container.querySelector('.hslider__label')?.textContent).toBe('Cutoff')
    expect(container.querySelector('.hslider__value')?.textContent).toBe('50.00Hz')
    expect(track).not.toBeNull()
    expect(track.getAttribute('aria-valuemin')).toBe('0')
    expect(track.getAttribute('aria-valuemax')).toBe('100')
    expect(track.getAttribute('aria-valuenow')).toBe('50')
    expect(track.getAttribute('aria-orientation')).toBe('horizontal')
  })

  it('renders the ghost fill only when ghostValue diverges from value', () => {
    const withGhost = setup({ ghostValue: 80 })
    expect(withGhost.container.querySelector('.hslider__ghost')).not.toBeNull()
    withGhost.unmount()

    const sameGhost = setup({ ghostValue: 50 })
    expect(sameGhost.container.querySelector('.hslider__ghost')).toBeNull()
    sameGhost.unmount()

    const noGhost = setup()
    expect(noGhost.container.querySelector('.hslider__ghost')).toBeNull()
  })
})

describe('Slider core interaction', () => {
  it('ArrowRight increases by 1% of range; Shift+ArrowRight by 10%', () => {
    const { track, onChange } = setup()
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(51)
    fireEvent.keyDown(track, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(60)
  })

  it('ArrowLeft decreases the value', () => {
    const { track, onChange } = setup()
    fireEvent.keyDown(track, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(49)
  })

  it('right-click (context menu) resets to the default value', () => {
    const { track, onChange } = setup({ default: 25 })
    fireEvent.contextMenu(track)
    expect(onChange).toHaveBeenCalledWith(25)
  })

  it('double-click on the value opens the inline NumberInput; confirm clamps and closes', () => {
    const { container, onChange } = setup()
    const valueEl = container.querySelector('.hslider__value') as HTMLElement
    fireEvent.doubleClick(valueEl)
    const input = container.querySelector('input.number-input') as HTMLInputElement
    expect(input).not.toBeNull()
    fireEvent.change(input, { target: { value: '250' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(100) // clamped to max
    expect(container.querySelector('input.number-input')).toBeNull() // editing closed
  })
})

describe('Slider F3-C2 compact-adoption extensions', () => {
  it('showHeader=false omits the header row but keeps the aria-labeled track', () => {
    const { container, track } = setup({ showHeader: false })
    expect(container.querySelector('.hslider__header')).toBeNull()
    expect(track).not.toBeNull()
    expect(track.getAttribute('aria-label')).toBe('Cutoff')
  })

  it('showHeader=false disables double-click-to-edit (no header to host the NumberInput)', () => {
    const { container, track } = setup({ showHeader: false })
    fireEvent.doubleClick(track)
    expect(container.querySelector('input.number-input')).toBeNull()
  })

  it('onContextMenu override replaces the default reset-to-default behavior', () => {
    const onContextMenu = vi.fn()
    const { track, onChange } = setup({ onContextMenu, default: 25 })
    fireEvent.contextMenu(track)
    expect(onContextMenu).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('default is optional — right-click resets to min when omitted', () => {
    const { track, onChange } = setup({ default: undefined, min: 10 })
    fireEvent.contextMenu(track)
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('testId lands data-testid on the track (the interactive element)', () => {
    const { container } = setup({ testId: 'granulator-x-grain' })
    expect(container.querySelector('[data-testid="granulator-x-grain"]')).not.toBeNull()
  })

  it('onClick passthrough lands on the track (role="slider", so it stays exempt from static-element-interaction a11y checks)', () => {
    const onClick = vi.fn()
    const { track } = setup({ onClick })
    fireEvent.click(track)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled blocks pointer, keyboard, and context-menu interaction', () => {
    const { track, onChange } = setup({ disabled: true })
    expect(track.getAttribute('aria-disabled')).toBe('true')
    expect(track.getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    fireEvent.contextMenu(track)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Slider edge cases', () => {
  it('clamps keyboard increments at max (no overshoot)', () => {
    const { track, onChange } = setup({ value: 100 })
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(100)
  })

  it('clamps keyboard decrements at min', () => {
    const { track, onChange } = setup({ value: 0 })
    fireEvent.keyDown(track, { key: 'ArrowLeft', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('int-typed slider rounds keyboard results and aria-valuenow', () => {
    const { track, onChange } = setup({ type: 'int', value: 7, min: 0, max: 10 })
    expect(track.getAttribute('aria-valuenow')).toBe('7')
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    // 7 + 10*0.01 = 7.1 → rounds to 7 for int params
    expect(onChange).toHaveBeenLastCalledWith(7)
    fireEvent.keyDown(track, { key: 'ArrowRight', shiftKey: true })
    // 7 + 10*0.1 = 8
    expect(onChange).toHaveBeenLastCalledWith(8)
  })
})
