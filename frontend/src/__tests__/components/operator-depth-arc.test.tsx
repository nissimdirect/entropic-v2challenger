/**
 * OperatorDepthArc geometry tests (P4.4).
 *
 * These parse the emitted SVG path `d` (NOT snapshots) to verify the linear
 * depth→sweep mapping, clamping, the empty-at-zero contract, and that color/
 * radius props are honored. The arc is anchored at -90° (12 o'clock) and sweeps
 * clockwise by depth * 270°.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import OperatorDepthArc from '../../renderer/components/operators/OperatorDepthArc'

const START_DEG = -90
const MAX_SWEEP = 270

/** Recover the end angle (deg, in [-90, 270]) from a path `d` arc command. */
function endAngleFromPath(d: string, cx: number, cy: number): number {
  // d = "M sx sy A r r 0 large sweep ex ey"
  const m = d.match(
    /M\s+([\d.-]+)\s+([\d.-]+)\s+A\s+[\d.-]+\s+[\d.-]+\s+0\s+[01]\s+[01]\s+([\d.-]+)\s+([\d.-]+)/,
  )
  if (!m) throw new Error(`unparseable d: ${d}`)
  const ex = parseFloat(m[3])
  const ey = parseFloat(m[4])
  // atan2 in degrees relative to center; SVG y is down so this matches our polar().
  let deg = (Math.atan2(ey - cy, ex - cx) * 180) / Math.PI
  // Normalize into the contiguous sweep range starting at -90.
  // Candidate angles differ by 360; pick the one within [START, START+360).
  while (deg < START_DEG) deg += 360
  while (deg >= START_DEG + 360) deg -= 360
  return deg
}

function getPath(container: HTMLElement): string | null {
  const path = container.querySelector('path.operator-depth-arc__path')
  return path ? path.getAttribute('d') : null
}

/** Center of the arc viewBox for a given radius (mirrors component math). */
function centerFor(radius: number): { cx: number; cy: number; size: number } {
  const stroke = 2
  const pad = stroke + 1
  const size = radius * 2 + pad * 2
  return { cx: size / 2, cy: size / 2, size }
}

describe('OperatorDepthArc geometry', () => {
  afterEach(cleanup)

  it('depth 1.0 renders a 270-degree sweep: path d end-angle within 0.5deg of 270', () => {
    const r = 10
    const { cx, cy } = centerFor(r)
    const { container } = render(<OperatorDepthArc depth={1.0} color="#fff" radius={r} />)
    const d = getPath(container)
    expect(d).toBeTruthy()
    const end = endAngleFromPath(d as string, cx, cy)
    const sweep = end - START_DEG
    expect(Math.abs(sweep - MAX_SWEEP)).toBeLessThanOrEqual(0.5)
    expect(d as string).not.toMatch(/NaN/)
  })

  it('depth 0.5 renders a 135-degree sweep (±0.5deg)', () => {
    const r = 10
    const { cx, cy } = centerFor(r)
    const { container } = render(<OperatorDepthArc depth={0.5} color="#fff" radius={r} />)
    const d = getPath(container)
    expect(d).toBeTruthy()
    const end = endAngleFromPath(d as string, cx, cy)
    const sweep = end - START_DEG
    expect(Math.abs(sweep - 135)).toBeLessThanOrEqual(0.5)
  })

  it('depth 0 renders an empty arc: d absent or zero-length, never NaN', () => {
    const { container } = render(<OperatorDepthArc depth={0} color="#fff" radius={10} />)
    const d = getPath(container)
    // No path element at all (preferred) or an empty d — never a NaN command.
    expect(d === null || d === '').toBe(true)
    expect(container.innerHTML).not.toMatch(/NaN/)
  })

  it('depth values outside 0..1 are clamped: depth=1.7 same d as 1.0, depth=-0.2 same as 0', () => {
    const r = 10
    const { container: cHigh } = render(<OperatorDepthArc depth={1.7} color="#fff" radius={r} />)
    const { container: cOne } = render(<OperatorDepthArc depth={1.0} color="#fff" radius={r} />)
    expect(getPath(cHigh)).toBe(getPath(cOne))

    const { container: cLow } = render(<OperatorDepthArc depth={-0.2} color="#fff" radius={r} />)
    const { container: cZero } = render(<OperatorDepthArc depth={0} color="#fff" radius={r} />)
    // Both empty.
    expect(getPath(cLow) === null || getPath(cLow) === '').toBe(true)
    expect(getPath(cZero) === null || getPath(cZero) === '').toBe(true)
  })

  it('arc stroke equals the color prop verbatim and radius prop sets the arc radius', () => {
    const { container } = render(<OperatorDepthArc depth={0.75} color="#abcdef" radius={13} />)
    const path = container.querySelector('path.operator-depth-arc__path') as SVGPathElement
    expect(path.getAttribute('stroke')).toBe('#abcdef')
    // The arc command carries the radius as the rx/ry value.
    const d = path.getAttribute('d') as string
    const m = d.match(/A\s+([\d.]+)\s+([\d.]+)/)
    expect(m).toBeTruthy()
    expect(parseFloat((m as RegExpMatchArray)[1])).toBeCloseTo(13, 3)
  })

  it('arc re-renders to the new sweep when the depth prop changes', () => {
    const r = 10
    const { cx, cy } = centerFor(r)
    const { container, rerender } = render(
      <OperatorDepthArc depth={0.25} color="#fff" radius={r} />,
    )
    const sweep1 = endAngleFromPath(getPath(container) as string, cx, cy) - START_DEG
    expect(Math.abs(sweep1 - 67.5)).toBeLessThanOrEqual(0.5)

    rerender(<OperatorDepthArc depth={0.75} color="#fff" radius={r} />)
    const sweep2 = endAngleFromPath(getPath(container) as string, cx, cy) - START_DEG
    expect(Math.abs(sweep2 - 202.5)).toBeLessThanOrEqual(0.5)
  })
})
