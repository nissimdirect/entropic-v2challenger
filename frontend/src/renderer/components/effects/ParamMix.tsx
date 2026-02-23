import Slider from '../common/Slider'

interface ParamMixProps {
  mix: number
  onChange: (mix: number) => void
}

export default function ParamMix({ mix, onChange }: ParamMixProps) {
  // TODO Phase 6: Replace ghostValue with resolved modulation value
  return (
    <Slider
      value={mix}
      min={0}
      max={1}
      default={1}
      label="Dry/Wet Mix"
      type="float"
      unit=""
      curve="linear"
      description="Blend between original (dry) and processed (wet) signal"
      ghostValue={mix}
      onChange={onChange}
    />
  )
}
