/**
 * useModalBehavior — shared accessibility hook for modal dialogs.
 *
 * Provides:
 *   1. Escape-to-close (fires onClose; respects nested captures via isCapturing guard)
 *   2. Focus trap — Tab/Shift-Tab wraps within the dialog's focusable children
 *   3. Initial focus — focuses the first [autofocus] element, or the first focusable element, on mount
 *   4. Return focus — saves document.activeElement on mount and restores it on unmount
 *
 * Usage:
 *   const dialogRef = useRef<HTMLDivElement>(null)
 *   useModalBehavior(dialogRef, onClose)
 *
 * PUX.2 (ux/pux-2-dialog-a11y) — POP CHAOS Design System gate 6 (keyboard + focus).
 */
import { useEffect, useRef } from 'react'

/** Selectors for elements that can receive keyboard focus. */
const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Returns all focusable descendants of `container` in DOM order.
 * Queries the container itself in case it is the portal root.
 */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
}

interface UseModalBehaviorOptions {
  /**
   * When true, an active nested capture (e.g. ShortcutEditor key-capture) is
   * in progress. Escape is consumed by the capture — do NOT fire onClose.
   * The nested component must set this to true while it is capturing.
   */
  isCapturing?: boolean
}

export function useModalBehavior(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  options: UseModalBehaviorOptions = {},
): void {
  // Capture the element focused BEFORE the modal rendered (during render phase,
  // before React's commit/autoFocus). useRef initializer runs at render time,
  // which is earlier than useEffect, ensuring we snapshot the true prior focus.
  const previousFocusRef = useRef<Element | null>(
    typeof document !== 'undefined' ? document.activeElement : null,
  )

  // On mount: set initial focus inside the dialog.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Prefer an [autofocus] element; fall back to first focusable; fall back to the container.
    const autofocused = el.querySelector<HTMLElement>('[autofocus]')
    const firstFocusable = getFocusable(el)[0]
    const target = autofocused ?? firstFocusable ?? el

    // Defer one tick so the DOM is fully painted before we steal focus.
    const id = setTimeout(() => {
      target.focus()
    }, 0)

    return () => {
      clearTimeout(id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount

  // On unmount: restore focus to the previously-focused element.
  useEffect(() => {
    return () => {
      const prev = previousFocusRef.current
      if (prev && typeof (prev as HTMLElement).focus === 'function') {
        try {
          ;(prev as HTMLElement).focus()
        } catch {
          // Node may have been removed; fall back silently.
          document.body.focus()
        }
      } else {
        document.body.focus()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on unmount

  // Keydown handler: Escape → onClose (guarded); Tab → focus trap.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If a nested key-capture is active, let it handle Escape first.
        if (options.isCapturing) return
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const focusable = getFocusable(el)
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey) {
          // Shift-Tab: if on first, wrap to last.
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          // Tab: if on last, wrap to first.
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    // Attach to the dialog element (not document) so portal subtrees work
    // correctly and SpeedDialog's input-level stopPropagation is unaffected.
    el.addEventListener('keydown', handleKeyDown)
    return () => {
      el.removeEventListener('keydown', handleKeyDown)
    }
  }, [ref, onClose, options.isCapturing])
}
