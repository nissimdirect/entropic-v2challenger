import type { ParamDef } from '../../../shared/types'

interface ParamChoiceProps {
  paramKey: string
  def: ParamDef
  value: string
  onChange: (key: string, value: string) => void
}

export default function ParamChoice({ paramKey, def, value, onChange }: ParamChoiceProps) {
  return (
    <div className="param-choice">
      <label className="param-choice__label">{def.label}</label>
      <select
        className="param-choice__select"
        value={value}
        onChange={(e) => onChange(paramKey, e.target.value)}
      >
        {(def.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}
