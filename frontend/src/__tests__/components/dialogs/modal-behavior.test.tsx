/**
 * PUX.2 — useModalBehavior accessibility contract tests.
 *
 * 4 assertions × 10 dialog roster = 40 positive assertions
 * + 2 named negative tests = 42 total
 *
 * Roster (10 true modals — packet had 9; RelinkDialog added by UE.5):
 *   1. CrashRecoveryDialog
 *   2. FeedbackDialog
 *   3. TelemetryConsentDialog
 *   4. UnsavedChangesDialog
 *   5. RelinkDialog
 *   6. ExportDialog
 *   7. PresetSaveDialog
 *   8. Preferences
 *   9. AboutDialog
 *  10. SpeedDialog
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../../helpers/mock-entropic'

// --- Components under test ---
import CrashRecoveryDialog from '../../../renderer/components/dialogs/CrashRecoveryDialog'
import FeedbackDialog from '../../../renderer/components/dialogs/FeedbackDialog'
import TelemetryConsentDialog from '../../../renderer/components/dialogs/TelemetryConsentDialog'
import UnsavedChangesDialog from '../../../renderer/components/dialogs/UnsavedChangesDialog'
import RelinkDialog, { type MissingAsset } from '../../../renderer/components/dialogs/RelinkDialog'
import ExportDialog from '../../../renderer/components/export/ExportDialog'
import PresetSaveDialog from '../../../renderer/components/library/PresetSaveDialog'
import Preferences from '../../../renderer/components/layout/Preferences'
import AboutDialog from '../../../renderer/components/layout/AboutDialog'
import SpeedDialog from '../../../renderer/components/timeline/SpeedDialog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the aria-labeled dialog element and verify its title resolves. */
function assertDialogARIA(container: Element) {
  const dialog = container.querySelector('[role="dialog"]')
  expect(dialog, 'should have role="dialog"').not.toBeNull()
  expect(dialog!.getAttribute('aria-modal'), 'should have aria-modal="true"').toBe('true')
  const labelId = dialog!.getAttribute('aria-labelledby')
  expect(labelId, 'should have aria-labelledby').not.toBeNull()
  const titleEl = container.querySelector(`#${labelId!}`)
  expect(titleEl, `aria-labelledby "${labelId}" should resolve to an element`).not.toBeNull()
}

/** Fire an Escape keydown on the dialog element. */
function fireEscape(container: Element) {
  const dialog = container.querySelector('[role="dialog"]') as HTMLElement
  fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape', bubbles: true })
}

/** Fire a Tab keydown on the given element. */
function fireTab(el: HTMLElement, shift = false) {
  fireEvent.keyDown(el, {
    key: 'Tab',
    code: 'Tab',
    shiftKey: shift,
    bubbles: true,
  })
}

/** Collect all focusable elements within container. */
function getFocusable(container: Element): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

// ---------------------------------------------------------------------------
// Mock assets for RelinkDialog
// ---------------------------------------------------------------------------
const MOCK_ASSETS: MissingAsset[] = [
  { assetId: 'a1', name: 'clip.mp4', oldPath: '/old/clip.mp4', kind: 'video' },
]

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
  vi.restoreAllMocks()
})

// ===========================================================================
// 1. CrashRecoveryDialog
// ===========================================================================
describe('CrashRecoveryDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof CrashRecoveryDialog>> = {}) {
    return render(
      <CrashRecoveryDialog
        isOpen
        crashCount={1}
        hasAutosave={true}
        telemetryConsent={null}
        onRestore={vi.fn()}
        onDiscard={vi.fn()}
        {...props}
      />,
    )
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires the safe action — onDiscard) on Escape keydown', () => {
    const onDiscard = vi.fn()
    const { container } = renderDialog({ onDiscard })
    fireEscape(container)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 2. FeedbackDialog
// ===========================================================================
describe('FeedbackDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof FeedbackDialog>> = {}) {
    return render(<FeedbackDialog isOpen onClose={vi.fn()} {...props} />)
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onClose) on Escape keydown', () => {
    const onClose = vi.fn()
    const { container } = renderDialog({ onClose })
    fireEscape(container)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 3. TelemetryConsentDialog
// ===========================================================================
describe('TelemetryConsentDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof TelemetryConsentDialog>> = {}) {
    return render(<TelemetryConsentDialog isOpen onDecision={vi.fn()} {...props} />)
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onDecision(false) — safe conservative path) on Escape keydown', () => {
    const onDecision = vi.fn()
    const { container } = renderDialog({ onDecision })
    fireEscape(container)
    expect(onDecision).toHaveBeenCalledWith(false)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 4. UnsavedChangesDialog
// ===========================================================================
describe('UnsavedChangesDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof UnsavedChangesDialog>> = {}) {
    return render(
      <UnsavedChangesDialog
        open
        body="You have unsaved changes."
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndContinue={vi.fn()}
        {...props}
      />,
    )
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onCancel — safe path, no data loss) on Escape keydown', () => {
    const onCancel = vi.fn()
    const { container } = renderDialog({ onCancel })
    fireEscape(container)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 5. RelinkDialog (drift addition — added by UE.5 after packet audit day)
