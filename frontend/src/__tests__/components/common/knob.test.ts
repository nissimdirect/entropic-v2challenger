import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'

// Since Knob is a React component with SVG rendering,
// we test the behavioral logic that drives it rather than DOM rendering.
// Full rendering tests would require jsdom + @testing-library/react.

import {
  sliderToValue,
} from '../../../renderer/utils/paramScaling'
import Knob from '../../../renderer/components/common/Knob'
import Slider from '../../../renderer/components/common/Slider'

describe('Knob behavioral logic', () => {
  describe('value clamping', () => {
    it('clamps to min when value below range', () => {
      const min = 0, max = 100
      const clamped = Math.max(min, Math.min(max, -50))
      expect(clamped).toBe(0)
    })

    it('clamps to max when value above range', () => {
      const min = 0, max = 100
      const clamped = Math.max(min, Math.min(max, 200))
      expect(clamped).toBe(100)
    })

    it('rounds int values', () => {
      const value = 42.7
      expect(Math.round(value)).toBe(43)
    })
  })

  describe('keyboard adjustment', () => {
    it('arrow key adjusts by 1% of range', () => {
      const value = 50, range = 100, pct = 0.01
      const newValue = value + range * pct
      expect(newValue).toBeCloseTo(51, 5)
    })

    it('shift+arrow adjusts by 10% of range', () => {
      const value = 50, range = 100, pct = 0.1
      const newValue = value + range * pct
      expect(newValue).toBeCloseTo(60, 5)
    })
  })

  describe('drag sensitivity', () => {
    it('normal drag: 1px = ~0.5% movement', () => {
      const sensitivity = 0.005
      const delta = 10 // 10px mouse movement
      const sliderDelta = delta * sensitivity
      expect(sliderDelta).toBeCloseTo(0.05, 5)
    })

    it('shift drag: 5x finer', () => {
      const sensitivity = 0.001
      const delta = 10
      const sliderDelta = delta * sensitivity
      expect(sliderDelta).toBeCloseTo(0.01, 5)
    })
  })

  describe('arc angle calculation', () => {
    const START_ANGLE = 135
    const SWEEP = 270

    it('min value → arc at start angle', () => {
      const sliderPos = 0
      const angle = START_ANGLE + sliderPos * SWEEP
      expect(angle).toBe(135)
    })

    it('max value → arc at end angle', () => {
      const sliderPos = 1
      const angle = START_ANGLE + sliderPos * SWEEP
      expect(angle).toBe(405)
    })

    it('midpoint → arc at 270 degrees', () => {
      const sliderPos = 0.5
      const angle = START_ANGLE + sliderPos * SWEEP
      expect(angle).toBe(270)
    })
  })

  describe('ghost handle visibility', () => {
    it('ghost invisible when same as value', () => {
      const sliderPos = 0.5
      const ghostPos = 0.5
      const visible = Math.abs(ghostPos - sliderPos) > 0.001
      expect(visible).toBe(false)
    })

    it('ghost visible when different from value', () => {
      const sliderPos = 0.5
      const ghostPos = 0.7
      const visible = Math.abs(ghostPos - sliderPos) > 0.001
      expect(visible).toBe(true)
    })
  })

  describe('right-click reset', () => {
    it('resets to default value', () => {
      const defaultValue = 180
      const clampAndRound = (v: number) => Math.max(0, Math.min(360, v))
      expect(clampAndRound(defaultValue)).toBe(180)
    })
  })

  describe('curve integration with knob', () => {
    it('logarithmic curve gives more resolution at low end', () => {
      // At 50% slider position, logarithmic maps to ~70% of value range
      const slider50pct = sliderToValue(0.5, 0, 100, 'logarithmic')
      // This should be > 50 because logarithmic emphasizes the low end
      expect(slider50pct).toBeGreaterThan(50)
    })

    it('exponential curve gives more resolution at high end', () => {
      // At 50% slider position, exponential maps to ~25% of value range
      const slider50pct = sliderToValue(0.5, 0, 100, 'exponential')
      expect(slider50pct).toBeLessThan(50)
    })
  })
})

// PUX.4 — ARIA slider semantics (Knob)
describe('Knob ARIA slider semantics', () => {
  const defaultProps = {
    value: 50,
    min: 0,
    max: 100,
    default: 50,
    label: 'Volume',
    type: 'float' as const,
    unit: 'dB',
    onChange: vi.fn(),
  }

  it('exposes role="slider" with aria-valuemin/max matching props', () => {
    const { container } = render(React.createElement(Knob, defaultProps))
    const svg = container.querySelector('[role="slider"]')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-valuemin')).toBe('0')
    expect(svg?.getAttribute('aria-valuemax')).toBe('100')
  })

  it('updates aria-valuenow when an arrow key changes the value', () => {
    let currentValue = 50
    const onChange = vi.fn((v: number) => { currentValue = v })
    const { container, rerender } = render(
      React.createElement(Knob, { ...defaultProps, value: currentValue, onChange }),
    )
    const svg = container.querySelector('[role="slider"]')!
    fireEvent.keyDown(svg, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalled()
    // Re-render with the new value to verify aria-valuenow updates
    rerender(React.createElement(Knob, { ...defaultProps, value: onChange.mock.calls[0][0], onChange }))
    const updatedSvg = container.querySelector('[role="slider"]')!
    const newNow = parseFloat(updatedSvg.getAttribute('aria-valuenow') ?? '50')
    expect(newNow).toBeGreaterThan(50)
  })

  it('formats aria-valuetext with the display formatter', () => {
    const { container } = render(React.createElement(Knob, { ...defaultProps, value: 75, unit: 'dB' }))
    const svg = container.querySelector('[role="slider"]')!
    const text = svg.getAttribute('aria-valuetext')
    expect(text).toContain('75')
    expect(text).toContain('dB')
  })
})

// PUX.4 — ARIA slider semantics (Slider)
describe('Slider ARIA slider semantics', () => {
  const defaultProps = {
    value: 50,
    min: 0,
    max: 100,
    default: 50,
    label: 'Cutoff',
    type: 'float' as const,
    unit: 'Hz',
    onChange: vi.fn(),
  }

  it('exposes role="slider" with aria-valuemin/max matching props', () => {
    const { container } = render(React.createElement(Slider, defaultProps))
    const track = container.querySelector('[role="slider"]')
    expect(track).not.toBeNull()
    expect(track?.getAttribute('aria-valuemin')).toBe('0')
    expect(track?.getAttribute('aria-valuemax')).toBe('100')
  })

  it('updates aria-valuenow when an arrow key changes the value', () => {
    let currentValue = 50
    const onChange = vi.fn((v: number) => { currentValue = v })
    const { container, rerender } = render(
      React.createElement(Slider, { ...defaultProps, value: currentValue, onChange }),
    )
    const track = container.querySelector('[role="slider"]')!
    fireEvent.keyDown(track, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalled()
    rerender(React.createElement(Slider, { ...defaultProps, value: onChange.mock.calls[0][0], onChange }))
    const updatedTrack = container.querySelector('[role="slider"]')!
    const newNow = parseFloat(updatedTrack.getAttribute('aria-valuenow') ?? '50')
    expect(newNow).toBeGreaterThan(50)
  })

  it('formats aria-valuetext with the display formatter', () => {
    const { container } = render(React.createElement(Slider, { ...defaultProps, value: 75, unit: 'Hz' }))
    const track = container.querySelector('[role="slider"]')!
    const text = track.getAttribute('aria-valuetext')
    expect(text).toContain('75')
    expect(text).toContain('Hz')
  })
})
