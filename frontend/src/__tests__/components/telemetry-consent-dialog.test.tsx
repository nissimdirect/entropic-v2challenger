/**
 * TelemetryConsentDialog tests.
 * Loop 42 vitest coverage — locks the two-button decision flow.
 * No-deferral pass: code-verified path now has regression coverage.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

import TelemetryConsentDialog from '../../renderer/components/dialogs/TelemetryConsentDialog'

afterEach(() => {
  cleanup()
})

describe('TelemetryConsentDialog', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <TelemetryConsentDialog isOpen={false} onDecision={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders header + body text when open', () => {
    const { getByText } = render(
      <TelemetryConsentDialog isOpen={true} onDecision={vi.fn()} />,
    )
    expect(getByText('Help Improve Entropic')).toBeTruthy()
    expect(
      getByText(/We collect anonymous crash reports/i),
    ).toBeTruthy()
  })

  it('"No Thanks" calls onDecision(false)', () => {
    const onDecision = vi.fn()
    const { getByText } = render(
      <TelemetryConsentDialog isOpen={true} onDecision={onDecision} />,
    )
    fireEvent.click(getByText('No Thanks'))
    expect(onDecision).toHaveBeenCalledOnce()
    expect(onDecision).toHaveBeenCalledWith(false)
  })

  it('"Enable Crash Reporting" calls onDecision(true)', () => {
    const onDecision = vi.fn()
    const { getByText } = render(
      <TelemetryConsentDialog isOpen={true} onDecision={onDecision} />,
    )
    fireEvent.click(getByText('Enable Crash Reporting'))
    expect(onDecision).toHaveBeenCalledOnce()
    expect(onDecision).toHaveBeenCalledWith(true)
  })

  it('inner click does not bubble (overlay click-through guard)', () => {
    // The dialog calls stopPropagation on inner click — verify the handler is wired.
    const onDecision = vi.fn()
    const { container } = render(
      <TelemetryConsentDialog isOpen={true} onDecision={onDecision} />,
    )
    const inner = container.querySelector('.consent-dialog') as HTMLElement
    expect(inner).toBeTruthy()
    // Clicking the inner panel should not trigger any onDecision call.
    fireEvent.click(inner)
    expect(onDecision).not.toHaveBeenCalled()
  })
})
