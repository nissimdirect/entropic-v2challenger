/**
 * CrashRecoveryDialog tests.
 * Sprint 1C — verifies three scenarios, button actions, checkbox behavior.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

import CrashRecoveryDialog from '../../renderer/components/dialogs/CrashRecoveryDialog'

beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('CrashRecoveryDialog', () => {
  it('renders nothing when isOpen=false', () => {
    render(
      <CrashRecoveryDialog
        isOpen={false}
        crashCount={1}
        hasAutosave={true}
        telemetryConsent={null}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(document.querySelector('.crash-recovery')).toBeNull()
  })

  // --- Scenario: crash + autosave ---

  it('shows "Unexpected Shutdown" with autosave restore option', () => {
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={1}
        hasAutosave={true}
        telemetryConsent={null}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(document.querySelector('.crash-recovery__header')?.textContent).toContain(
      'Unexpected Shutdown',
    )
    expect(document.querySelector('.crash-recovery__btn--restore')).not.toBeNull()
    expect(
      document.querySelector('.crash-recovery__btn--neutral')?.textContent,
    ).toBe('Start Fresh')
  })

  // --- Scenario: crash only ---

  it('shows "Unexpected Shutdown" with Continue button (no autosave)', () => {
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={1}
        hasAutosave={false}
        telemetryConsent={null}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(document.querySelector('.crash-recovery__header')?.textContent).toContain(
      'Unexpected Shutdown',
    )
    expect(document.querySelector('.crash-recovery__btn--restore')).toBeNull()
    expect(
      document.querySelector('.crash-recovery__btn--neutral')?.textContent,
    ).toBe('Continue')
  })

  // --- Scenario: autosave only (no crash) ---

  it('shows "Unsaved Session Found" for autosave-only scenario', () => {
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={0}
        hasAutosave={true}
        telemetryConsent={null}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(document.querySelector('.crash-recovery__header')?.textContent).toContain(
      'Unsaved Session Found',
    )
  })

  // --- Button actions ---

  it('Restore calls onRestore with sendReport value', () => {
    const onRestore = vi.fn()
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={1}
        hasAutosave={true}
        telemetryConsent={null}
        onRestore={onRestore}
        onDiscard={vi.fn()}
      />,
    )

    const restoreBtn = document.querySelector('.crash-recovery__btn--restore') as HTMLElement
    fireEvent.click(restoreBtn)
    expect(onRestore).toHaveBeenCalledWith(false) // consent=null → checkbox unchecked
  })

  it('Discard calls onDiscard with sendReport value', () => {
    const onDiscard = vi.fn()
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={1}
        hasAutosave={true}
        telemetryConsent={null}
        onRestore={vi.fn()}
        onDiscard={onDiscard}
      />,
    )

    const discardBtn = document.querySelector('.crash-recovery__btn--neutral') as HTMLElement
    fireEvent.click(discardBtn)
    expect(onDiscard).toHaveBeenCalledWith(false)
  })

  // --- Checkbox behavior ---

  it('checkbox defaults to checked when telemetryConsent=true', () => {
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={1}
        hasAutosave={true}
        telemetryConsent={true}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )

    const checkbox = document.querySelector(
      '.crash-recovery__checkbox input',
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('checkbox defaults to unchecked when telemetryConsent=null', () => {
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={1}
        hasAutosave={true}
        telemetryConsent={null}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )

    const checkbox = document.querySelector(
      '.crash-recovery__checkbox input',
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('no checkbox shown for autosave-only (no crash)', () => {
    render(
      <CrashRecoveryDialog
        isOpen={true}
        crashCount={0}
        hasAutosave={true}
        telemetryConsent={true}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )

    expect(document.querySelector('.crash-recovery__checkbox')).toBeNull()
  })
})
