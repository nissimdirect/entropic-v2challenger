import { useState, useRef, useCallback } from 'react'
import '../../styles/common-tooltip.css'

interface TooltipProps {
  text: string
  shortcut?: string
  description?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}

const HOVER_DELAY = 500

/**
 * Generic tooltip wrapper. Shows a tooltip on hover after 500ms.
 * Supports text, keyboard shortcut, and optional description.
 */
export default function Tooltip({
  text,
  shortcut,
  description,
  position = 'top',
  children,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setVisible(true), HOVER_DELAY)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setVisible(false)
  }, [])

  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <div className={`tooltip tooltip--${position}`} role="tooltip">
          <span className="tooltip__text">{text}</span>
          {shortcut && <kbd className="tooltip__shortcut">{shortcut}</kbd>}
          {description && (
            <span className="tooltip__description">{description}</span>
          )}
        </div>
      )}
    </span>
  )
}
