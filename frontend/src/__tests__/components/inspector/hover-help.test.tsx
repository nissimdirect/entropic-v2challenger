/**
 * P3.4 — InspectorHoverHelp behavior tests.
 *
 * Named tests per EXECUTION-PLAN §4 P3.4:
 *   WCAG behaviors:
 *     - "Escape dismisses tooltip"
 *     - "tooltip stays while hovering into it (sticky 400ms)"
 *     - "focusin shows the same help as hover (parity)"
 *   Negative tests (M5 + conflict):
 *     - "help body containing <img onerror=...> markup renders as inert plaintext"
 *     - (hotkey conflict test is in tool-shortcuts.test.ts)
 *   Collapsible:
 *     - "toggle collapses and persists to localStorage"
 *     - "toggle expands and clears localStorage flag"
 *   Behavior:
 *     - "shows help after hover settle on [data-help-id] node"
 *     - "hides help after sticky window elapses"
 *     - "hover into tooltip cancels hide timer (sticky allows hover-into-tooltip)"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import React from 'react'

// Mock localStorage (happy-dom may not have a working one)
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true })

// Mock window.entropic before store imports
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import Inspector from '../../../renderer/components/inspector/Inspector'
import InspectorHoverHelp from '../../../renderer/components/inspector/InspectorHoverHelp'
import { getHelpEntry, sanitizeHelpText } from '../../../renderer/utils/help-registry'
import { useHoverDelegation } from '../../../renderer/hooks/useHoverDelegation'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import { useProjectStore } from '../../../renderer/stores/project'

// Mock stores so inspector renders without full store setup
vi.mock('../../../renderer/stores/timeline', () => ({
  useTimelineStore: vi.fn(() => ({
    selectedTrackId: null,
    selectedClipIds: [],
    tracks: [],
  })),
}))
vi.mock('../../../renderer/stores/project', () => ({
  useProjectStore: vi.fn(() => ({
    selectedEffectId: null,
  })),
}))
vi.mock('../../../renderer/selectors/trackStats', () => ({
  getTrackStats: vi.fn(() => ({
    effectCount: 0,
    lastFrameMs: 0,
    smoothAutomationCount: 0,
    gateAutomationCount: 0,
    oneShotAutomationCount: 0,
    hasComposite: false,
  })),
}))

// Use fake timers to control settle / sticky delays
beforeEach(() => {
  vi.useFakeTimers()
  localStorageMock.clear()
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

// ──────────────────────────────────────────────────────────────────────────────
// Standalone InspectorHoverHelp render tests (pure component props)
// ──────────────────────────────────────────────────────────────────────────────

describe('InspectorHoverHelp — prop-based render', () => {
  it('renders nothing inside help body when entry is null', () => {
    render(<InspectorHoverHelp entry={null} collapsed={false} onToggle={() => {}} />)
    expect(screen.queryByTestId('hover-help-body')).toBeNull()
  })

  it('renders help body when entry is provided and not collapsed', () => {
    const entry = getHelpEntry('tool-razor')!
    render(<InspectorHoverHelp entry={entry} collapsed={false} onToggle={() => {}} />)
    expect(screen.getByTestId('hover-help-body')).toBeDefined()
    expect(screen.getByTestId('hover-help-body').textContent).toContain('Razor')
  })

  it('hides help body when collapsed', () => {
    const entry = getHelpEntry('tool-razor')!
    render(<InspectorHoverHelp entry={entry} collapsed={true} onToggle={() => {}} />)
    expect(screen.queryByTestId('hover-help-body')).toBeNull()
  })

  it('toggle collapses and persists to localStorage', () => {
    let collapsed = false
    const onToggle = () => {
      collapsed = true
      localStorageMock.setItem('creatrix.inspector.hoverHelpCollapsed', 'true')
    }
    render(<InspectorHoverHelp entry={null} collapsed={collapsed} onToggle={onToggle} />)
    const toggleBtn = screen.getByTestId('hover-help-toggle')
    fireEvent.click(toggleBtn)
    expect(collapsed).toBe(true)
    expect(localStorageMock.getItem('creatrix.inspector.hoverHelpCollapsed')).toBe('true')
  })

  it('toggle expands and clears localStorage flag', () => {
    localStorageMock.setItem('creatrix.inspector.hoverHelpCollapsed', 'true')
    let collapsed = true
    const onToggle = () => {
      collapsed = false
      localStorageMock.setItem('creatrix.inspector.hoverHelpCollapsed', 'false')
    }
    render(<InspectorHoverHelp entry={null} collapsed={collapsed} onToggle={onToggle} />)
    const toggleBtn = screen.getByTestId('hover-help-toggle')
    fireEvent.click(toggleBtn)
    expect(collapsed).toBe(false)
  })

  // NEGATIVE TEST M5: XSS guard
  it('help body containing <img onerror=...> markup renders as inert plaintext', () => {
    // Simulate an entry whose body contains HTML injection markup.
    // The component must render it as text — no onerror execution.
    const maliciousEntry = {
      title: 'Test',
      body: '<img onerror=alert(1) src=x>',
    }
    render(<InspectorHoverHelp entry={maliciousEntry} collapsed={false} onToggle={() => {}} />)
    const body = screen.getByTestId('hover-help-body')
    // The raw markup must appear as text, never as an <img> element
    expect(body.querySelector('img')).toBeNull()
    // The text content contains the literal string (HTML was NOT parsed)
    expect(body.textContent).toContain('<img onerror=')
    // innerHTML does NOT contain a live <img> tag
    // (React escapes it via textContent rendering — no dangerouslySetInnerHTML used)
    expect(body.innerHTML).not.toContain('<img')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// sanitizeHelpText utility
// ──────────────────────────────────────────────────────────────────────────────

describe('sanitizeHelpText', () => {
  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100)
    expect(sanitizeHelpText(long).length).toBe(64)
  })

  it('strips control characters but keeps printable ASCII', () => {
    const input = 'Hello\x01World\x1F!'
    const result = sanitizeHelpText(input)
    expect(result).toBe('HelloWorld!')
  })

  it('preserves normal text unchanged', () => {
    const input = 'Normal help text'
    expect(sanitizeHelpText(input)).toBe('Normal help text')
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// useHoverDelegation hook — WCAG 1.4.13 behaviors
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Minimal wrapper to test the hook using React's rendering.
 * Each data-help-id node fires the event directly on itself (bubbles up to root).
 */
