interface TelemetryConsentDialogProps {
  isOpen: boolean
  onDecision: (consent: boolean) => void
}

export default function TelemetryConsentDialog({ isOpen, onDecision }: TelemetryConsentDialogProps) {
  if (!isOpen) return null

  return (
    <div className="consent-dialog__overlay">
      <div className="consent-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="consent-dialog__header">
          <span>Help Improve Entropic</span>
        </div>
        <div className="consent-dialog__body">
          <p className="consent-dialog__text">
            We collect anonymous crash reports to fix bugs faster.
            No personal data, file paths, or project content is ever sent.
          </p>
          <p className="consent-dialog__note">
            Takes effect on next launch.
          </p>
        </div>
        <div className="consent-dialog__footer">
          <button
            className="consent-dialog__btn consent-dialog__btn--neutral"
            onClick={() => onDecision(false)}
          >
            No Thanks
          </button>
          <button
            className="consent-dialog__btn consent-dialog__btn--enable"
            onClick={() => onDecision(true)}
          >
            Enable Crash Reporting
          </button>
        </div>
      </div>
    </div>
  )
}
