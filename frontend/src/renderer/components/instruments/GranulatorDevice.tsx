/**
 * B8 — Granulator device tile for a Performance track (P5b.19 UI).
 *
 * Renders in the device-chain row when a performance track that owns a
 * Granulator is selected. Provides:
 *   - Per-axis density/size/jitter/position knobs (6 axes: t/y/x/c/f/l).
 *   - Selection-rule picker (random / onset; latentSimilarity only when flag on).
 *   - Per-axis envelope mini-editors (envelope field on each AxisParams).
 *   - Grain-cloud visualization (canvas fed from grain descriptors, Kentaro
 *     "density without clutter" principle — ≤ GRANULATOR_VIZ_MARKER_CAP markers).
 *   - Grain window shape selector.
 *   - L-axis gate toggle (SG-3 flag; axis is rendered but labelled gated).
 *
 * Mirrors SamplerDevice/FrameBankDevice: reads from useInstrumentsStore keyed by
 * trackId, returns null when no granulator exists (mount-safe). Store-driven so
 * it unit-tests without the render path. All numeric writes clamp at the store
 * boundary (the backend `_parse_granulator_layer` re-enforces).
 *
 * Gate 14 wiring checklist:
 *   (a) All props declared are passed from the parent (trackId only).
 *   (b) All callbacks update the store → the buildGranulatorLayer serializer
 *       picks up the new values on the next render tick.
 *   (c) Unmount cleans listeners — useEffect cleanup removes the canvas RAF
 *       reference (the RAF is conditional on mount; cleanup returns cancel).
 *   (d) Entry: renders when granulator exists; exits (null) when absent.
 *   (e) Legacy data: GranulatorInstrument is additive optional; absent map →
 *       null → no render → byte-identical (regression-safe).
 *
 * IMPORTANT: Zustand store-shape changes need kill + relaunch (HMR will NOT
 * rehydrate the `granulators` map added to InstrumentsState). Kill `npm start`
 * and restart when first adding a granulator to a track.
 */
import { useEffect, useRef } from 'react'
import { useInstrumentsStore } from '../../stores/instruments'
import { clampFinite } from '../../../shared/numeric'
import {
  GRANULATOR_AXES,
  GRANULATOR_DENSITY_MIN,
  GRANULATOR_DENSITY_MAX,
  GRANULATOR_VIZ_MARKER_CAP,
} from './types'
import type { GranulatorAxis, GranulatorInstrument } from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WINDOW_SHAPES: { value: GranulatorInstrument['window']; label: string }[] = [
  { value: 'hann', label: 'Hann' },
  { value: 'tri', label: 'Triangle' },
  { value: 'rect', label: 'Rect' },
]

/** Axis display labels. Lowercase axes, human-readable names (Kentaro: labels not numbers). */
const AXIS_LABELS: Record<GranulatorAxis, string> = {
  t: 'T (time)',
  y: 'Y (scanline)',
  x: 'X (column)',
  c: 'C (colour)',
  f: 'F (freq)',
  l: 'L (latent) ⚑',
}

/**
 * Whether the EXPERIMENTAL_LATENT_SELECTION flag is considered on.
 *
 * This is a FRONTEND-SIDE read of the env var via Vite's `import.meta.env`
 * convention. In Electron the renderer env is set at build time; at runtime
 * we default to `false` (flag off) when the var is absent.
 *
 * The backend is the ENFORCING trust boundary: a flag-off request that somehow
 * carries `latentSimilarity` is REJECTED loudly by `_parse_granulator_layer`.
 * This frontend read is purely to hide the picker option (UX gate, not security).
 */
