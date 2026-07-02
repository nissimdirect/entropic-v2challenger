import { formatParamValue } from '../../utils/paramScaling'

interface ParamLabelProps {
  label: string
  value: number
  unit?: string
  type: 'float' | 'int'
  description?: string
  /** Param's max range — required to detect a 0..1 '%'-unit param (UAT P5). */
  max?: number
}

/**
 * Displays param name, formatted value, and unit.
 * Tooltip shows description on hover (handled via CSS title attribute).
 */
export default function ParamLabel({ label, value, unit, type, description, max }: ParamLabelProps) {
  const display = formatParamValue(value, type, unit, max)

  return (
    <div className="param-label" title={description}>
      <span className="param-label__name">{label}</span>
      <span className="param-label__value">{display}</span>
    </div>
  )
}
