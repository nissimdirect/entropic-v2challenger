import { useState, useRef } from 'react'
import { useModalBehavior } from '../../hooks/useModalBehavior'

interface CrashRecoveryDialogProps {
  isOpen: boolean
  crashCount: number
  hasAutosave: boolean
  telemetryConsent: boolean | null
  onRestore: (sendReport: boolean) => void
  onDiscard: (sendReport: boolean) => void
}

export default function CrashRecoveryDialog({
  isOpen,
  crashCount,
  hasAutosave,
  telemetryConsent,
  onRestore,
  onDiscard,
}: CrashRecoveryDialogProps) {
  const [sendReport, setSendReport] = useState(telemetryConsent === true)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape maps to the safe (non-data-loss) path: onDiscard.
  useModalBehavior(dialogRef, () => onDiscard(sendReport))

  if (!isOpen) return null

  const hasCrash = crashCount > 0
  const showCheckbox = hasCrash

  // Determine scenario
  let title: string
  let message: string
  if (hasCrash && hasAutosave) {
    title = 'Unexpected Shutdown'
    message = "Creatrix didn't shut down properly. An autosave was found."
  } else if (hasCrash) {
    title = 'Unexpected Shutdown'
    message = "Creatrix didn't shut down properly."
  } else {
    title = 'Unsaved Session Found'
    message = 'An unsaved session was found from a previous session.'
  }

  return (
    <div className="crash-recovery__overlay">
      <div
        ref={dialogRef}
        className="crash-recovery"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crash-recovery-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crash-recovery__header">
          <span id="crash-recovery-title">{title}</span>
        </div>
        <div className="crash-recovery__body">
          <p className="crash-recovery__text">{message}</p>
          {showCheckbox && (
            <label className="crash-recovery__checkbox">
              <input
                type="checkbox"
                checked={sendReport}
                onChange={(e) => setSendReport(e.target.checked)}
              />
              Send anonymous crash report
            </label>
          )}
        </div>
        <div className="crash-recovery__footer">
          <button
            className="crash-recovery__btn crash-recovery__btn--neutral"
            onClick={() => onDiscard(sendReport)}
          >
            {hasAutosave ? 'Start Fresh' : 'Continue'}
          </button>
          {hasAutosave && (
            <button
              className="crash-recovery__btn crash-recovery__btn--restore"
              onClick={() => onRestore(sendReport)}
            >
              Restore Autosave
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
