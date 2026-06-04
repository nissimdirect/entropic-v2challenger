/**
 * B1 — Sampler device tile (presentation + store updates).
 *
 * start / speed / opacity / blend controls for the single loaded sampler.
 * Each change clamps + writes the store. The render trigger (requestRenderFrame
 * after each update) is wired at the App.tsx integration site (pending PR-A's
 * instruments tab + render-effect subscription) — this component is isolated
 * and store-driven so it unit-tests without the full render path.
 */
import { useInstrumentsStore } from '../../stores/instruments'
import { SAMPLER_SPEED_MAX, SAMPLER_SPEED_MIN } from './types'
import { clampFinite } from '../../../shared/numeric'
import type { BlendMode } from '../../../shared/types'

const BLEND_MODES: BlendMode[] = [
  'normal',
  'add',
  'multiply',
  'screen',
  'overlay',
  'difference',
  'exclusion',
  'darken',
  'lighten',
]

export default function SamplerDevice() {
  const inst = useInstrumentsStore((s) => s.instrument)
  const updateSampler = useInstrumentsStore((s) => s.updateSampler)

  if (!inst) return null

  return (
    <div className="sampler-device" data-testid="sampler-device">
      <label className="sampler-device__row">
        <span>Start</span>
        <input
          type="number"
          data-testid="sampler-start"
          value={inst.startFrame}
          min={0}
          onChange={(e) =>
            updateSampler({
              startFrame: Math.round(clampFinite(Number(e.target.value), 0, 1_000_000, 0)),
            })
          }
        />
      </label>

      <label className="sampler-device__row">
        <span>Speed</span>
        <input
          type="number"
          data-testid="sampler-speed"
          value={inst.speed}
          step={0.1}
          min={SAMPLER_SPEED_MIN}
          max={SAMPLER_SPEED_MAX}
          onChange={(e) =>
            updateSampler({
              speed: clampFinite(Number(e.target.value), SAMPLER_SPEED_MIN, SAMPLER_SPEED_MAX, 1),
            })
          }
        />
      </label>

      <label className="sampler-device__row">
        <span>Opacity</span>
        <input
          type="range"
          data-testid="sampler-opacity"
          value={inst.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(e) =>
            updateSampler({ opacity: clampFinite(Number(e.target.value), 0, 1, 1) })
          }
        />
      </label>

      <label className="sampler-device__row">
        <span>Blend</span>
        <select
          data-testid="sampler-blend"
          value={inst.blendMode}
          onChange={(e) => updateSampler({ blendMode: e.target.value as BlendMode })}
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
