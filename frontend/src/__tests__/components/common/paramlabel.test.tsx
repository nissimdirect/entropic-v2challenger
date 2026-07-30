import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

import ParamLabel from '../../../renderer/components/common/ParamLabel'

// UC2 — name-matched component test for the ParamLabel primitive
// (param name + formatted value + unit, description via title attr).

describe('ParamLabel render', () => {
  it('renders the param name and formatted float value with unit', () => {
    const { container } = render(
      <ParamLabel label="Cutoff" value={440.5} unit="Hz" type="float" />,
    )
    expect(container.querySelector('.param-label__name')?.textContent).toBe('Cutoff')
    expect(container.querySelector('.param-label__value')?.textContent).toBe('440.50Hz')
  })

  it('exposes the description as a hover tooltip (title attribute)', () => {
    const { container } = render(
      <ParamLabel label="Mix" value={1} type="float" description="Dry/wet blend" />,
    )
    expect(container.querySelector('.param-label')?.getAttribute('title')).toBe('Dry/wet blend')
  })
})

describe('ParamLabel core formatting', () => {
  it('rounds int-typed values and omits missing unit', () => {
    const { container } = render(
      <ParamLabel label="Steps" value={7.6} type="int" />,
    )
    expect(container.querySelector('.param-label__value')?.textContent).toBe('8')
  })

  it('formats a 0..1 percent param as a whole percentage (UAT P5)', () => {
    const { container } = render(
      <ParamLabel label="Amount" value={0.5} unit="%" type="float" max={1} />,
    )
    expect(container.querySelector('.param-label__value')?.textContent).toBe('50%')
  })
})

describe('ParamLabel edge cases', () => {
  it('percent unit with max > 1 falls back to plain formatting (no re-scaling)', () => {
    const { container } = render(
      <ParamLabel label="Depth" value={50} unit="%" type="float" max={100} />,
    )
    expect(container.querySelector('.param-label__value')?.textContent).toBe('50.00%')
  })

  it('renders without description (no title) and with value 0', () => {
    const { container } = render(<ParamLabel label="Gain" value={0} type="float" unit="dB" />)
    const root = container.querySelector('.param-label')
    expect(root?.getAttribute('title')).toBeNull()
    expect(container.querySelector('.param-label__value')?.textContent).toBe('0.00dB')
  })
})
