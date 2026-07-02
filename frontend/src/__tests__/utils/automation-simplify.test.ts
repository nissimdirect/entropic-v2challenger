import { describe, it, expect } from 'vitest'
import { simplifyPoints } from '../../renderer/utils/automation-simplify'
import type { AutomationPoint } from '../../shared/types'

function pt(time: number, value: number, curve = 0): AutomationPoint {
  return { time, value, curve }
}

describe('simplifyPoints', () => {
  it('reduces collinear points to endpoints', () => {
    // 3 points on a straight line y = x
    const points = [pt(0, 0), pt(0.5, 0.5), pt(1, 1)]
    const result = simplifyPoints(points, 0.01)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(pt(0, 0))
    expect(result[1]).toEqual(pt(1, 1))
  })

  it('reduces noisy sine wave', () => {
    const points: AutomationPoint[] = []
    for (let i = 0; i < 100; i++) {
      const t = i / 99
      const noise = (Math.sin(i * 7) * 0.001) // tiny deterministic noise
      points.push(pt(t, Math.sin(t * Math.PI * 2) * 0.5 + 0.5 + noise))
    }
    const result = simplifyPoints(points, 0.01)
    expect(result.length).toBeLessThan(100)
    expect(result.length).toBeGreaterThan(1)
  })

  it('keeps all points when epsilon is 0', () => {
    const points = [pt(0, 0), pt(0.25, 0.8), pt(0.5, 0.2), pt(1, 1)]
    const result = simplifyPoints(points, 0)
    expect(result).toHaveLength(4)
  })

  it('returns empty array for empty input', () => {
    expect(simplifyPoints([], 0.01)).toEqual([])
  })

  it('returns single point unchanged', () => {
    const points = [pt(0.5, 0.7, -0.3)]
    const result = simplifyPoints(points, 0.01)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(pt(0.5, 0.7, -0.3))
  })

  it('returns two points unchanged', () => {
    const points = [pt(0, 0), pt(1, 1)]
    const result = simplifyPoints(points, 0.01)
    expect(result).toHaveLength(2)
    expect(result).toEqual(points)
  })
})
