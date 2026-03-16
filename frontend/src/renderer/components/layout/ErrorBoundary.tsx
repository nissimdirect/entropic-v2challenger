import React from 'react'
import '../../styles/error-boundary.css'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo)
    try {
      ;(window as any).entropic?.writeLog?.(
        `[renderer-error] ${error.name}: ${error.message}\n${errorInfo.componentStack ?? ''}`,
      )
    } catch {
      // best-effort — ignore if unavailable
    }
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleCopyError = (): void => {
    if (this.state.error) {
      navigator.clipboard.writeText(
        `${this.state.error.name}: ${this.state.error.message}`,
      )
    }
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="error-boundary">
        <span className="error-boundary__icon">!</span>
        <h1 className="error-boundary__title">Something went wrong</h1>
        <p className="error-boundary__message">
          An unexpected error occurred. Your work has been auto-saved.
        </p>
        <div className="error-boundary__actions">
          <button className="error-boundary__btn" onClick={this.handleReload}>
            Reload App
          </button>
          <button
            className="error-boundary__btn error-boundary__btn--secondary"
            onClick={this.handleCopyError}
          >
            Copy Error
          </button>
        </div>
      </div>
    )
  }
}
