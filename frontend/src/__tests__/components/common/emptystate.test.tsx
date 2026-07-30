/**
 * EmptyState primitive tests — RATIFIED D7 + OD-4 override (UC4).
 *
 * Contract under test:
 *  - renders the hint line
 *  - exposes the stable data-testid (COMPONENT-SPEC §2)
 *  - class contract: root carries .cx-empty-state (the shared skin hook
 *    bound to the AA-verified --cx-text-3 / --cx-text-body pair)
 *  - NEGATIVE (OD-4): renders no button element, ever — no CTAs.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'

import EmptyState from '../../../renderer/components/common/EmptyState'

afterEach(() => {
  cleanup()
})

describe('EmptyState — D7/OD-4 primitive', () => {
  it('renders the hint text', () => {
    const { getByTestId } = render(
      <EmptyState hint="Drop a clip here to get started" testId="test-empty" />,
    )
    expect(getByTestId('test-empty').textContent).toBe('Drop a clip here to get started')
  })

  it('exposes the stable data-testid passed via the testId prop', () => {
    const { getByTestId } = render(<EmptyState hint="No devices" testId="chain-empty-hint" />)
    expect(getByTestId('chain-empty-hint')).toBeTruthy()
  })

  it('class contract: root element carries the shared .cx-empty-state skin class', () => {
    const { getByTestId } = render(<EmptyState hint="No devices" testId="chain-empty-hint" />)
    expect(getByTestId('chain-empty-hint').classList.contains('cx-empty-state')).toBe(true)
  })

  it('renders exactly one element — a single quiet hint line', () => {
    const { container } = render(<EmptyState hint="Nothing selected" testId="hint" />)
    expect(container.children.length).toBe(1)
    expect(container.querySelectorAll('*').length).toBe(1)
  })

  it('NEGATIVE (OD-4): never renders a button element — no CTAs in empty states', () => {
    const { container } = render(
      <EmptyState hint="Import media to begin" testId="no-cta-check" />,
    )
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('[role="button"]')).toBeNull()
  })

  it('F3-C4: optional className is appended alongside cx-empty-state, not replacing it', () => {
    const { getByTestId } = render(
      <EmptyState hint="Drag a clip here" testId="positioned-empty" className="preview-canvas__placeholder" />,
    )
    const el = getByTestId('positioned-empty')
    expect(el.classList.contains('cx-empty-state')).toBe(true)
    expect(el.classList.contains('preview-canvas__placeholder')).toBe(true)
  })
})
