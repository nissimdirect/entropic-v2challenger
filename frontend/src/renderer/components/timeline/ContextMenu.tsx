import { useEffect, useRef, useState, useCallback } from 'react'

export interface MenuItem {
  label: string
  action: () => void
  disabled?: boolean
  separator?: boolean
  /** Optional keyboard shortcut hint shown right-aligned in the item (e.g.
   * '⌘K'). Display-only; the actual binding is owned by shortcutRegistry. */
  shortcut?: string
  /**
   * UE.7: Optional swatch palette. When present the item renders as a label
   * row followed by a row of colour dots. Each swatch calls its own action
   * and closes the menu. onClose is NOT called from the parent item.action().
   */
  swatches?: Array<{ hex: string; label: string; action: () => void }>
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Roving index: -1 = no keyboard focus yet (mouse-only open); null is avoided
  // by initialising to -1 and setting to 0 on first open (requestAnimationFrame).
  const [focusedIndex, setFocusedIndex] = useState(-1)
  // Save the element that had focus before the menu opened so we can restore it.
  const invokerRef = useRef<Element | null>(null)

  // Viewport clamping
  const menuW = 180
  const menuH = items.length * 28
  const clampedX = Math.min(x, window.innerWidth - menuW - 8)
  const clampedY = Math.min(y, window.innerHeight - menuH - 8)

  // Build a flat list of indices that are focusable (not separator, not swatch-group,
  // not disabled).  Swatch buttons are focusable but managed separately by Tab.
  const focusableIndices = items.reduce<number[]>((acc, item, i) => {
    if (!item.separator && !item.swatches && !item.disabled) acc.push(i)
    return acc
  }, [])

  // Save invoker on mount, move focus to first item after paint.
  useEffect(() => {
    invokerRef.current = document.activeElement
    // requestAnimationFrame avoids racing the pointerdown click-outside listener
    // (ContextMenu.tsx historic failure mode — F-0512-9 adjacent trap).
    requestAnimationFrame(() => {
      if (focusableIndices.length > 0) {
        setFocusedIndex(focusableIndices[0])
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — run once on mount

  // Restore focus on unmount.
  useEffect(() => {
    return () => {
      if (invokerRef.current && typeof (invokerRef.current as HTMLElement).focus === 'function') {
        try {
          ;(invokerRef.current as HTMLElement).focus()
        } catch {
          // invoker may have unmounted (e.g. context-menu-launched dialogs)
        }
      }
    }
  }, [])

  // Keep the DOM button focused in sync with focusedIndex.
  useEffect(() => {
    if (focusedIndex < 0 || !ref.current) return
    const btn = ref.current.querySelectorAll<HTMLElement>('[data-menu-index]')
    const target = Array.from(btn).find(
      (el) => el.dataset.menuIndex === String(focusedIndex),
    )
    target?.focus()
  }, [focusedIndex])

  // Close on Escape or click outside
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('pointerdown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('pointerdown', handleClick)
    }
  }, [onClose])

  // Arrow / Home / End keyboard handler for the container.
  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (focusableIndices.length === 0) return
      const currentPos = focusableIndices.indexOf(focusedIndex)

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const next = currentPos < focusableIndices.length - 1
            ? focusableIndices[currentPos + 1]
            : focusableIndices[0] // wrap
          setFocusedIndex(next)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prev = currentPos > 0
            ? focusableIndices[currentPos - 1]
            : focusableIndices[focusableIndices.length - 1] // wrap
          setFocusedIndex(prev)
          break
        }
        case 'Home': {
          e.preventDefault()
          setFocusedIndex(focusableIndices[0])
          break
        }
        case 'End': {
          e.preventDefault()
          setFocusedIndex(focusableIndices[focusableIndices.length - 1])
          break
        }
        // Enter is handled on the individual button (native button activation).
        default:
          break
      }
    },
    [focusableIndices, focusedIndex],
  )

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleMenuKeyDown}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu__separator" role="separator" />
        ) : item.swatches ? (
          // UE.7: swatch row — label above, colour dots below
          <div key={i} className="context-menu__swatch-group" role="presentation">
            <span className="context-menu__swatch-label">{item.label}</span>
            <div className="context-menu__swatch-row">
              {item.swatches.map((sw) => (
                <button
                  key={sw.hex}
                  className="context-menu__swatch"
                  role="menuitem"
                  title={sw.label}
                  style={{ backgroundColor: sw.hex }}
                  onClick={(e) => {
                    e.stopPropagation()
                    sw.action()
                    onClose()
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <button
            key={i}
            // data-menu-index enables the DOM-focus sync effect above.
            data-menu-index={i}
            className={`context-menu__item${item.disabled ? ' context-menu__item--disabled' : ''}`}
            role="menuitem"
            // Roving tabIndex: only the focused item is in the tab order.
            tabIndex={focusedIndex === i ? 0 : -1}
            aria-disabled={item.disabled}
            onClick={(e) => {
              // F-0512-9: stop propagation so the click on a menu item doesn't
              // bubble to the TrackLane underneath and re-seek the playhead.
              // Pre-fix: right-click → Split at Playhead landed the split at
              // the correct playhead time, but the click event then bubbled to
              // TrackLane.handleLaneClick → setPlayheadTime(menu_click_x), which
              // moved the playhead to the menu item's x-coordinate in screen
              // space (~0.2s past the split point at the typical menu position).
              e.stopPropagation()
              if (!item.disabled) {
                item.action()
                onClose()
              }
            }}
            disabled={item.disabled}
          >
            {item.label}
            {item.shortcut && (
              <span className="context-menu__shortcut">{item.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  )
}
