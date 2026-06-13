/**
 * B4-editor — Sample Rack device tile for a Performance track.
 *
 * The Sample Rack RENDER pipeline (B4.1 channel summing, B4.2 macros, B4-export
 * parity) shipped HEADLESS — no UI created, triggered, or edited a rack. This is
 * the MINIMAL user-facing surface that makes a rack reachable:
 *   - a PAD GRID: one clickable cell per rack pad → triggers the pad's voice
 *   - a SELECTED-PAD EDITOR: source / opacity / blend / mute / solo
 *   - an "Add pad" button
 *
 * Store-driven (mirrors SamplerDevice exactly): reads `racks[trackId]`, returns
 * null when absent, writes via setRackPadSource / updateRackPad / triggerRackPad.
 * No drag interactions (click-to-trigger only — later B4 slice).
 *
 * PAD TRIGGER PATTERN: mirrors performance/PadCell.tsx
 * (`onMouseDown={() => onTrigger(pad.id)}`) — the proven pad-trigger gesture in
 * this codebase. The triggered frame is `useProjectStore.currentFrame`, the SAME
 * frame `requestRenderFrame(currentFrame)` evaluates voices against in App.tsx,
 * so a click immediately drives the render (anti-dead-flag: the button is wired
 * end-to-end UI → triggerRackPad → composite-key event → buildRackLayers).
 *
 * We do NOT touch the B2-lite drumRack / PadGrid / PadEditor — RackNode is the
 * successor (USER DECISION); this is a NEW minimal editor.
 */
import { useState } from 'react'
import { useInstrumentsStore } from '../../stores/instruments'
import { useProjectStore } from '../../stores/project'
import { usePerformanceStore } from '../../stores/performance'
import { clampFinite } from '../../../shared/numeric'
import { RACK_PAD_OPACITY_MIN, RACK_PAD_OPACITY_MAX } from './types'
import type { BlendMode } from '../../../shared/types'

const BLEND_MODES: BlendMode[] = [
  'normal', 'add', 'multiply', 'screen', 'overlay',
  'difference', 'exclusion', 'darken', 'lighten',
]

export default function RackDevice({ trackId }: { trackId: string }) {
  const rack = useInstrumentsStore((s) => s.racks[trackId])
  const setRackPadSource = useInstrumentsStore((s) => s.setRackPadSource)
  const updateRackPad = useInstrumentsStore((s) => s.updateRackPad)
  const addRackPad = useInstrumentsStore((s) => s.addRackPad)
  const triggerRackPad = usePerformanceStore((s) => s.triggerRackPad)
  const assets = useProjectStore((s) => s.assets)

  const [selectedPadId, setSelectedPadId] = useState<string | null>(null)

  // Mirror SamplerDevice: return null when the track has no rack (mount-safe).
  if (!rack) return null

  const videoAssets = Object.values(assets).filter((a) => a.type === 'video')
  const selectedPad = rack.pads.find((p) => p.id === selectedPadId) ?? null

  // PATTERN: PadCell.tsx onMouseDown → onTrigger(pad.id). The current playhead
  // frame is useProjectStore.currentFrame — the frame the render loop evaluates.
  const onPadTrigger = (padId: string) => {
    const frame = useProjectStore.getState().currentFrame
    triggerRackPad(trackId, padId, frame)
  }

  return (
    <div className="sampler-device" data-testid="rack-device">
      <div className="sampler-device__row">
        <span>Pads</span>
        <div className="pad-grid" data-testid="rack-pad-grid">
          {rack.pads.map((pad, i) => (
            <div
              key={pad.id}
              className={`pad-cell${pad.id === selectedPadId ? ' pad-cell--armed' : ''}`}
              data-testid={`rack-pad-${pad.id}`}
              role="button"
              aria-pressed={pad.id === selectedPadId}
              // Mirror PadCell.tsx: onMouseDown triggers; click also selects for editing.
              onMouseDown={() => onPadTrigger(pad.id)}
              onClick={() => setSelectedPadId(pad.id)}
            >
              <span className="pad-cell__label">Pad {i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="sampler-device__row"
        data-testid="rack-add-pad"
        onClick={() => addRackPad(trackId)}
      >
        + Add pad
      </button>

      {selectedPad && (
        <div data-testid="rack-pad-editor">
          <label className="sampler-device__row">
            <span>Source</span>
            <select
              data-testid="rack-pad-source"
              value={selectedPad.instrument.clipId}
              onChange={(e) => setRackPadSource(trackId, selectedPad.id, e.target.value)}
            >
              <option value="">— no source —</option>
              {videoAssets.map((a) => (
                <option key={a.id} value={a.id}>{a.path.split('/').pop() ?? a.id}</option>
              ))}
            </select>
          </label>

          <label className="sampler-device__row">
            <span>Opacity</span>
            <input
              type="number"
              data-testid="rack-pad-opacity"
              value={selectedPad.opacity}
              min={RACK_PAD_OPACITY_MIN}
              max={RACK_PAD_OPACITY_MAX}
              step={0.01}
              onChange={(e) =>
                // Trust boundary: clamp [0,1] + finite (store also clamps — defense in depth).
                updateRackPad(trackId, selectedPad.id, {
                  opacity: clampFinite(
                    Number(e.target.value),
                    RACK_PAD_OPACITY_MIN,
                    RACK_PAD_OPACITY_MAX,
                    1,
                  ),
                })
              }
            />
          </label>

          <label className="sampler-device__row">
            <span>Blend</span>
            <select
              data-testid="rack-pad-blend"
              value={selectedPad.blend}
              onChange={(e) =>
                updateRackPad(trackId, selectedPad.id, { blend: e.target.value as BlendMode })
              }
            >
              {BLEND_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="sampler-device__row">
            <span>Mute</span>
            <input
              type="checkbox"
              data-testid="rack-pad-mute"
              checked={selectedPad.mute}
              onChange={(e) => updateRackPad(trackId, selectedPad.id, { mute: e.target.checked })}
            />
          </label>

          <label className="sampler-device__row">
            <span>Solo</span>
            <input
              type="checkbox"
              data-testid="rack-pad-solo"
              checked={selectedPad.solo}
              onChange={(e) => updateRackPad(trackId, selectedPad.id, { solo: e.target.checked })}
            />
          </label>
        </div>
      )}
    </div>
  )
}
