/**
 * GainMeter — vertical (or horizontal) audio level meter.
 *
 * F-0516-6 (parallel session UAT 2026-05-16): the Audio Gain knob had no
 * metering. User asked for "a number AND a meter showing clipping rms peak
 * per Ableton". This component is the render surface; backend math lives in
 * `backend/src/audio/meter.py` and is wired through the audio store in a
 * follow-up PR.
 *
 * Scale: log -60..0 dBFS (matches Ableton/Logic convention). Anything below
 * -60 dBFS pegs at the bottom of the meter visually but the prop value
 * itself can be anywhere from METER_FLOOR_DB (-120) up to 0+.
 *
 * Color zones (Ableton convention):
 *   ≤ -12 dBFS  → green
 *   -12..-3     → yellow
 *   > -3        → orange
 *   clipped     → red LED latched (caller controls the boolean)
 */
import { useMemo } from 'react'

interface GainMeterProps {
  /** RMS in dBFS — the slow integrated reading. */
  rmsDb: number
  /** Sample peak in dBFS — the fast instantaneous reading. */
  peakDb: number
  /** Latched clip indicator. Caller manages the 1.5s latch lifecycle. */
  clipped: boolean
  /** Bar orientation. Default 'horizontal' to fit track headers. */
  orientation?: 'horizontal' | 'vertical'
}

const METER_MIN_DB = -60
const METER_MAX_DB = 0

/** Map a dB value to a 0..1 visual position. Clamps to [METER_MIN_DB, 0]. */
export function dbToVisual(db: number): number {
  if (!Number.isFinite(db)) return 0
  if (db <= METER_MIN_DB) return 0
  if (db >= METER_MAX_DB) return 1
  return (db - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB)
}

/** Map a dB value to a color band per Ableton convention. */
export function dbToColor(db: number): string {
  if (db > -3) return '#f97316' // orange — hot, getting close to clipping
  if (db > -12) return '#facc15' // yellow — modulating, healthy program
  return '#4ade80' // green — quiet to nominal
}

export default function GainMeter({
  rmsDb,
  peakDb,
  clipped,
  orientation = 'horizontal',
}: GainMeterProps) {
  const rmsFrac = useMemo(() => dbToVisual(rmsDb), [rmsDb])
  const peakFrac = useMemo(() => dbToVisual(peakDb), [peakDb])
  const rmsColor = useMemo(() => dbToColor(rmsDb), [rmsDb])

  const isVertical = orientation === 'vertical'
  const barStyle: React.CSSProperties = isVertical
    ? { height: `${rmsFrac * 100}%`, width: '100%', background: rmsColor }
    : { width: `${rmsFrac * 100}%`, height: '100%', background: rmsColor }

  // Peak indicator: a thin line at the peak position.
  const peakStyle: React.CSSProperties = isVertical
    ? {
        position: 'absolute',
        bottom: `calc(${peakFrac * 100}% - 1px)`,
        left: 0,
        right: 0,
        height: 2,
        background: '#fff',
      }
    : {
        position: 'absolute',
        left: `calc(${peakFrac * 100}% - 1px)`,
        top: 0,
        bottom: 0,
        width: 2,
        background: '#fff',
      }

  return (
    <div
      className={`gain-meter gain-meter--${orientation}${clipped ? ' gain-meter--clipped' : ''}`}
      role="meter"
      aria-label="Audio level meter"
      aria-valuenow={Number.isFinite(rmsDb) ? Math.round(rmsDb) : METER_MIN_DB}
      aria-valuemin={METER_MIN_DB}
      aria-valuemax={METER_MAX_DB}
      data-rms-db={rmsDb}
      data-peak-db={peakDb}
      data-clipped={clipped ? 'true' : 'false'}
    >
      <div className="gain-meter__bar" style={barStyle} />
      <div className="gain-meter__peak" style={peakStyle} />
      <div
        className={`gain-meter__clip-led${clipped ? ' gain-meter__clip-led--on' : ''}`}
        aria-hidden="true"
      />
    </div>
  )
}
