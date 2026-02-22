import type { ParamDef } from '../../../shared/types'

interface ParamToggleProps {
  paramKey: string
  def: ParamDef
  value: boolean
  onChange: (key: string, value: boolean) => void
}

export default function ParamToggle({ paramKey, def, value, onChange }: ParamToggleProps) {
  return (
    <div className="param-toggle">
      <label className="param-toggle__label">
        <input
          type="checkbox"
          className="param-toggle__input"
          checked={value}
          onChange={(e) => onChange(paramKey, e.target.checked)}
        />
        <span>{def.label}</span>
      </label>
    </div>
  )
}