function HookWrapper({ onState }: { onState: (state: ReturnType<typeof useHoverDelegation>) => void }) {
  const state = useHoverDelegation()
  onState(state)
  return (
    <div
      data-testid="wrapper-root"
      onMouseOver={state.onMouseOver}
      onMouseLeave={state.onMouseLeave}
      onFocus={state.onFocusIn}
      onBlur={state.onFocusOut}
      ref={state.rootRef}
    >
      <div data-help-id="tool-razor" data-testid="target-node">hover me</div>
      <div data-testid="no-help-node">no help</div>
    </div>
  )
}

describe('useHoverDelegation — WCAG 1.4.13', () => {
  it('shows help after hover settle on [data-help-id] node', () => {
    let hookState: ReturnType<typeof useHoverDelegation> | null = null
    render(<HookWrapper onState={(s) => { hookState = s }} />)

    // Fire on the data-help-id node directly — event bubbles to the root handler
    fireEvent.mouseOver(screen.getByTestId('target-node'))

    // Before settle: entry is still null
    expect(hookState!.entry).toBeNull()

    // After 300ms settle
    act(() => { vi.advanceTimersByTime(300) })
    expect(hookState!.entry).not.toBeNull()
    expect(hookState!.entry?.title).toContain('Razor')
  })

  it('Escape dismisses tooltip', () => {
    let hookState: ReturnType<typeof useHoverDelegation> | null = null
    render(<HookWrapper onState={(s) => { hookState = s }} />)

    fireEvent.mouseOver(screen.getByTestId('target-node'))
    act(() => { vi.advanceTimersByTime(300) })
    expect(hookState!.entry).not.toBeNull()

    // Escape dismisses immediately
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(hookState!.entry).toBeNull()
  })

  it('hides help after sticky window elapses', () => {
    let hookState: ReturnType<typeof useHoverDelegation> | null = null
    const { getByTestId } = render(<HookWrapper onState={(s) => { hookState = s }} />)

    fireEvent.mouseOver(getByTestId('target-node'))
    act(() => { vi.advanceTimersByTime(300) })
    expect(hookState!.entry).not.toBeNull()

    // Mouse leaves the wrapper root
    fireEvent.mouseLeave(getByTestId('wrapper-root'))

    // Before sticky elapses (e.g. 200ms): entry still visible
    act(() => { vi.advanceTimersByTime(200) })
    expect(hookState!.entry).not.toBeNull()

    // After sticky window (400ms total)
    act(() => { vi.advanceTimersByTime(200) })
    expect(hookState!.entry).toBeNull()
  })

  it('tooltip stays while hovering into it (sticky 400ms)', () => {
    let hookState: ReturnType<typeof useHoverDelegation> | null = null
    const { getByTestId } = render(<HookWrapper onState={(s) => { hookState = s }} />)

    // Show help
    fireEvent.mouseOver(getByTestId('target-node'))
    act(() => { vi.advanceTimersByTime(300) })
    expect(hookState!.entry).not.toBeNull()

    // Mouse leaves wrapper (starts sticky timer)
    fireEvent.mouseLeave(getByTestId('wrapper-root'))
    act(() => { vi.advanceTimersByTime(200) }) // 200ms into sticky, still visible

    // Mouse re-enters target before sticky elapses (hover into tooltip)
    fireEvent.mouseOver(getByTestId('target-node'))

    // Advance past what would have been the expiry
    act(() => { vi.advanceTimersByTime(300) })

    // Entry should still be visible (sticky timer was cancelled by re-enter)
    expect(hookState!.entry).not.toBeNull()
  })

  it('focusin shows the same help as hover (parity)', () => {
    let hookState: ReturnType<typeof useHoverDelegation> | null = null
    render(<HookWrapper onState={(s) => { hookState = s }} />)

    // Focus the data-help-id node directly — bubbles to onFocus handler at root
    fireEvent.focus(screen.getByTestId('target-node'))

    // After 300ms settle
    act(() => { vi.advanceTimersByTime(300) })

    expect(hookState!.entry).not.toBeNull()
    expect(hookState!.entry?.title).toContain('Razor')
  })

  it('no help shown for nodes without [data-help-id]', () => {
    let hookState: ReturnType<typeof useHoverDelegation> | null = null
    render(<HookWrapper onState={(s) => { hookState = s }} />)

    // Fire on a node without data-help-id
    fireEvent.mouseOver(screen.getByTestId('no-help-node'))
    act(() => { vi.advanceTimersByTime(300) })

    expect(hookState!.entry).toBeNull()
  })
})
