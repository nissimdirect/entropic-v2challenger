/**
 * B2 — Sampler device tile for a Performance track (presentation + store updates).
 *
 * Renders in the device-chain row when a performance track that owns a Sampler is
 * selected. Source = a project video asset (set via the picker; see note). start /
 * speed / opacity / blend clamp + write the track's sampler. Store-driven so it
 * unit-tests without the render path.
 *
 * NOTE: the spec'd "drag a video onto the sampler" gesture needs a draggable video
 * source — timeline clips are draggable={false} and there's no asset browser yet —
 * so v1 sets the source via this picker. Drag-to-load lands once a draggable clip/
 * asset element exists.
 */
import { useInstrumentsStore } from '../../stores/instruments'
import { useProjectStore } from '../../stores/project'
import { SAMPLER_SPEED_MAX, SAMPLER_SPEED_MIN } from './types'
import { clampFinite } from '../../../shared/numeric'
import type { BlendMode } from '../../../shared/types'

const BLEND_MODES: BlendMode[] = [
  'normal', 'add', 'multiply', 'screen', 'overlay',
  'difference', 'exclusion', 'darken', 'lighten',
]

export default function SamplerDevice({ trackId }: { trackId: string }) {
  const inst = useInstrumentsStore((s) => s.instruments[trackId])
  const updateSampler = useInstrumentsStore((s) => s.updateSampler)
  const setSource = useInstrumentsStore((s) => s.setSource)
  const assets = useProjectStore((s) => s.assets)

  if (!inst) return null

  const videoAssets = Object.values(assets).filter((a) => a.type === 'video')

  return (
    <div className="sampler-device" data-testid="sampler-device">
      <label className="sampler-device__row">
        <span>Source</span>
        <select
          data-testid="sampler-source"
          value={inst.clipId}
          onChange={(e) => setSource(trackId, e.target.value)}
        >
          <option value="">— no source —</option>
          {videoAssets.map((a) => (
            <option key={a.id} value={a.id}>{a.path.split('/').pop() ?? a.id}</option>
          ))}
        </select>
      </label>

      <label className="sampler-device__row">
        <span>Start</span>
        <input
          type="number"
          data-testid="sampler-start"
          value={inst.startFrame}
          min={0}
          onChange={(e) =>
            updateSampler(trackId, {
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
            updateSampler(trackId, {
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
            updateSampler(trackId, { opacity: clampFinite(Number(e.target.value), 0, 1, 1) })
          }
        />
      </label>

      <label className="sampler-device__row">
        <span>Blend</span>
        <select
          data-testid="sampler-blend"
          value={inst.blendMode}
          onChange={(e) => updateSampler(trackId, { blendMode: e.target.value as BlendMode })}
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
