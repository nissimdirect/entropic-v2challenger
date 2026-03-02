/**
 * TelemetryConsentDialog tests.
 * Sprint 1B — verifies rendering, button actions, non-dismissibility.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import TelemetryConsentDialog from '../../renderer/components/dialogs/TelemetryConsentDialog'

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('TelemetryConsentDialog', () => {
  it('renders nothing when isOpen=false', () => {
    render(<TelemetryConsentDialog isOpen={false} onDecision={vi.fn()} />)
    expect(document.querySelector('.consent-dialog')).toBeNull()
  })

  it('renders dialog when isOpen=true', () => {
    render(<TelemetryConsentDialog isOpen={true} onDecision={vi.fn()} />)
    expect(document.querySelector('.consent-dialog')).not.toBeNull()
    expect(document.querySelector('.consent-dialog__header')?.textContent).toContain(
      'Help Improve Entropic',
    )
  })

  it('"Enable Crash Reporting" calls onDecision(true)', () => {
    const onDecision = vi.fn()
    render(<TelemetryConsentDialog isOpen={true} onDecision={onDecision} />)

    const enableBtn = document.querySelector('.consent-dialog__btn--enable') as HTMLElement
    expect(enableBtn).not.toBeNull()
    fireEvent.click(enableBtn)
    expect(onDecision).toHaveBeenCalledWith(true)
  })

  it('"No Thanks" calls onDecision(false)', () => {
    const onDecision = vi.fn()
    render(<TelemetryConsentDialog isOpen={true} onDecision={onDecision} />)

    const neutralBtn = document.querySelector('.consent-dialog__btn--neutral') as HTMLElement
    expect(neutralBtn).not.toBeNull()
    fireEvent.click(neutralBtn)
    expect(onDecision).toHaveBeenCalledWith(false)
  })

  it('overlay click does NOT dismiss', () => {
    const onDecision = vi.fn()
    render(<TelemetryConsentDialog isOpen={true} onDecision={onDecision} />)

    const overlay = document.querySelector('.consent-dialog__overlay') as HTMLElement
    fireEvent.click(overlay)
    expect(onDecision).not.toHaveBeenCalled()
  })

  it('has no close/X button', () => {
    render(<TelemetryConsentDialog isOpen={true} onDecision={vi.fn()} />)
    expect(document.querySelector('.consent-dialog__close')).toBeNull()
  })

  it('shows "Takes effect on next launch" note', () => {
    render(<TelemetryConsentDialog isOpen={true} onDecision={vi.fn()} />)
    const note = document.querySelector('.consent-dialog__note')
    expect(note?.textContent).toContain('next launch')
  })
})
