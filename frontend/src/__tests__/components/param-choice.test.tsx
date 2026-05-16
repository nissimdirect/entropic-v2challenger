/**
 * Loop 46 (Phase G) — ParamChoice dropdown.
 *
 * Covers the "test non-default selections" expectation: render with options,
 * fire onChange with the new value, handle empty / missing options.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import ParamChoice from '../../renderer/components/effects/ParamChoice'
import type { ParamDef } from '../../shared/types'

afterEach(cleanup)

const HSL_TARGET_HUE_DEF: ParamDef = {
  type: 'choice',
  label: 'Target Hue',
  default: 'all',
  options: ['all', 'red', 'orange', 'yellow', 'green', 'blue', 'magenta'],
}

describe('ParamChoice (Loop 46)', () => {
  it('renders label + select with every option', () => {
    const { getByText, container } = render(
      <ParamChoice paramKey="target_hue" def={HSL_TARGET_HUE_DEF} value="all" onChange={vi.fn()} />,
    )
    expect(getByText('Target Hue')).toBeTruthy()
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select).toBeTruthy()
    expect(select.options.length).toBe(7)
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'all',
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'magenta',
    ])
  })

  it('reflects the current value on the select', () => {
    const { container } = render(
      <ParamChoice paramKey="target_hue" def={HSL_TARGET_HUE_DEF} value="red" onChange={vi.fn()} />,
    )
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('red')
  })

  it('fires onChange with (paramKey, value) on selection', () => {
    const onChange = vi.fn()
    const { container } = render(
      <ParamChoice paramKey="target_hue" def={HSL_TARGET_HUE_DEF} value="all" onChange={onChange} />,
    )
    const select = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'blue' } })
    expect(onChange).toHaveBeenCalledWith('target_hue', 'blue')
  })

  it('renders 0 options safely when def.options is undefined', () => {
    const def = { ...HSL_TARGET_HUE_DEF, options: undefined } as unknown as ParamDef
    const { container } = render(
      <ParamChoice paramKey="x" def={def} value="" onChange={vi.fn()} />,
    )
    const select = container.querySelector('select') as HTMLSelectElement
    expect(select.options.length).toBe(0)
  })

  it('renders 0 options when def.options is empty array', () => {
    const def = { ...HSL_TARGET_HUE_DEF, options: [] }
    const { container } = render(
      <ParamChoice paramKey="x" def={def} value="" onChange={vi.fn()} />,
    )
    expect((container.querySelector('select') as HTMLSelectElement).options.length).toBe(0)
  })
})
