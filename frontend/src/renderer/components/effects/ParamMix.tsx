interface ParamMixProps {
  mix: number
  onChange: (mix: number) => void
}

export default function ParamMix({ mix, onChange }: ParamMixProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    onChange(Math.max(0, Math.min(1, val)))
  }

  return (
    <div className="param-mix">
      <label className="param-mix__label">
        <span>Dry/Wet Mix</span>
        <span className="param-mix__value">{mix.toFixed(2)}</span>
      </label>
      <input
        type="range"
        className="param-mix__input"
        min={0}
        max={1}
        step={0.01}
        value={mix}
        onChange={handleChange}
      />
    </div>
  )
}
