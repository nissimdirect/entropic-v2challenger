import { useEffect, useRef } from 'react'

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

  // Viewport clamping
  const menuW = 180
  const menuH = items.length * 28
  const clampedX = Math.min(x, window.innerWidth - menuW - 8)
  const clampedY = Math.min(y, window.innerHeight - menuH - 8)

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

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: `${clampedX}px`, top: `${clampedY}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu__separator" />
        ) : item.swatches ? (
          // UE.7: swatch row — label above, colour dots below
          <div key={i} className="context-menu__swatch-group">
            <span className="context-menu__swatch-label">{item.label}</span>
            <div className="context-menu__swatch-row">
              {item.swatches.map((sw) => (
                <button
                  key={sw.hex}
                  className="context-menu__swatch"
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
            className={`context-menu__item${item.disabled ? ' context-menu__item--disabled' : ''}`}
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
