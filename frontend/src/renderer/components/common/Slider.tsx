import React, { useState, useRef, useCallback } from 'react'
import type { ParamCurve } from '../../../shared/types'
import { valueToSlider, sliderToValue, formatParamValue } from '../../utils/paramScaling'
import NumberInput from './NumberInput'

interface SliderProps {
  value: number
  min: number
  max: number
  /** Right-click-to-reset target. Optional — falls back to `min` when the
   *  caller has no natural "default" concept (F3-C2 compact adoption). */
  default?: number
  label: string
  type: 'float' | 'int'
  unit?: string
  curve?: ParamCurve
  description?: string
  ghostValue?: number
  onChange: (value: number) => void
  /** Hide the label+value header row (F3-C2) for callers that embed the
   *  track in their own labeled row (e.g. a compact device-param list).
   *  Track/keyboard/drag/reset/aria behavior is unchanged; double-click-to-
   *  type-exact-value is unavailable in this mode (no header to host the
   *  inline NumberInput). Default true (full card, unchanged behavior). */
  showHeader?: boolean
  /** Override the right-click behavior (default: reset to `default`).
   *  Instrument-device sliders arm MIDI-learn on right-click instead of
   *  resetting — this preserves that exactly (F3-C2). */
  onContextMenu?: (e: React.MouseEvent) => void
  /** Stable data-testid, lands on the track (the interactive element) —
   *  COMPONENT-SPEC §2 selector contract. */
  testId?: string
  disabled?: boolean
  /** Optional click passthrough, lands on the track. For callers embedded in
   *  a click-to-select row (e.g. a device card) that need to stop the click
   *  from bubbling to the row's own handler — the track already carries
   *  role="slider" (an interactive ARIA role), so putting the handler here
   *  instead of on a plain wrapping div keeps it exempt from
   *  jsx-a11y/no-static-element-interactions. */
  onClick?: (e: React.MouseEvent) => void
}

/**
 * Horizontal slider with Ghost Handle support.
 * Same interaction model as Knob: Shift for fine-tune, double-click for NumberInput,
 * right-click to reset.
 */
export default function Slider({
  value,
  min,
  max,
  default: defaultValueProp,
  label,
  type,
  unit,
  curve = 'linear',
  description,
  ghostValue,
  onChange,
  showHeader = true,
  onContextMenu: onContextMenuOverride,
  testId,
  disabled = false,
  onClick,
}: SliderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const range = max - min
  const step = type === 'int' ? 1 : range / 1000
  const defaultValue = defaultValueProp ?? min

  const sliderPos = valueToSlider(value, min, max, curve)
  const ghostPos = ghostValue !== undefined
    ? valueToSlider(ghostValue, min, max, curve)
    : sliderPos

  const clampAndRound = useCallback((v: number) => {
    const clamped = Math.max(min, Math.min(max, v))
    return type === 'int' ? Math.round(clamped) : clamped
  }, [min, max, type])

  const positionToValue = useCallback((clientX: number) => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    const normalized = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return sliderToValue(normalized, min, max, curve)
  }, [value, min, max, curve])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || e.button === 2) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const newVal = positionToValue(e.clientX)
    onChange(clampAndRound(newVal))
  }, [disabled, positionToValue, onChange, clampAndRound])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (disabled || !(e.buttons & 1)) return
    const newVal = positionToValue(e.clientX)
    onChange(clampAndRound(newVal))
  }, [disabled, positionToValue, onChange, clampAndRound])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    if (onContextMenuOverride) {
      onContextMenuOverride(e)
      return
    }
    e.preventDefault()
    onChange(clampAndRound(defaultValue))
  }, [disabled, onContextMenuOverride, defaultValue, onChange, clampAndRound])

  const handleDoubleClick = useCallback(() => {
    if (disabled || !showHeader) return
    setIsEditing(true)
  }, [disabled, showHeader])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return
    const pct = e.shiftKey ? 0.1 : 0.01
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(clampAndRound(value + range * pct))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(clampAndRound(value - range * pct))
    }
  }, [disabled, value, range, onChange, clampAndRound])

  const display = formatParamValue(value, type, unit, max)

  return (
    <div className={`hslider${disabled ? ' hslider--disabled' : ''}`} title={description}>
      {showHeader && (
        <div className="hslider__header">
          <span className="hslider__label">{label}</span>
          {isEditing ? (
            <NumberInput
              value={value}
              min={min}
              max={max}
              step={step}
              onConfirm={(v) => { setIsEditing(false); onChange(clampAndRound(v)) }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <span className="hslider__value" onDoubleClick={handleDoubleClick}>{display}</span>
          )}
        </div>
      )}
      <div
        ref={trackRef}
        className="hslider__track"
        data-testid={testId}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={type === 'int' ? Math.round(value) : value}
        aria-valuetext={display}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onContextMenu={handleContextMenu}
        onClick={onClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        {/* Ghost fill (30% opacity) */}
        {ghostValue !== undefined && Math.abs(ghostPos - sliderPos) > 0.001 && (
          <div
            className="hslider__ghost"
            style={{ width: `${ghostPos * 100}%` }}
          />
        )}
        {/* Value fill */}
        <div
          className="hslider__fill"
          style={{ width: `${sliderPos * 100}%` }}
        />
        {/* Thumb */}
        <div
          className="hslider__thumb"
          style={{ left: `${sliderPos * 100}%` }}
        />
      </div>
    </div>
  )
}
