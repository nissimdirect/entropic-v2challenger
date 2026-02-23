interface ParamLabelProps {
  label: string
  value: number
  unit?: string
  type: 'float' | 'int'
  description?: string
}

/**
 * Displays param name, formatted value, and unit.
 * Tooltip shows description on hover (handled via CSS title attribute).
 */
export default function ParamLabel({ label, value, unit, type, description }: ParamLabelProps) {
  const formatted = type === 'int' ? Math.round(value).toString() : value.toFixed(2)
  const display = unit ? `${formatted}${unit}` : formatted

  return (
    <div className="param-label" title={description}>
      <span className="param-label__name">{label}</span>
      <span className="param-label__value">{display}</span>
    </div>
  )
}
