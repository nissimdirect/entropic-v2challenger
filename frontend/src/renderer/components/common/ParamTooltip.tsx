import { useState, useRef, useCallback } from 'react'

interface ParamTooltipProps {
  label: string
  description?: string
  min?: number
  max?: number
  unit?: string
  defaultValue?: number | string | boolean
  children: React.ReactNode
}

const HOVER_DELAY = 500

/**
 * Wraps a knob or slider. Shows a tooltip above on hover after 500ms.
 * Content: label, description, range, default value.
 */
export default function ParamTooltip({
  label,
  description,
  min,
  max,
  unit,
  defaultValue,
  children,
}: ParamTooltipProps) {
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

  const hasRange = min !== undefined && max !== undefined
  const unitStr = unit || ''
  const defaultStr = defaultValue !== undefined ? String(defaultValue) : undefined

  return (
    <div
      className="param-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <div className="param-tooltip">
          <div className="param-tooltip__label">{label}</div>
          {description && <div className="param-tooltip__desc">{description}</div>}
          {hasRange && (
            <div className="param-tooltip__range">
              Range: {min} &ndash; {max} {unitStr}
            </div>
          )}
          {defaultStr !== undefined && (
            <div className="param-tooltip__default">Default: {defaultStr}</div>
          )}
        </div>
      )}
    </div>
  )
}
