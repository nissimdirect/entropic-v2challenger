import type { ParamDef } from '../../../shared/types'
import Slider from '../common/Slider'

interface ParamSliderProps {
  paramKey: string
  def: ParamDef
  value: number
  onChange: (key: string, value: number) => void
}

/**
 * F3-C2: thin adapter over common/Slider — ParamSlider's own external API
 * (paramKey + ParamDef + onChange(key, value)) is unchanged for callers
 * (EffectBrowser.tsx etc.); internally it now delegates to the shared
 * primitive instead of a raw HTML range input. ParamSlider's original
 * label+value header markup was structurally identical to Slider's own
 * .hslider__header (label left, formatted value right), and Slider's
 * no-unit format (`toFixed(2)` for float, `Math.round` for int) matches
 * ParamSlider's prior custom formatting exactly, so the full card renders
 * with zero visual delta.
 */
export default function ParamSlider({ paramKey, def, value, onChange }: ParamSliderProps) {
  const min = def.min ?? 0
  const max = def.max ?? 1
  const type = def.type === 'int' ? 'int' : 'float'
  const defaultValue = typeof def.default === 'number' ? def.default : min

  return (
    <div className="param-slider">
      <Slider
        value={value}
        min={min}
        max={max}
        default={defaultValue}
        label={def.label}
        type={type}
        onChange={(v) => onChange(paramKey, v)}
      />
    </div>
  )
}
