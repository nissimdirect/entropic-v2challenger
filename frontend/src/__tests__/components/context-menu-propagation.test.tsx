/**
 * F-0512-9 regression: clicking a ContextMenu item must not bubble to the
 * element underneath. Pre-fix repro: right-click clip → "Split at Playhead"
 * landed the split at the correct playhead time (e.g. 0.9s), but the click
 * event then bubbled to TrackLane.handleLaneClick which called
 * setPlayheadTime(menu_click_x_in_seconds) — moving the playhead to wherever
 * the menu item happened to be in screen space (typically ~1.1s for a menu
 * opened near 0.9s playhead).
 *
 * The fix: stopPropagation on the menu container's pointerdown/click AND on
 * each MenuItem button's click. Belt-and-braces — the container handler
 * guards generic bubbles, the button handler guards the action click itself.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import ContextMenu from '../../renderer/components/timeline/ContextMenu'
import type { MenuItem } from '../../renderer/components/timeline/ContextMenu'

describe('ContextMenu — F-0512-9 stopPropagation', () => {
  it('does not bubble item-click events to elements underneath', () => {
    const lanyClick = vi.fn()
    const itemAction = vi.fn()
    const onClose = vi.fn()

    const items: MenuItem[] = [
      { label: 'Split at Playhead', action: itemAction },
    ]

    const { container } = render(
      <div onClick={lanyClick}>
        <ContextMenu x={100} y={100} items={items} onClose={onClose} />
      </div>,
    )

    const button = container.querySelector('.context-menu__item')!
    fireEvent.click(button)

    expect(itemAction).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
    // Critical assertion: outer click handler MUST NOT fire.
    expect(lanyClick).not.toHaveBeenCalled()
  })

  it('does not bubble pointerdown either (click-outside handler protection)', () => {
    const outerPointerDown = vi.fn()
    const items: MenuItem[] = [{ label: 'X', action: vi.fn() }]

    const { container } = render(
      <div onPointerDown={outerPointerDown}>
        <ContextMenu x={50} y={50} items={items} onClose={vi.fn()} />
      </div>,
    )

    const menu = container.querySelector('.context-menu')!
    fireEvent.pointerDown(menu)
    expect(outerPointerDown).not.toHaveBeenCalled()
  })

  it('renders the shortcut hint when provided', () => {
    const items: MenuItem[] = [
      { label: 'Split at Playhead', action: vi.fn(), shortcut: '⌘K' },
    ]

    const { container } = render(
      <ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />,
    )

    const hint = container.querySelector('.context-menu__shortcut')
    expect(hint?.textContent).toBe('⌘K')
  })

  it('omits the shortcut span when no shortcut is provided', () => {
    const items: MenuItem[] = [
      { label: 'Duplicate', action: vi.fn() },
    ]

    const { container } = render(
      <ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />,
    )

    expect(container.querySelector('.context-menu__shortcut')).toBeNull()
  })
})
