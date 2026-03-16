import '../../styles/error-message.css'

interface ErrorMessageProps {
  message: string
  severity: 'warning' | 'error'
  recoveryAction?: string
  onDismiss?: () => void
}

export default function ErrorMessage({
  message,
  severity,
  recoveryAction,
  onDismiss,
}: ErrorMessageProps) {
  return (
    <div
      className={`error-message error-message--${severity}`}
      role="alert"
      aria-live={severity === 'error' ? 'assertive' : 'polite'}
    >
      <span className="error-message__icon">
        {severity === 'warning' ? '\u26A0' : '\u2715'}
      </span>
      <div className="error-message__body">
        <span className="error-message__text">{message}</span>
        {recoveryAction && (
          <span className="error-message__recovery">{recoveryAction}</span>
        )}
      </div>
      {onDismiss && (
        <button className="error-message__dismiss" onClick={onDismiss} aria-label="Dismiss">
          \u00D7
        </button>
      )}
    </div>
  )
}
