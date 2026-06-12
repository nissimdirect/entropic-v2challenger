/**
 * useHoverDelegation — P3.4 delegated hover-help hook.
 *
 * Single onMouseOver handler at the inspector root. Zero per-target listeners.
 * Walks up from event.target to find [data-help-id]. Implements WCAG 1.4.13:
 *  - 300ms settle delay before showing
 *  - 400ms sticky window after mouseleave (tooltip stays reachable)
 *  - Escape dismisses immediately
 *  - focusin shows the same help as hover (keyboard parity)
 *  - Collapsible slot persisted as creatrix.inspector.hoverHelpCollapsed
 *
 * Pattern: single delegated listener (zero per-target) for O(1) handler cost
 * regardless of number of [data-help-id] targets. Verified by perf test
 * frontend/src/__tests__/components/hover-delegation-perf.test.ts (mean <8ms
 * at 200 targets across 3 runs).
 */
import { useEffect, useCallback, useRef, useState } from 'react'
import { getHelpEntry, type HelpEntry } from '../utils/help-registry'

/** Timings from PLAN §3.10 */
const SETTLE_MS = 300     // delay before showing after mouseenter
const STICKY_MS = 400     // how long tooltip stays after mouseleave (WCAG 1.4.13)

const STORAGE_KEY = 'creatrix.inspector.hoverHelpCollapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(v: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(v))
  } catch {
    // localStorage unavailable — ignore
  }
}

/**
 * Walk up from `el` to find the nearest ancestor (or self) with data-help-id.
 * Stops at `root` (exclusive — root itself is not searched).
 */
function findHelpId(el: Element | null, root: Element | null): string | null {
  let node: Element | null = el
  while (node && node !== root) {
    const id = node.getAttribute('data-help-id')
    if (id) return id
    node = node.parentElement
  }
  return null
}

export interface HoverDelegationState {
  entry: HelpEntry | null
  collapsed: boolean
  toggle: () => void
  onMouseOver: (e: React.MouseEvent) => void
  onMouseLeave: (e: React.MouseEvent) => void
  onFocusIn: (e: React.FocusEvent) => void
  onFocusOut: (e: React.FocusEvent) => void
  rootRef: React.RefObject<HTMLDivElement | null>
}

export function useHoverDelegation(): HoverDelegationState {
  const [entry, setEntry] = useState<HelpEntry | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)

  // Timer refs — no state re-render needed for timers
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stickyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingId = useRef<string | null>(null)

  // Root element ref — used to bound the ancestor walk
  const rootRef = useRef<HTMLDivElement | null>(null)

  const clearTimers = useCallback(() => {
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
    if (stickyTimer.current !== null) {
      clearTimeout(stickyTimer.current)
      stickyTimer.current = null
    }
  }, [])

  const showHelp = useCallback((id: string) => {
    const found = getHelpEntry(id)
    if (found) setEntry(found)
  }, [])

  const scheduleShow = useCallback((id: string) => {
    clearTimers()
    pendingId.current = id
    settleTimer.current = setTimeout(() => {
      if (pendingId.current === id) showHelp(id)
    }, SETTLE_MS)
  }, [clearTimers, showHelp])

  const scheduleHide = useCallback(() => {
    if (settleTimer.current !== null) {
      clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
    stickyTimer.current = setTimeout(() => {
      setEntry(null)
      pendingId.current = null
    }, STICKY_MS)
  }, [])

  // Escape dismisses immediately (WCAG 1.4.13)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearTimers()
        setEntry(null)
        pendingId.current = null
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [clearTimers])

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers])

  /**
   * Single delegated onMouseOver — zero per-target listeners.
   * Walks up from event.target to find [data-help-id].
   */
  const onMouseOver = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element | null
    const id = findHelpId(target, rootRef.current)
    if (id) {
      // Cancel any pending sticky-hide
      if (stickyTimer.current !== null) {
        clearTimeout(stickyTimer.current)
        stickyTimer.current = null
      }
      scheduleShow(id)
    }
  }, [scheduleShow])

  const onMouseLeave = useCallback((_e: React.MouseEvent) => {
    scheduleHide()
  }, [scheduleHide])

  // focusin shows the same help as hover (keyboard parity, WCAG)
  const onFocusIn = useCallback((e: React.FocusEvent) => {
    const target = e.target as Element | null
    const id = findHelpId(target, rootRef.current)
    if (id) {
      if (stickyTimer.current !== null) {
        clearTimeout(stickyTimer.current)
        stickyTimer.current = null
      }
      scheduleShow(id)
    }
  }, [scheduleShow])

  const onFocusOut = useCallback((_e: React.FocusEvent) => {
    scheduleHide()
  }, [scheduleHide])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      writeCollapsed(next)
      return next
    })
  }, [])

  return {
    entry,
    collapsed,
    toggle,
    onMouseOver,
    onMouseLeave,
    onFocusIn,
    onFocusOut,
    rootRef,
  }
}
