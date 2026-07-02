/**
 * GainMeter tests — F-0516-6 audio meter component.
 *
 * Covers the pure mapping helpers (db → visual fraction, db → color band)
 * and the rendered output at representative dB levels. Wiring into the
 * audio store happens in a follow-up PR; this layer locks the math so
 * a hot-path render regression is caught at the cheap test layer.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import GainMeter, { dbToVisual, dbToColor } from '../../renderer/components/audio/GainMeter'

afterEach(() => {
  cleanup()
})

describe('dbToVisual — log scale -60..0 dBFS → 0..1', () => {
  it('returns 0 at silence (-Infinity)', () => {
    expect(dbToVisual(-Infinity)).toBe(0)
  })

  it('returns 0 at the floor (-60 dB)', () => {
    expect(dbToVisual(-60)).toBe(0)
  })

  it('returns 0 below the floor (-120 dB)', () => {
    expect(dbToVisual(-120)).toBe(0)
  })

  it('returns 1 at full scale (0 dB)', () => {
    expect(dbToVisual(0)).toBe(1)
  })

  it('returns 1 above full scale (clamps)', () => {
    expect(dbToVisual(3)).toBe(1)
  })

  it('returns 0.5 at -30 dB (mid scale)', () => {
    expect(dbToVisual(-30)).toBeCloseTo(0.5, 5)
  })

  it('returns 0 on NaN (no UI crash on bad data)', () => {
    expect(dbToVisual(NaN)).toBe(0)
  })
})

describe('dbToColor — Ableton color band', () => {
  it('green for quiet (-12 to -60)', () => {
    expect(dbToColor(-30)).toBe('#4ade80')
    expect(dbToColor(-12)).toBe('#4ade80')
  })

  it('yellow for modulating (-3 to -12)', () => {
    expect(dbToColor(-6)).toBe('#facc15')
    expect(dbToColor(-3.5)).toBe('#facc15')
  })

  it('orange for hot (above -3)', () => {
    expect(dbToColor(-1)).toBe('#f97316')
    expect(dbToColor(0)).toBe('#f97316')
  })
})

describe('GainMeter — render', () => {
  it('renders a meter role with aria attributes', () => {
    const { container } = render(<GainMeter rmsDb={-12} peakDb={-6} clipped={false} />)
    const meter = container.querySelector('[role="meter"]') as HTMLElement
    expect(meter).toBeTruthy()
    expect(meter.getAttribute('aria-valuenow')).toBe('-12')
    expect(meter.getAttribute('aria-valuemin')).toBe('-60')
    expect(meter.getAttribute('aria-valuemax')).toBe('0')
  })

  it('exposes raw values as data-* attributes for snapshot debugging', () => {
    const { container } = render(<GainMeter rmsDb={-9.03} peakDb={-3} clipped={false} />)
    const meter = container.querySelector('[role="meter"]') as HTMLElement
    expect(meter.getAttribute('data-rms-db')).toBe('-9.03')
    expect(meter.getAttribute('data-peak-db')).toBe('-3')
    expect(meter.getAttribute('data-clipped')).toBe('false')
  })

  it('adds --clipped modifier class when clipped=true', () => {
    const { container } = render(<GainMeter rmsDb={-1} peakDb={0} clipped={true} />)
    const meter = container.querySelector('.gain-meter') as HTMLElement
    expect(meter.className).toContain('gain-meter--clipped')
    const led = container.querySelector('.gain-meter__clip-led') as HTMLElement
    expect(led.className).toContain('gain-meter__clip-led--on')
  })

  it('clip LED is NOT lit when clipped=false (even at hot levels)', () => {
    const { container } = render(<GainMeter rmsDb={-1} peakDb={-0.5} clipped={false} />)
    const led = container.querySelector('.gain-meter__clip-led') as HTMLElement
    expect(led.className).not.toContain('gain-meter__clip-led--on')
  })

  it('horizontal orientation (default) sets bar width', () => {
    const { container } = render(<GainMeter rmsDb={-30} peakDb={-20} clipped={false} />)
    const bar = container.querySelector('.gain-meter__bar') as HTMLElement
    expect(bar.style.width).toBe('50%') // -30 dB on a -60..0 scale → 0.5
    expect(bar.style.height).toBe('100%')
  })

  it('vertical orientation sets bar height instead', () => {
    const { container } = render(
      <GainMeter rmsDb={-30} peakDb={-20} clipped={false} orientation="vertical" />,
    )
    const bar = container.querySelector('.gain-meter__bar') as HTMLElement
    expect(bar.style.height).toBe('50%')
    expect(bar.style.width).toBe('100%')
  })

  it('peak indicator position tracks peak dB independently of RMS', () => {
    const { container } = render(<GainMeter rmsDb={-30} peakDb={-12} clipped={false} />)
    const peak = container.querySelector('.gain-meter__peak') as HTMLElement
    // -12 dB on a -60..0 scale → 0.8. Horizontal default → left calc.
    expect(peak.style.left).toContain('80%')
  })

  it('floor dB pegs bar at 0% (no negative width)', () => {
    const { container } = render(<GainMeter rmsDb={-120} peakDb={-120} clipped={false} />)
    const bar = container.querySelector('.gain-meter__bar') as HTMLElement
    expect(bar.style.width).toBe('0%')
  })

  it('bar color shifts with RMS level (green → yellow → orange)', () => {
    const { container: c1 } = render(<GainMeter rmsDb={-30} peakDb={-20} clipped={false} />)
    const bar1 = c1.querySelector('.gain-meter__bar') as HTMLElement
    expect(bar1.style.background).toMatch(/#4ade80|rgb\(74,\s*222,\s*128\)/)
    cleanup()

    const { container: c2 } = render(<GainMeter rmsDb={-6} peakDb={-3} clipped={false} />)
    const bar2 = c2.querySelector('.gain-meter__bar') as HTMLElement
    expect(bar2.style.background).toMatch(/#facc15|rgb\(250,\s*204,\s*21\)/)
    cleanup()

    const { container: c3 } = render(<GainMeter rmsDb={-1} peakDb={0} clipped={false} />)
    const bar3 = c3.querySelector('.gain-meter__bar') as HTMLElement
    expect(bar3.style.background).toMatch(/#f97316|rgb\(249,\s*115,\s*22\)/)
  })
})
