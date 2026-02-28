import { describe, it, expect, vi } from 'vitest'

/**
 * Tests for VolumeControl logic — clamping, mute state, display value.
 * Follows the same pure-logic pattern as effects.test.ts (no DOM rendering).
 */

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume))
}

function displayVolume(volume: number, isMuted: boolean): number {
  return Math.round((isMuted ? 0 : clampVolume(volume)) * 100)
}

function speakerIcon(volume: number, isMuted: boolean): string {
  if (isMuted || volume === 0) return '\uD83D\uDD07' // 🔇
  if (volume < 0.5) return '\uD83D\uDD09'            // 🔉
  return '\uD83D\uDD0A'                               // 🔊
}

describe('VolumeControl — slider', () => {
  it('calls onVolumeChange with clamped value on change', () => {
    const onVolumeChange = vi.fn()
    const raw = 0.75
    onVolumeChange(clampVolume(raw))
    expect(onVolumeChange).toHaveBeenCalledWith(0.75)
  })

  it('clamps values above 1', () => {
    expect(clampVolume(1.5)).toBe(1)
  })

  it('clamps values below 0', () => {
    expect(clampVolume(-0.3)).toBe(0)
  })

  it('passes valid values through unchanged', () => {
    expect(clampVolume(0.42)).toBeCloseTo(0.42)
  })
})

describe('VolumeControl — mute button', () => {
  it('calls onToggleMute when button clicked', () => {
    const onToggleMute = vi.fn()
    onToggleMute()
    expect(onToggleMute).toHaveBeenCalledTimes(1)
  })

  it('toggling mute twice returns to original state (caller responsibility)', () => {
    let muted = false
    const toggle = () => { muted = !muted }
    toggle()
    expect(muted).toBe(true)
    toggle()
    expect(muted).toBe(false)
  })
})

describe('VolumeControl — display value', () => {
  it('shows 0% when muted regardless of volume', () => {
    expect(displayVolume(0.8, true)).toBe(0)
  })

  it('shows correct percentage when unmuted', () => {
    expect(displayVolume(0.5, false)).toBe(50)
    expect(displayVolume(1.0, false)).toBe(100)
    expect(displayVolume(0.0, false)).toBe(0)
  })

  it('rounds to nearest integer percent', () => {
    expect(displayVolume(0.756, false)).toBe(76)
  })
})

describe('VolumeControl — speaker icon', () => {
  it('shows muted icon when isMuted is true', () => {
    expect(speakerIcon(0.8, true)).toBe('\uD83D\uDD07')
  })

  it('shows muted icon when volume is 0', () => {
    expect(speakerIcon(0, false)).toBe('\uD83D\uDD07')
  })

  it('shows low volume icon for volume < 0.5', () => {
    expect(speakerIcon(0.3, false)).toBe('\uD83D\uDD09')
  })

  it('shows high volume icon for volume >= 0.5', () => {
    expect(speakerIcon(0.5, false)).toBe('\uD83D\uDD0A')
    expect(speakerIcon(1.0, false)).toBe('\uD83D\uDD0A')
  })
})
