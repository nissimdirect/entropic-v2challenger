import React, { useState, useRef, useCallback } from 'react'
import type { ParamCurve } from '../../../shared/types'
import { valueToSlider, sliderToValue } from '../../utils/paramScaling'
import NumberInput from './NumberInput'
import ParamLabel from './ParamLabel'
import ParamTooltip from './ParamTooltip'

interface KnobProps {
  value: number
  min: number
  max: number
  default: number
  label: string
  type: 'float' | 'int'
  unit?: string
  curve?: ParamCurve
  description?: string
  /** Resolved value after modulation (Phase 6). Defaults to value. */
  ghostValue?: number
  onChange: (value: number) => void
}

/** Arc geometry — 270-degree sweep with gap at bottom. */
const SIZE = 40
const STROKE = 3
const RADIUS = (SIZE - STROKE) / 2
const CX = SIZE / 2
const CY = SIZE / 2
const START_ANGLE = 135 // degrees from 12 o'clock, clockwise
const SWEEP = 270

/** Drag sensitivity tiers (slider units per pixel of vertical mouse movement) */
const SENSITIVITY_FINE = 0.001   // Shift+drag: 10x finer than normal
const SENSITIVITY_NORMAL = 0.005 // Default drag
const SENSITIVITY_COARSE = 0.02  // Cmd/Ctrl+drag: 4x faster than normal

/** Scroll wheel step (slider units per wheel tick) */
const WHEEL_STEP_NORMAL = 0.02
const WHEEL_STEP_FINE = 0.004
const WHEEL_STEP_COARSE = 0.08

function polarToXY(angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [CX + RADIUS * Math.cos(rad), CY + RADIUS * Math.sin(rad)]
}

function arcPath(startAngle: number, endAngle: number): string {
  if (Math.abs(endAngle - startAngle) < 0.1) return ''
  const [sx, sy] = polarToXY(startAngle)
  const [ex, ey] = polarToXY(endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${sx} ${sy} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${ex} ${ey}`
}

function getDragSensitivity(e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): number {
  if (e.shiftKey) return SENSITIVITY_FINE
  if (e.metaKey || e.ctrlKey) return SENSITIVITY_COARSE
  return SENSITIVITY_NORMAL
}

/**
 * SVG rotary knob with Ghost Handle, fine-tune mode, and direct value entry.
 *
 * Interactions:
 * - Drag vertically to adjust value (up = increase)
 * - Shift+drag for fine precision (10x finer)
 * - Cmd/Ctrl+drag for coarse adjustment (4x faster)
 * - Scroll wheel to adjust value (Shift=fine, Cmd=coarse)
 * - Double-click SVG or value label to type exact value
 * - Right-click to reset to default
 * - Arrow keys when focused: +/- 1% of range (Shift: 10%)
 */
export default function Knob({
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
}: KnobProps) {
  const [isEditing, setIsEditing] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startSlider = useRef(0)

  const range = max - min
  const step = type === 'int' ? 1 : range / 1000

  // Convert value to normalized slider position [0,1] accounting for curve
  const sliderPos = valueToSlider(value, min, max, curve)
  const ghostSliderPos = ghostValue !== undefined
    ? valueToSlider(ghostValue, min, max, curve)
    : sliderPos

  // Arc angles
  const valueAngle = START_ANGLE + sliderPos * SWEEP
  const ghostAngle = START_ANGLE + ghostSliderPos * SWEEP

  const clampAndRound = useCallback((v: number) => {
    const clamped = Math.max(min, Math.min(max, v))
    return type === 'int' ? Math.round(clamped) : clamped
  }, [min, max, type])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 2) return // right-click handled by context menu
    e.preventDefault()
    isDragging.current = true
    startY.current = e.clientY
    startSlider.current = sliderPos
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // Focus the SVG so arrow keys work after drag interaction
    svgRef.current?.focus()
  }, [sliderPos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const sensitivity = getDragSensitivity(e)
    const delta = (startY.current - e.clientY) * sensitivity
    const newSlider = Math.max(0, Math.min(1, startSlider.current + delta))
    const newValue = sliderToValue(newSlider, min, max, curve)
    onChange(clampAndRound(newValue))
  }, [min, max, curve, onChange, clampAndRound])

  const handlePointerUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleDoubleClick = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onChange(clampAndRound(defaultValue))
  }, [defaultValue, onChange, clampAndRound])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const pct = e.shiftKey ? 0.1 : 0.01
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      onChange(clampAndRound(value + range * pct))
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      onChange(clampAndRound(value - range * pct))
    }
  }, [value, range, onChange, clampAndRound])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    let wheelStep = WHEEL_STEP_NORMAL
    if (e.shiftKey) wheelStep = WHEEL_STEP_FINE
    else if (e.metaKey || e.ctrlKey) wheelStep = WHEEL_STEP_COARSE
    // deltaY < 0 = scroll up = increase value
    const direction = e.deltaY < 0 ? 1 : -1
    const newSlider = Math.max(0, Math.min(1, sliderPos + direction * wheelStep))
    const newValue = sliderToValue(newSlider, min, max, curve)
    onChange(clampAndRound(newValue))
    // Focus SVG so subsequent arrow keys work
    svgRef.current?.focus()
  }, [sliderPos, min, max, curve, onChange, clampAndRound])

  const handleNumberConfirm = useCallback((v: number) => {
    setIsEditing(false)
    onChange(clampAndRound(v))
  }, [onChange, clampAndRound])

  // Background track arc (full sweep)
  const trackPath = arcPath(START_ANGLE, START_ANGLE + SWEEP)
  // Value arc
  const valuePath = sliderPos > 0.001 ? arcPath(START_ANGLE, valueAngle) : ''
  // Ghost arc — visible only when ghostValue differs from value (modulation active)
  const ghostPath = ghostValue !== undefined && Math.abs(ghostSliderPos - sliderPos) > 0.001
    ? arcPath(START_ANGLE, ghostAngle)
    : ''

  return (
    <ParamTooltip
      label={label}
      description={description}
      min={min}
      max={max}
      unit={unit}
      defaultValue={defaultValue}
    >
      <div className="knob">
        <span className="knob__label">{label}</span>
        <svg
          ref={svgRef}
          className="knob__svg"
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
        >
          {/* Track */}
          <path
            d={trackPath}
            fill="none"
            stroke="#444"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {/* Ghost Handle (30% opacity — shows modulated value) */}
          {ghostPath && (
            <path
              d={ghostPath}
              fill="none"
              stroke="#4ade80"
              strokeWidth={STROKE}
              strokeLinecap="round"
              opacity={0.3}
            />
          )}
          {/* Value arc */}
          {valuePath && (
            <path
              d={valuePath}
              fill="none"
              stroke="#4ade80"
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          )}
          {/* Center dot */}
          <circle cx={CX} cy={CY} r={2} fill="#888" />
        </svg>
        {isEditing ? (
          <NumberInput
            value={value}
            min={min}
            max={max}
            step={step}
            onConfirm={handleNumberConfirm}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div className="knob__value" onDoubleClick={handleDoubleClick}>
            <ParamLabel
              label=""
              value={value}
              unit={unit}
              type={type}
              description={description}
            />
          </div>
        )}
      </div>
    </ParamTooltip>
  )
}
