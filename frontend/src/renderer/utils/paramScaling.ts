/**
 * Parameter curve scaling utilities.
 *
 * Maps between normalized [0,1] and display [0,1] values using
 * non-linear curves. This makes wide-range params (like blur radius
 * 0-50px) feel usable — the low end gets more resolution where
 * human perception is most sensitive.
 *
 * Curves:
 *   linear:      y = x
 *   logarithmic: y = log1p(x * 9) / log(10)    — low-end emphasis
 *   exponential: y = (10^x - 1) / 9             — high-end emphasis
 *   s-curve:     y = x^2 * (3 - 2*x)            — midrange emphasis (Hermite smoothstep)
 */
import type { ParamCurve } from '../../shared/types'

const LOG10 = Math.log(10)

/**
 * Convert a normalized [0,1] slider position to a scaled [0,1] value.
 * The scaled value is then mapped to [min, max] by the caller.
 */
export function normalizedToScaled(normalized: number, curve: ParamCurve = 'linear'): number {
  const n = Math.max(0, Math.min(1, normalized))
  switch (curve) {
    case 'logarithmic':
      return Math.log1p(n * 9) / LOG10
    case 'exponential':
      return (Math.pow(10, n) - 1) / 9
    case 's-curve':
      return n * n * (3 - 2 * n)
    default:
      return n
  }
}

/**
 * Convert a scaled [0,1] value back to a normalized [0,1] slider position.
 * Inverse of normalizedToScaled.
 */
export function scaledToNormalized(scaled: number, curve: ParamCurve = 'linear'): number {
  const s = Math.max(0, Math.min(1, scaled))
  switch (curve) {
    case 'logarithmic':
      // Inverse of log1p(x*9)/log(10): x = (10^s - 1) / 9
      return (Math.pow(10, s) - 1) / 9
    case 'exponential':
      // Inverse of (10^x-1)/9: x = log1p(s*9)/log(10)
      return Math.log1p(s * 9) / LOG10
    case 's-curve': {
      // Numerical inverse of smoothstep via Newton's method
      let x = s
      for (let i = 0; i < 8; i++) {
        const fx = x * x * (3 - 2 * x) - s
        const dfx = 6 * x * (1 - x)
        if (Math.abs(dfx) < 1e-12) break
        x -= fx / dfx
        x = Math.max(0, Math.min(1, x))
      }
      return x
    }
    default:
      return s
  }
}

/**
 * Map a param value from [min, max] to a normalized [0,1] slider position,
 * accounting for the curve.
 */
export function valueToSlider(value: number, min: number, max: number, curve: ParamCurve = 'linear'): number {
  if (max <= min) return 0
  const scaled = (value - min) / (max - min)
  return scaledToNormalized(scaled, curve)
}

/**
 * Map a normalized [0,1] slider position to a param value in [min, max],
 * accounting for the curve.
 */
export function sliderToValue(slider: number, min: number, max: number, curve: ParamCurve = 'linear'): number {
  const scaled = normalizedToScaled(slider, curve)
  return min + scaled * (max - min)
}

/**
 * Shared display formatter for numeric param values (Slider, Knob, ParamLabel).
 *
 * UAT P5: params with `unit === '%'` on a 0..1 range (e.g. Color Invert's
 * `amount`, default 1.0) rendered as "1.00%" with no ×100 scaling — reading
 * as one percent instead of a full-strength effect. Params whose `unit` is
 * `'%'` AND whose range is `max <= 1` are now scaled ×100 and rounded.
 *
 * Guard (`max <= 1`): a backend registry sweep of every `%`-unit param found
 * 20 that already use a wider range (e.g. `byte_corrupt.jpeg_quality` 1-95,
 * `hsl_adjust.saturation` -100..100) — those must NOT be scaled again, or
 * they'd double-scale. `max` is optional so existing callers that don't know
 * the param range (e.g. `ParamLabel` without a `max` prop) keep prior
 * behavior unchanged.
 */
export function formatParamValue(value: number, type: 'float' | 'int', unit?: string, max?: number): string {
  if (unit === '%' && max !== undefined && max <= 1) {
    return `${Math.round(value * 100)}%`
  }
  const formatted = type === 'int' ? Math.round(value).toString() : value.toFixed(2)
  return unit ? `${formatted}${unit}` : formatted
}