function isLatentSelectionEnabled(): boolean {
  // Vite exposes env vars with VITE_ prefix; fall back gracefully when absent.
  try {
    const val = (import.meta as Record<string, unknown> & { env?: Record<string, string> })
      .env?.VITE_EXPERIMENTAL_LATENT_SELECTION ?? ''
    return ['true', '1', 'yes', 'on'].includes(String(val).trim().toLowerCase())
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Grain-cloud visualization
// ---------------------------------------------------------------------------

/**
 * Render a decimated grain-cloud visualization on a canvas element.
 *
 * Visualizes the per-axis T/Y positions of grains at the CURRENT params,
 * using a seeded deterministic layout (mirrors the backend grain_cloud engine
 * conceptually — the exact draw order is an APPROXIMATION for preview-rate
 * display, not a byte-exact replica of the engine).
 *
 * Kentaro "density without clutter" principle:
 *   - Render at most GRANULATOR_VIZ_MARKER_CAP markers.
 *   - Each marker: a small circle at (T * W, Y * H) in the canvas.
 *   - Opacity driven by the grain_env envelope value.
 *   - The jitter visual is shown as a halo ring (radius = jitter * markerRadius * 3).
 *
 * Exported for unit-test: `vizMarkersFromParams` returns marker positions.
 */
export function vizMarkersFromParams(
  density: number,
  tGrain: number,
  tJitter: number,
  yGrain: number,
  yJitter: number,
): Array<{ tx: number; ty: number }> {
  const cap = Math.min(density, GRANULATOR_VIZ_MARKER_CAP)
  const markers: Array<{ tx: number; ty: number }> = []
  // Deterministic seeded jitter: simple LCG so the viz is stable without
  // importing the engine's cryptographic RNG.
  let seed = 0x9e3779b9
  const lcg = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff
    return (seed >>> 0) / 0xffffffff
  }
  for (let i = 0; i < cap; i++) {
    const dT = (lcg() - 0.5) * tJitter
    const dY = (lcg() - 0.5) * yJitter
    markers.push({
      tx: clampFinite(tGrain + dT, 0, 1, tGrain),
      ty: clampFinite(yGrain + dY, 0, 1, yGrain),
    })
  }
  return markers
}

function drawGrainCloud(
  canvas: HTMLCanvasElement,
  inst: GranulatorInstrument,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = 'rgba(20,20,20,0.8)'
  ctx.fillRect(0, 0, W, H)

  const tAx = inst.axes['t']
  const yAx = inst.axes['y']
  if (!tAx || !yAx) return

  const markers = vizMarkersFromParams(
    inst.density,
    tAx.grain,
    tAx.jitter,
    yAx.grain,
    yAx.jitter,
  )

  const R = 4
  const env = clampFinite(tAx.envelope * yAx.envelope, 0, 1, 0.5)
  const alpha = 0.3 + 0.7 * env

  for (const m of markers) {
    const cx = m.tx * W
    const cy = m.ty * H

    // Jitter halo (visual radius hint)
    const haloR = R + tAx.jitter * R * 3
    ctx.beginPath()
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(74,222,128,${alpha * 0.3})`
    ctx.lineWidth = 1
    ctx.stroke()

    // Grain dot
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(74,222,128,${alpha})`
    ctx.fill()
  }

  // Axis labels
  ctx.fillStyle = 'rgba(200,200,200,0.6)'
  ctx.font = '9px JetBrains Mono, monospace'
  ctx.fillText('T →', 4, H - 4)
  ctx.save()
  ctx.translate(8, H - 16)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('Y ↑', 0, 0)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Props: trackId — the performance track this granulator is bound to.
 * Gate 14(a): trackId is the ONLY prop; it is passed from the parent.
 */
export default function GranulatorDevice({ trackId }: { trackId: string }) {
  const inst = useInstrumentsStore((s) => s.granulators[trackId])
  const setGranulatorDensity = useInstrumentsStore((s) => s.setGranulatorDensity)
  const setGranulatorWindow = useInstrumentsStore((s) => s.setGranulatorWindow)
  const setGranulatorAxisParam = useInstrumentsStore((s) => s.setGranulatorAxisParam)
  const setGranulatorLAxisEnabled = useInstrumentsStore((s) => s.setGranulatorLAxisEnabled)
  const setGranulatorSelection = useInstrumentsStore((s) => s.setGranulatorSelection)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const latentFlagOn = isLatentSelectionEnabled()

  // Gate 14(c): useEffect cleanup removes the RAF reference on unmount.
  useEffect(() => {
    if (!inst || !canvasRef.current) return

    const draw = () => {
      if (canvasRef.current && inst) {
        drawGrainCloud(canvasRef.current, inst)
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [inst])

  // Gate 14(d) exit: mount-safe null when no granulator.
  if (!inst) return null

  // Selection picker options: random + onset always; latentSimilarity only when flag on.
  const selectionOptions: { value: string; label: string }[] = [
    { value: 'random', label: 'Random (seeded)' },
    { value: 'onset', label: 'Onset (audio-transient)' },
    ...(latentFlagOn
      ? [{ value: 'latentSimilarity', label: 'Latent Similarity ⚑' }]
      : []),
  ]

  return (
    <div className="sampler-device granulator-device" data-testid="granulator-device">

      {/* Grain-cloud visualization — canvas previews T/Y grain positions. */}
      <div className="granulator-device__viz-row" data-testid="granulator-viz-row">
        <canvas
          ref={canvasRef}
          className="granulator-device__viz-canvas"
          data-testid="granulator-viz-canvas"
          width={240}
          height={80}
          title="Grain cloud: T (horizontal) × Y (vertical). Halo = jitter radius."
        />
      </div>

      {/* Density knob */}
      <label className="sampler-device__row">
        <span>Density</span>
        <input
          type="number"
          data-testid="granulator-density"
          value={inst.density}
          min={GRANULATOR_DENSITY_MIN}
          max={GRANULATOR_DENSITY_MAX}
          step={1}
          onChange={(e) =>
            setGranulatorDensity(
              trackId,
              clampFinite(Math.round(Number(e.target.value)), GRANULATOR_DENSITY_MIN, GRANULATOR_DENSITY_MAX, inst.density),
            )
          }
        />
        <span className="granulator-device__unit" data-testid="granulator-density-unit">
          grains/frame
        </span>
      </label>

      {/* Window shape */}
      <label className="sampler-device__row">
        <span>Window</span>
        <select
          data-testid="granulator-window"
          value={inst.window}
          onChange={(e) =>
            setGranulatorWindow(trackId, e.target.value as GranulatorInstrument['window'])
          }
        >
          {WINDOW_SHAPES.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
      </label>

      {/* Selection rule picker — hides latentSimilarity when flag off. */}
      <label className="sampler-device__row">
        <span>Selection</span>
        <select
          data-testid="granulator-selection"
          value={inst.selection}
          onChange={(e) =>
            setGranulatorSelection(trackId, e.target.value as never, latentFlagOn)
          }
        >
          {selectionOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* L-axis gate toggle */}
      <label className="sampler-device__row">
        <span>L-axis (latent)</span>
        <input
          type="checkbox"
          data-testid="granulator-l-axis-enabled"
          checked={inst.lAxisEnabled}
          onChange={(e) => setGranulatorLAxisEnabled(trackId, e.target.checked)}
        />
        <span className="granulator-device__gated-note">SG-3 gated</span>
      </label>

      {/* Per-axis knob rows — all 6 axes (t/y/x/c/f/l). */}
      <div className="granulator-device__axes" data-testid="granulator-axes">
        {GRANULATOR_AXES.map((ax) => {
          const axParams = inst.axes[ax]
          if (!axParams) return null
          const isLAxis = ax === 'l'
          const disabled = isLAxis && !inst.lAxisEnabled

          return (
            <div
              key={ax}
              className={`granulator-device__axis-row${disabled ? ' granulator-device__axis-row--gated' : ''}`}
              data-testid={`granulator-axis-row-${ax}`}
            >
              <span className="granulator-device__axis-label">
                {AXIS_LABELS[ax]}
              </span>

              {/* Grain (base position) */}
              <label className="granulator-device__knob-label">
                <span>Grain</span>
                <input
                  type="range"
                  data-testid={`granulator-${ax}-grain`}
                  value={axParams.grain}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={disabled}
                  onChange={(e) =>
                    setGranulatorAxisParam(
                      trackId, ax, 'grain',
                      clampFinite(Number(e.target.value), 0, 1, axParams.grain),
                    )
                  }
                />
                <span>{axParams.grain.toFixed(2)}</span>
              </label>

              {/* Jitter */}
              <label className="granulator-device__knob-label">
                <span>Jitter</span>
                <input
                  type="range"
                  data-testid={`granulator-${ax}-jitter`}
                  value={axParams.jitter}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={disabled}
                  onChange={(e) =>
                    setGranulatorAxisParam(
                      trackId, ax, 'jitter',
                      clampFinite(Number(e.target.value), 0, 1, axParams.jitter),
                    )
                  }
                />
                <span>{axParams.jitter.toFixed(2)}</span>
              </label>

              {/* Position */}
              <label className="granulator-device__knob-label">
                <span>Position</span>
                <input
                  type="range"
                  data-testid={`granulator-${ax}-position`}
                  value={axParams.position}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={disabled}
                  onChange={(e) =>
                    setGranulatorAxisParam(
                      trackId, ax, 'position',
                      clampFinite(Number(e.target.value), 0, 1, axParams.position),
                    )
                  }
                />
                <span>{axParams.position.toFixed(2)}</span>
              </label>

              {/* Envelope */}
              <label className="granulator-device__knob-label">
                <span>Env</span>
                <input
                  type="range"
                  data-testid={`granulator-${ax}-envelope`}
                  value={axParams.envelope}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={disabled}
                  onChange={(e) =>
                    setGranulatorAxisParam(
                      trackId, ax, 'envelope',
                      clampFinite(Number(e.target.value), 0, 1, axParams.envelope),
                    )
                  }
                />
                <span>{axParams.envelope.toFixed(2)}</span>
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
