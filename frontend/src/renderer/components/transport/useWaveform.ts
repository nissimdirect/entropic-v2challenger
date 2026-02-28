import { useMemo } from 'react'

/**
 * Waveform peak data from ZMQ: shape [num_bins][channels][2] where [2] = [min, max].
 */
export type WaveformPeaks = number[][][]

export interface DownsampledBin {
  min: number
  max: number
}

/**
 * Downsamples waveform peak data to fit a target pixel width.
 *
 * Mixes all channels (mono mix) and collapses num_bins → targetWidth bins.
 * Each output bin holds the overall min/max across collapsed source bins and channels.
 */
export function downsamplePeaks(peaks: WaveformPeaks, targetWidth: number): DownsampledBin[] {
  if (!peaks || peaks.length === 0 || targetWidth <= 0) return []

  const numBins = peaks.length
  const outCount = Math.min(targetWidth, numBins)
  const ratio = numBins / outCount

  const result: DownsampledBin[] = []

  for (let i = 0; i < outCount; i++) {
    const startBin = Math.floor(i * ratio)
    const endBin = Math.min(Math.floor((i + 1) * ratio), numBins)

    let min = Infinity
    let max = -Infinity

    for (let b = startBin; b < endBin; b++) {
      const channels = peaks[b]
      if (!channels) continue
      for (const ch of channels) {
        if (!ch || ch.length < 2) continue
        const chMin = ch[0]
        const chMax = ch[1]
        if (chMin < min) min = chMin
        if (chMax > max) max = chMax
      }
    }

    result.push({
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max,
    })
  }

  return result
}

/**
 * Hook that downsamples waveform peaks to canvas width.
 *
 * @param peaks  Raw peaks from ZMQ: [num_bins][channels][2]
 * @param width  Canvas logical width in pixels
 * @returns      Array of { min, max } bins ready for canvas drawing
 */
export function useWaveform(peaks: WaveformPeaks | null, width: number): DownsampledBin[] {
  return useMemo(() => {
    if (!peaks) return []
    return downsamplePeaks(peaks, width)
  }, [peaks, width])
}
