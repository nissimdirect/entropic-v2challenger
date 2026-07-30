import type { MacroMapping } from '../../../shared/types'
import Slider from '../common/Slider'

interface MacroKnobProps {
  macro: MacroMapping
  value: number
  onChange: (value: number) => void
}

export default function MacroKnob({ macro, value, onChange }: MacroKnobProps) {
  const range = macro.max - macro.min
  const normalized = range === 0 ? 0 : (value - macro.min) / range
  const percent = Math.round(normalized * 100)

  return (
    <div className="macro-knob">
      <label className="macro-knob__label">{macro.label}</label>
      <div className="macro-knob__slider">
        <Slider
          value={value}
          min={macro.min}
          max={macro.max}
          label={macro.label}
          type="float"
          showHeader={false}
          onChange={onChange}
        />
      </div>
      <span className="macro-knob__value">{percent}%</span>
    </div>
  )
}
