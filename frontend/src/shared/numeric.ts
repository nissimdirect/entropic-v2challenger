/** Clamp a value to [min, max], returning fallback if NaN/Inf. */
export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

/** Assert a number is finite and positive. Throws if not. */
export function guardPositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${value}`)
  }
  return value
}
