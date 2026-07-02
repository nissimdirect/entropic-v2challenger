import type { MacroMapping } from '../../../shared/types'

interface MacroKnobProps {
  macro: MacroMapping
  value: number
  onChange: (value: number) => void
}

export default function MacroKnob({ macro, value, onChange }: MacroKnobProps) {
  const range = macro.max - macro.min
  const normalized = range === 0 ? 0 : (value - macro.min) / range
  const percent = Math.round(normalized * 100)
  const step = range === 0 ? 0.01 : range / 100

  return (
    <div className="macro-knob">
      <label className="macro-knob__label">{macro.label}</label>
      <input
        className="macro-knob__slider"
        type="range"
        min={macro.min}
        max={macro.max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="macro-knob__value">{percent}%</span>
    </div>
  )
}
