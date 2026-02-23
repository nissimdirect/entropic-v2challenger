import React, { useState, useRef, useCallback } from 'react'
import type { ParamCurve } from '../../../shared/types'
import { valueToSlider, sliderToValue } from '../../utils/paramScaling'
import NumberInput from './NumberInput'

interface SliderProps {
  value: number
  min: number
  max: number
  default: number
  label: string
  type: 'float' | 'int'
  unit?: string
  curve?: ParamCurve
  description?: string
  ghostValue?: number
  onChange: (value: number) => void
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
  default: defaultValue,
  label,
  type,
  unit,
  curve = 'linear',
  description,
  ghostValue,
  onChange,
}: SliderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const range = max - min
  const step = type === 'int' ? 1 : range / 1000

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
    if (e.button === 2) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const newVal = positionToValue(e.clientX)
    onChange(clampAndRound(newVal))
  }, [positionToValue, onChange, clampAndRound])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!(e.buttons & 1)) return
    const newVal = positionToValue(e.clientX)
    onChange(clampAndRound(newVal))
  }, [positionToValue, onChange, clampAndRound])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onChange(clampAndRound(defaultValue))
  }, [defaultValue, onChange, clampAndRound])

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const pct = e.shiftKey ? 0.1 : 0.01
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      onChange(clampAndRound(value + range * pct))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(clampAndRound(value - range * pct))
    }
  }, [value, range, onChange, clampAndRound])

  const formatted = type === 'int' ? Math.round(value).toString() : value.toFixed(2)
  const display = unit ? `${formatted}${unit}` : formatted

  return (
    <div className="hslider" title={description}>
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
      <div
        ref={trackRef}
        className="hslider__track"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onContextMenu={handleContextMenu}
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
