/**
 * Shared 3-button "Unsaved Changes" dialog.
 *
 * Consolidates two previously near-identical inline dialogs in App.tsx:
 *   - showCloseDialog (app quit gate)
 *   - pendingNav (Cmd+O / Cmd+N discard prompt)
 *
 * Both use the same header + 3-button layout (Cancel / Discard / Save-then-act);
 * only the body sentence and the post-save callback differ. Per the simplicity
 * reviewer's bonus finding from the 2026-05-15 red-team pass.
 *
 * `isWorking` locks all three buttons during an in-flight Save & Continue —
 * this is RT-1's data-clobber-race guard. Callers must set it true around
 * their `await saveProject()` and clear it in `finally`.
 */
import { type ReactNode } from 'react'

interface UnsavedChangesDialogProps {
  open: boolean
  /** Sentence shown under the header. Caller-supplied so menu-action / quit
   *  callers can phrase it appropriately. */
  body: ReactNode
  /** True while a Save & Continue await is in flight. Locks all three buttons. */
  isWorking?: boolean
  /** Label of the "Save & ..." button. Defaults to "Save & Continue". */
  saveLabel?: string
  /** Cancel button — hide the dialog without acting. */
  onCancel: () => void
  /** Discard button — fire the destructive nav (close / open / new) without saving. */
  onDiscard: () => void
  /** Save button — await saveProject then fire the destructive nav. Caller
   *  manages the `isWorking` flag around its own await. */
  onSaveAndContinue: () => void | Promise<void>
}

export default function UnsavedChangesDialog({
  open,
  body,
  isWorking = false,
  saveLabel = 'Save & Continue',
  onCancel,
  onDiscard,
  onSaveAndContinue,
}: UnsavedChangesDialogProps) {
  if (!open) return null
  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog__header">Unsaved Changes</div>
        <p className="dialog__body">{body}</p>
        <div className="dialog__actions">
          <button
            className="dialog__btn dialog__btn--secondary"
            disabled={isWorking}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="dialog__btn dialog__btn--danger"
            disabled={isWorking}
            onClick={onDiscard}
          >
            Discard Changes
          </button>
          <button
            className="dialog__btn dialog__btn--primary"
            disabled={isWorking}
            onClick={() => {
              if (isWorking) return
              void onSaveAndContinue()
            }}
          >
            {isWorking ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
