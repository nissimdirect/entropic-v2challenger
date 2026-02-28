import { describe, it, expect } from 'vitest'
import { downsamplePeaks } from '../../../renderer/components/transport/useWaveform'
import type { WaveformPeaks } from '../../../renderer/components/transport/useWaveform'

/**
 * Utility: build a synthetic peaks array with a given number of bins,
 * channels, and uniform [min, max] values.
 */
function makePeaks(numBins: number, channels: number, min = -0.5, max = 0.5): WaveformPeaks {
  return Array.from({ length: numBins }, () =>
    Array.from({ length: channels }, () => [min, max]),
  )
}

// ---------------------------------------------------------------------------
// downsamplePeaks — core logic unit tests
// ---------------------------------------------------------------------------

describe('downsamplePeaks', () => {
  it('returns correct bin count when targetWidth equals numBins', () => {
    const peaks = makePeaks(100, 1)
    const result = downsamplePeaks(peaks, 100)
    expect(result).toHaveLength(100)
  })

  it('returns correct bin count when targetWidth is less than numBins', () => {
    const peaks = makePeaks(200, 1)
    const result = downsamplePeaks(peaks, 80)
    expect(result).toHaveLength(80)
  })

  it('returns correct bin count when targetWidth is greater than numBins (capped at numBins)', () => {
    const peaks = makePeaks(50, 1)
    const result = downsamplePeaks(peaks, 200)
    // Cannot produce more bins than source data
    expect(result).toHaveLength(50)
  })

  it('does not crash on empty peaks array', () => {
    const result = downsamplePeaks([], 100)
    expect(result).toHaveLength(0)
  })

  it('does not crash on null-like empty peaks', () => {
    const result = downsamplePeaks([] as WaveformPeaks, 0)
    expect(result).toHaveLength(0)
  })

  it('returns empty array when targetWidth is 0', () => {
    const peaks = makePeaks(100, 1)
    const result = downsamplePeaks(peaks, 0)
    expect(result).toHaveLength(0)
  })

  it('preserves min/max values for uniform data', () => {
    const peaks = makePeaks(100, 1, -0.8, 0.8)
    const result = downsamplePeaks(peaks, 100)
    for (const bin of result) {
      expect(bin.min).toBeCloseTo(-0.8)
      expect(bin.max).toBeCloseTo(0.8)
    }
  })

  it('mixes channels by taking overall min/max', () => {
    // ch0: [-0.2, 0.3], ch1: [-0.5, 0.1] -> expected: [-0.5, 0.3]
    const peaks: WaveformPeaks = [
      [
        [-0.2, 0.3],
        [-0.5, 0.1],
      ],
    ]
    const result = downsamplePeaks(peaks, 1)
    expect(result[0].min).toBeCloseTo(-0.5)
    expect(result[0].max).toBeCloseTo(0.3)
  })

  it('handles single bin, single channel', () => {
    const peaks: WaveformPeaks = [[[-0.1, 0.9]]]
    const result = downsamplePeaks(peaks, 1)
    expect(result).toHaveLength(1)
    expect(result[0].min).toBeCloseTo(-0.1)
    expect(result[0].max).toBeCloseTo(0.9)
  })

  it('collapses multiple source bins into one output bin correctly', () => {
    // 4 bins -> 2 output bins. First pair: min=-0.9, max=0.9. Second: min=-0.1, max=0.1
    const peaks: WaveformPeaks = [
      [[-0.9, 0.9]],
      [[-0.5, 0.5]],
      [[-0.1, 0.1]],
      [[-0.05, 0.05]],
    ]
    const result = downsamplePeaks(peaks, 2)
    expect(result).toHaveLength(2)
    expect(result[0].min).toBeCloseTo(-0.9)
    expect(result[0].max).toBeCloseTo(0.9)
    expect(result[1].min).toBeCloseTo(-0.1)
    expect(result[1].max).toBeCloseTo(0.1)
  })
})

// ---------------------------------------------------------------------------
// Seek logic (proportional time calculation — extracted from Waveform click handler)
// ---------------------------------------------------------------------------

function seekTimeFromClick(clickX: number, canvasWidth: number, duration: number): number {
  const ratio = Math.max(0, Math.min(1, clickX / canvasWidth))
  return ratio * duration
}

describe('Waveform seek logic', () => {
  it('fires seek at 0s when clicking left edge', () => {
    expect(seekTimeFromClick(0, 800, 60)).toBe(0)
  })

  it('fires seek at full duration when clicking right edge', () => {
    expect(seekTimeFromClick(800, 800, 60)).toBe(60)
  })

  it('fires seek at proportional time at midpoint', () => {
    expect(seekTimeFromClick(400, 800, 60)).toBeCloseTo(30)
  })

  it('clamps seek time when clickX is negative', () => {
    expect(seekTimeFromClick(-50, 800, 60)).toBe(0)
  })

  it('clamps seek time when clickX exceeds canvas width', () => {
    expect(seekTimeFromClick(900, 800, 60)).toBe(60)
  })

  it('returns 0 for zero-duration video', () => {
    // duration=0 means nothing to seek
    expect(seekTimeFromClick(400, 800, 0)).toBe(0)
  })
})