// ===========================================================================
describe('RelinkDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof RelinkDialog>> = {}) {
    return render(
      <RelinkDialog
        isOpen
        missingAssets={MOCK_ASSETS}
        onLocate={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
        onShowOpenDialog={vi.fn().mockResolvedValue(null)}
        {...props}
      />,
    )
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onClose) on Escape keydown', () => {
    const onClose = vi.fn()
    const { container } = renderDialog({ onClose })
    fireEscape(container)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 6. ExportDialog
// ===========================================================================
describe('ExportDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof ExportDialog>> = {}) {
    return render(
      <ExportDialog
        isOpen
        totalFrames={300}
        sourceWidth={1920}
        sourceHeight={1080}
        sourceFps={30}
        loopIn={null}
        loopOut={null}
        onExport={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />,
    )
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onClose) on Escape keydown', () => {
    const onClose = vi.fn()
    const { container } = renderDialog({ onClose })
    fireEscape(container)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 7. PresetSaveDialog
// ===========================================================================
describe('PresetSaveDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof PresetSaveDialog>> = {}) {
    return render(
      <PresetSaveDialog
        isOpen
        mode="single_effect"
        effectId="blur"
        parameters={{ radius: 5 }}
        onSave={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />,
    )
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onClose) on Escape keydown', () => {
    const onClose = vi.fn()
    const { container } = renderDialog({ onClose })
    fireEscape(container)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 8. Preferences
// ===========================================================================
describe('Preferences — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof Preferences>> = {}) {
    return render(<Preferences isOpen onClose={vi.fn()} {...props} />)
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onClose) on Escape keydown', () => {
    const onClose = vi.fn()
    const { container } = renderDialog({ onClose })
    fireEscape(container)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 9. AboutDialog
// ===========================================================================
describe('AboutDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof AboutDialog>> = {}) {
    return render(<AboutDialog isOpen onClose={vi.fn()} {...props} />)
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onClose) on Escape keydown', () => {
    const onClose = vi.fn()
    const { container } = renderDialog({ onClose })
    fireEscape(container)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// 10. SpeedDialog
// ===========================================================================
describe('SpeedDialog — PUX.2', () => {
  function renderDialog(props: Partial<React.ComponentProps<typeof SpeedDialog>> = {}) {
    return render(
      <SpeedDialog
        currentSpeed={1}
        clipDuration={5}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        position={{ x: 100, y: 100 }}
        {...props}
      />,
    )
  }

  it('renders with role="dialog", aria-modal="true", and aria-labelledby resolving to the title element', () => {
    const { container } = renderDialog()
    assertDialogARIA(container)
  })

  it('closes (fires onClose) on Escape keydown on the dialog container', () => {
    // The input-level handler fires onClose for Escape; the dialog-level hook
    // provides the same guarantee when focus is on a non-input element.
    const onClose = vi.fn()
    const { container } = renderDialog({ onClose })
    // Fire on dialog container directly (covers non-input-focus case)
    fireEscape(container)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wraps Tab from the last focusable element back to the first', () => {
    const { container } = renderDialog()
    const focusable = getFocusable(container)
    expect(focusable.length).toBeGreaterThan(0)
    const last = focusable[focusable.length - 1]
    last.focus()
    fireTab(last)
    expect(document.activeElement).toBe(focusable[0])
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = renderDialog()
    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

// ===========================================================================
// NEGATIVE TESTS
// ===========================================================================

describe('Focus trap — negative tests', () => {
  it('keeps focus inside the dialog after 20 Tab presses — focus never escapes to the background', () => {
    // Render a background button + the dialog.
    const bgButton = document.createElement('button')
    bgButton.textContent = 'Background'
    document.body.appendChild(bgButton)

    const { container } = render(<AboutDialog isOpen onClose={vi.fn()} />)
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement

    // Start focus on first focusable inside the dialog.
    const focusable = getFocusable(container)
    if (focusable.length > 0) focusable[0].focus()

    for (let i = 0; i < 20; i++) {
      const current = document.activeElement as HTMLElement
      fireTab(current)
      expect(dialog.contains(document.activeElement)).toBe(true)
    }

    cleanup()
    document.body.removeChild(bgButton)
  })

  it('does not close Preferences when Escape cancels an active ShortcutEditor key-capture', () => {
    /**
     * ShortcutEditor attaches window.addEventListener('keydown', ..., capture=true)
     * and calls stopPropagation() when capturingAction is set. This prevents the
     * Escape event from reaching the dialog-level useModalBehavior listener.
     *
     * We simulate this by attaching our own window capture listener that consumes
     * the Escape event (mirrors ShortcutEditor's behavior during active capture).
     */
    const onClose = vi.fn()
    const { container } = render(<Preferences isOpen onClose={onClose} />)
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement

    // Simulate an active nested capture consuming Escape at window level.
    const captureHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        // capture handler "cancels the capture" but does NOT close Preferences
      }
    }
    window.addEventListener('keydown', captureHandler, true)

    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape', bubbles: true })

    window.removeEventListener('keydown', captureHandler, true)

    // Preferences onClose must NOT have fired — capture consumed the event.
    expect(onClose).not.toHaveBeenCalled()

    cleanup()
  })
})
