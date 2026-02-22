import type { ParamDef } from '../../../shared/types'

interface ParamSliderProps {
  paramKey: string
  def: ParamDef
  value: number
  onChange: (key: string, value: number) => void
}

export default function ParamSlider({ paramKey, def, value, onChange }: ParamSliderProps) {
  const min = def.min ?? 0
  const max = def.max ?? 1
  const step = def.type === 'int' ? 1 : (max - min) / 100

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseFloat(e.target.value)
    const clamped = Math.max(min, Math.min(max, raw))
    const final = def.type === 'int' ? Math.round(clamped) : clamped
    onChange(paramKey, final)
  }

  return (
    <div className="param-slider">
      <label className="param-slider__label">
        <span>{def.label}</span>
        <span className="param-slider__value">
          {def.type === 'int' ? Math.round(value) : value.toFixed(2)}
        </span>
      </label>
      <input
        type="range"
        className="param-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
      />
    </div>
  )
}
