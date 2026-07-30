/**
 * select.test.tsx — name-matched test for the Select primitive
 * (COMPONENT-SPEC §2/§5 guard A: components/common/Select.tsx → select.test.tsx).
 *
 * Selector contract: elements are targeted by data-testid ONLY. The one
 * class assertion below checks the BEM state modifier (`cx-select--disabled`)
 * on an element reached via test-id — the state modifier IS the versioned
 * state API per COMPONENT-SPEC §1, not a styling hook.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import Select from '../../../renderer/components/common/Select'

afterEach(cleanup)

const OPTIONS = (
  <>
    <option value="a">Alpha</option>
    <option value="b">Beta</option>
    <option value="c">Gamma</option>
  </>
)

describe('Select primitive', () => {
  it('renders a NATIVE <select> and passes data-testid through to it', () => {
    const { getByTestId } = render(
      <Select data-testid="uc-select" defaultValue="b">
        {OPTIONS}
      </Select>,
    )
    const el = getByTestId('uc-select')
    expect(el.tagName).toBe('SELECT')
    expect((el as HTMLSelectElement).value).toBe('b')
  })

  it('renders all children options with their values', () => {
    const { getByTestId } = render(
      <Select data-testid="uc-select" defaultValue="a">
        {OPTIONS}
      </Select>,
    )
    const el = getByTestId('uc-select') as HTMLSelectElement
    expect(el.options.length).toBe(3)
    expect(Array.from(el.options).map((o) => o.value)).toEqual(['a', 'b', 'c'])
  })

  it('fires onChange with the picked value (native change semantics)', () => {
    // Capture target.value INSIDE the handler: with no state update, React
    // resets a controlled select after render, so post-hoc reads see the old
    // value. Uncontrolled (defaultValue) + in-handler capture is the honest
    // native-semantics assertion.
    const seen: string[] = []
    const onChange = vi.fn((e: React.ChangeEvent<HTMLSelectElement>) => {
      seen.push(e.target.value)
    })
    const { getByTestId } = render(
      <Select data-testid="uc-select" defaultValue="a" onChange={onChange}>
        {OPTIONS}
      </Select>,
    )
    fireEvent.change(getByTestId('uc-select'), { target: { value: 'c' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(seen).toEqual(['c'])
    expect((getByTestId('uc-select') as HTMLSelectElement).value).toBe('c')
  })

  it('disabled: sets the native disabled attr and the BEM state modifier', () => {
    const { getByTestId } = render(
      <Select data-testid="uc-select" disabled defaultValue="a">
        {OPTIONS}
      </Select>,
    )
    const el = getByTestId('uc-select') as HTMLSelectElement
    expect(el.disabled).toBe(true)
    // state contract: disabled is expressed as a BEM modifier on the block
    expect(el.parentElement?.classList.contains('cx-select--disabled')).toBe(true)
  })

  it('passes through arbitrary native select props (aria-label, name)', () => {
    const { getByTestId } = render(
      <Select data-testid="uc-select" aria-label="Mode" name="mode" defaultValue="a">
        {OPTIONS}
      </Select>,
    )
    const el = getByTestId('uc-select')
    expect(el.getAttribute('aria-label')).toBe('Mode')
    expect(el.getAttribute('name')).toBe('mode')
  })
})
