import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'

import NumberInput from '../../../renderer/components/common/NumberInput'

// UC2 — name-matched component test for the NumberInput primitive
// (inline edit field spawned by Knob/Slider double-click).

function setup(overrides: Partial<React.ComponentProps<typeof NumberInput>> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  const props = {
    value: 50,
    min: 0,
    max: 100,
    step: 0.1,
    onConfirm,
    onCancel,
    ...overrides,
  }
  const utils = render(<NumberInput {...props} />)
  const input = utils.container.querySelector('input.number-input') as HTMLInputElement
  return { ...utils, input, onConfirm, onCancel }
}

describe('NumberInput render', () => {
  it('renders a text input pre-filled with the current value', () => {
    const { input } = setup({ value: 42 })
    expect(input).not.toBeNull()
    expect(input.value).toBe('42')
    expect(input.getAttribute('inputmode')).toBe('decimal')
  })
})

describe('NumberInput core interaction', () => {
  it('Enter confirms the typed value', () => {
    const { input, onConfirm, onCancel } = setup()
    fireEvent.change(input, { target: { value: '73.5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith(73.5)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Escape cancels without confirming', () => {
    const { input, onConfirm, onCancel } = setup()
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('blur (click outside) confirms the typed value', () => {
    const { input, onConfirm } = setup()
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.blur(input)
    expect(onConfirm).toHaveBeenCalledWith(12)
  })
})

describe('NumberInput edge cases', () => {
  it('invalid (non-numeric) input cancels instead of confirming NaN', () => {
    const { input, onConfirm, onCancel } = setup()
    fireEvent.change(input, { target: { value: 'garbage' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('empty input cancels instead of confirming NaN', () => {
    const { input, onConfirm, onCancel } = setup()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('clamps values above max and below min', () => {
    const { input, onConfirm } = setup({ min: 0, max: 100 })
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenLastCalledWith(100)

    fireEvent.change(input, { target: { value: '-500' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenLastCalledWith(0)
  })

  it('rounds to integer when step >= 1', () => {
    const { input, onConfirm } = setup({ step: 1 })
    fireEvent.change(input, { target: { value: '42.7' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledWith(43)
  })
})
