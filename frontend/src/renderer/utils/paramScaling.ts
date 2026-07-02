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
