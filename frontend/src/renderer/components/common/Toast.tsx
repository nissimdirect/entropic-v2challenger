import { useCallback } from 'react'
import { useToastStore, type ToastLevel } from '../../stores/toast'
import '../../styles/toast.css'

const LEVEL_COLORS: Record<ToastLevel, string> = {
  info: '#2196f3',
  warning: '#ff9800',
  error: '#ef4444',
  state: '#fbbf24',
}

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  const handleDismiss = useCallback(
    (id: string) => {
      dismissToast(id)
    },
    [dismissToast],
  )

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" role="log" aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          style={{ borderLeftColor: LEVEL_COLORS[toast.level] }}
          role="alert"
          aria-live={toast.level === 'error' ? 'assertive' : 'polite'}
          onClick={() => handleDismiss(toast.id)}
        >
          <div className="toast__body">
            <span className="toast__message">
              {toast.message}
              {toast.count > 1 && (
                <span className="toast__count">&times;{toast.count}</span>
              )}
            </span>
            {toast.action && (
              <button
                className="toast__action"
                onClick={(e) => {
                  e.stopPropagation()
                  toast.action!.fn()
                  handleDismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
          {toast.details && (
            <details className="toast__details">
              <summary>Details</summary>
              <pre className="toast__details-text">{toast.details}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  )
}
