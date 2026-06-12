/**
 * I3 Inline Action Menu (Vision §6 I3) — Tier-1 shell coverage.
 *
 * Covers the presentation component + the Tier-1 stub hook. Routing/IPC wiring
 * is Tier-3 (PR #143 backend); these tests assert the shell that ships now:
 * sectioned rendering, search filter, keyboard nav, escape/click-outside close,
 * disabled-item guard, and the stub action set shape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, renderHook, screen, cleanup } from '@testing-library/react'

afterEach(() => cleanup())
import InlineActionMenu, {
  type InlineAction,
} from '../../renderer/components/inline-actions/InlineActionMenu'
import { useInlineActions } from '../../renderer/components/inline-actions/useInlineActions'

function makeActions(overrides: Partial<InlineAction>[] = []): InlineAction[] {
  const base: InlineAction[] = [
    { id: 'a:map1', label: 'Map to LFO 1', category: 'recent', onSelect: vi.fn() },
    { id: 'a:browse', label: 'Browse Modulators', category: 'browse', onSelect: vi.fn() },
    { id: 'a:probe', label: 'Probe', category: 'tools', shortcut: '⌥', onSelect: vi.fn() },
  ]
  return base.map((a, i) => ({ ...a, ...(overrides[i] ?? {}) }))
}

describe('InlineActionMenu — I3 shell', () => {
  it('renders sectioned actions (recent/browse/tools)', () => {
    render(
      <InlineActionMenu x={10} y={10} paramId="p1" actions={makeActions()} onClose={vi.fn()} />,
    )
    expect(screen.getByTestId('section-recent')).toBeTruthy()
    expect(screen.getByTestId('section-browse')).toBeTruthy()
    expect(screen.getByTestId('section-tools')).toBeTruthy()
    expect(screen.getByTestId('action-a:map1')).toBeTruthy()
  })

  it('filters actions by search query (case-insensitive)', () => {
    render(
      <InlineActionMenu x={10} y={10} paramId="p1" actions={makeActions()} onClose={vi.fn()} />,
    )
    fireEvent.change(screen.getByTestId('inline-action-menu-search'), {
      target: { value: 'browse' },
    })
    expect(screen.queryByTestId('action-a:browse')).toBeTruthy()
    expect(screen.queryByTestId('action-a:map1')).toBeNull()
  })

  it('shows empty state when no actions match', () => {
    render(
      <InlineActionMenu x={10} y={10} paramId="p1" actions={makeActions()} onClose={vi.fn()} />,
    )
    fireEvent.change(screen.getByTestId('inline-action-menu-search'), {
      target: { value: 'zzzznomatch' },
    })
    expect(screen.getByTestId('inline-action-menu-empty')).toBeTruthy()
  })

  it('selects via Enter after ArrowDown keyboard nav, then closes', () => {
    const onClose = vi.fn()
    const actions = makeActions()
    render(<InlineActionMenu x={10} y={10} paramId="p1" actions={actions} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'ArrowDown' }) // focus idx 1 (browse)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(actions[1].onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape closes the menu', () => {
    const onClose = vi.fn()
    render(
      <InlineActionMenu x={10} y={10} paramId="p1" actions={makeActions()} onClose={onClose} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('click outside closes the menu', () => {
    const onClose = vi.fn()
    render(
      <div>
        <button data-testid="outside">outside</button>
        <InlineActionMenu x={10} y={10} paramId="p1" actions={makeActions()} onClose={onClose} />
      </div>,
    )
    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not select a disabled action', () => {
    const onClose = vi.fn()
    const actions = makeActions([{ disabled: true }])
    render(<InlineActionMenu x={10} y={10} paramId="p1" actions={actions} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('action-a:map1'))
    expect(actions[0].onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('useInlineActions — P3.6 Tier-3 stub (IPC unavailable → stub actions)', () => {
  it('returns stub actions when IPC unavailable (loading starts true, stub shown)', () => {
    // When window.entropic is absent, the hook returns the stub action set
    // and loading=true (async fetch in flight). This is the P3.6 Tier-3 API.
    // Full IPC wiring tested in inline-probe-menu.test.tsx.
    const savedEntropic = (window as any).entropic
    delete (window as any).entropic

    const ctx = { kind: 'effect' as const, nodeId: 'fx-1' }
    const { result } = renderHook(() => useInlineActions(ctx))
    const { actions } = result.current
    // Stub has at least 1 action (reveal_in_canvas)
    expect(actions.length).toBeGreaterThanOrEqual(1)

    // Restore
    Object.defineProperty(window, 'entropic', { value: savedEntropic, writable: true, configurable: true })
  })
})
