/**
 * B6.3 — Frame-Bank (Wavetable) device tile for a Performance track.
 *
 * The Frame-Bank RENDER pipeline (B6.1 model + backend render, B6.2 preview +
 * export serialization) shipped HEADLESS — a frame-bank was only reachable
 * programmatically. This is the user-facing surface that makes it reachable:
 *   - a SLOT STRIP: the ordered bank of frames the position scans through, with
 *     add-slot (pick a video clip + frame) and remove-slot.
 *   - a LIVE position marker over the strip at position*(slots-1) (Kentaro
 *     "visualization IS the interface": the marker tracks the scan live).
 *   - a POSITION slider [0,1] → setFrameBankPosition (the modulation destination
 *     the existing B6.2 serialization sends to the backend → renders).
 *   - an INTERP dropdown (nearest / blend / flow; flow = CPU optical-flow morph).
 *   - a BYTE-BUDGET readout (the OOM ceiling) → setFrameBankByteBudget.
 *
 * Mirrors SamplerDevice/RackDevice: reads its instrument from the store keyed by
 * trackId, returns null when the track has no frame-bank (mount-safe). Store-
 * driven so it unit-tests without the render path. All numeric writes clamp at
 * the store boundary (the backend security.validate_frame_bank re-enforces).
 */
import { useState } from 'react'
import { useInstrumentsStore } from '../../stores/instruments'
import { useProjectStore } from '../../stores/project'
import { clampFinite } from '../../../shared/numeric'
import type { BlendMode } from '../../../shared/types'
import {
  MAX_FRAMEBANK_SLOTS,
  FRAMEBANK_BYTE_BUDGET_MIN,
  FRAMEBANK_BYTE_BUDGET_MAX,
} from './types'

// Mirror the sampler/rack blend-mode allowlist (shared BlendMode union).
const BLEND_MODES: BlendMode[] = [
  'normal', 'add', 'multiply', 'screen', 'overlay',
  'difference', 'exclusion', 'darken', 'lighten',
]

const INTERP_MODES: { value: 'nearest' | 'blend' | 'flow'; label: string }[] = [
  { value: 'nearest', label: 'nearest' },
  { value: 'blend', label: 'blend' },
  { value: 'flow', label: 'flow (CPU morph)' },
]

// P5b.23 — B9: time-axis options (3 modes, lowercase only per P1-A axis canon).
const TIME_AXIS_MODES: { value: 't' | 'y' | 'x'; label: string }[] = [
  { value: 't', label: 't (time)' },
  { value: 'y', label: 'y (slit-scan rows)' },
  { value: 'x', label: 'x (slit-scan cols)' },
]

const MB = 1024 * 1024

/**
 * Map position 0..1 → the floating index across the slot strip:
 *   position 0   → index 0
 *   position 1   → slots-1
 *   position 0.5 → midpoint ((slots-1)/2)
 * With <2 slots the index is 0 (degenerate strip). Exported for the test.
 */
export function frameBankMarkerIndex(position: number, slotCount: number): number {
  if (slotCount <= 1) return 0
  const p = clampFinite(position, 0, 1, 0)
  return p * (slotCount - 1)
}

export default function FrameBankDevice({ trackId }: { trackId: string }) {
  const fb = useInstrumentsStore((s) => s.frameBanks[trackId])
  const addFrameBankSlot = useInstrumentsStore((s) => s.addFrameBankSlot)
  const removeFrameBankSlot = useInstrumentsStore((s) => s.removeFrameBankSlot)
  const setFrameBankPosition = useInstrumentsStore((s) => s.setFrameBankPosition)
  const setFrameBankInterp = useInstrumentsStore((s) => s.setFrameBankInterp)
  const setFrameBankByteBudget = useInstrumentsStore((s) => s.setFrameBankByteBudget)
  const setFrameBankTimeAxis = useInstrumentsStore((s) => s.setFrameBankTimeAxis)
  const setFrameBankOpacity = useInstrumentsStore((s) => s.setFrameBankOpacity)
  const setFrameBankBlendMode = useInstrumentsStore((s) => s.setFrameBankBlendMode)
  const assets = useProjectStore((s) => s.assets)

  const videoAssets = Object.values(assets).filter((a) => a.type === 'video')

  // Add-slot form state (which clip + which frame). Default to the first asset.
  const [newClipId, setNewClipId] = useState<string>('')
  const [newFrame, setNewFrame] = useState<string>('0')

  if (!fb) return null

  const atSlotCap = fb.slots.length >= MAX_FRAMEBANK_SLOTS
  // Live marker: position maps across the strip. With <2 slots it sits at 0.
  const markerIndex = frameBankMarkerIndex(fb.position, fb.slots.length)
  // Percentage across the strip for the marker's left offset (0..100%).
  const markerPct = fb.slots.length > 1 ? (markerIndex / (fb.slots.length - 1)) * 100 : 0

  const assetName = (clipId: string) => {
    const a = assets[clipId]
    return a ? (a.path.split('/').pop() ?? clipId) : clipId
  }

  const onAddSlot = () => {
    const clipId = newClipId || videoAssets[0]?.id
    if (!clipId) return
    const frameIndex = Math.round(clampFinite(Number(newFrame), 0, 1_000_000, 0))
    addFrameBankSlot(trackId, { clipId, frameIndex })
  }

  return (
    <div className="sampler-device" data-testid="framebank-device">
      {/* Slot strip — the indexed bank, with the live scan marker over it. */}
      <div className="sampler-device__row">
        <span>Slots</span>
        <div
          className="framebank-strip"
          data-testid="framebank-slot-strip"
          style={{ position: 'relative', display: 'flex', gap: '2px' }}
        >
          {fb.slots.map((slot, i) => (
            <div
              key={i}
              className="framebank-slot"
              data-testid={`framebank-slot-${i}`}
              style={{ position: 'relative' }}
            >
              <span className="framebank-slot__label">
                {assetName(slot.clipId)} #{slot.frameIndex}
              </span>
              <button
                type="button"
                data-testid={`framebank-slot-remove-${i}`}
                className="framebank-slot__remove"
                onClick={() => removeFrameBankSlot(trackId, i)}
              >
                ✕
              </button>
            </div>
          ))}
          {/* Live position marker — tracks position*(slots-1) across the strip. */}
          {fb.slots.length > 0 && (
            <div
              className="framebank-strip__marker"
              data-testid="framebank-position-marker"
              data-marker-index={markerIndex}
              style={{
                position: 'absolute',
                left: `${markerPct}%`,
                top: 0,
                bottom: 0,
                width: '2px',
                background: '#4ade80',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>

      {/* Add-slot: pick a video clip + a frame index, append to the bank. */}
      <div className="sampler-device__row">
        <select
          data-testid="framebank-add-slot-clip"
          value={newClipId}
          onChange={(e) => setNewClipId(e.target.value)}
        >
          <option value="">— pick a clip —</option>
          {videoAssets.map((a) => (
            <option key={a.id} value={a.id}>{a.path.split('/').pop() ?? a.id}</option>
          ))}
        </select>
        <input
          type="number"
          data-testid="framebank-add-slot-frame"
          min={0}
          value={newFrame}
          onChange={(e) => setNewFrame(e.target.value)}
        />
        <button
          type="button"
          data-testid="framebank-add-slot"
          disabled={atSlotCap || videoAssets.length === 0}
          onClick={onAddSlot}
          title={atSlotCap ? `Slot limit reached (max ${MAX_FRAMEBANK_SLOTS})` : 'Add a slot'}
        >
          + Add slot{atSlotCap ? ` (max ${MAX_FRAMEBANK_SLOTS})` : ''}
        </button>
      </div>

      {/* Position knob — the modulation destination the backend scans. */}
      <label className="sampler-device__row">
        <span>Position</span>
        <input
          type="range"
          data-testid="framebank-position"
          value={fb.position}
          min={0}
          max={1}
          step={0.001}
          onChange={(e) => setFrameBankPosition(trackId, Number(e.target.value))}
        />
        <span data-testid="framebank-position-readout">{fb.position.toFixed(3)}</span>
      </label>

      {/* Interp mode. */}
      <label className="sampler-device__row">
        <span>Interp</span>
        <select
          data-testid="framebank-interp"
          value={fb.interp}
          onChange={(e) =>
            setFrameBankInterp(trackId, e.target.value as 'nearest' | 'blend' | 'flow')
          }
        >
          {INTERP_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>

      {/* P5b.23 — B9 time-axis selector: t (time) / y (slit-scan rows) / x (cols). */}
      <label className="sampler-device__row">
        <span>Time axis</span>
        <select
          data-testid="framebank-time-axis"
          value={fb.timeAxis ?? 't'}
          onChange={(e) =>
            setFrameBankTimeAxis(trackId, e.target.value as 't' | 'y' | 'x')
          }
        >
          {TIME_AXIS_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>

      {/* Byte-budget / residency readout (the OOM ceiling). */}
      <label className="sampler-device__row">
        <span>Budget (MB)</span>
        <input
          type="number"
          data-testid="framebank-byte-budget"
          value={Math.round(fb.byteBudget / MB)}
          min={Math.round(FRAMEBANK_BYTE_BUDGET_MIN / MB)}
          max={Math.round(FRAMEBANK_BYTE_BUDGET_MAX / MB)}
          step={1}
          onChange={(e) =>
            setFrameBankByteBudget(trackId, clampFinite(Number(e.target.value), 0, 1e12, 0) * MB)
          }
        />
        <span
          className="framebank-byte-budget__note"
          data-testid="framebank-byte-budget-note"
          title="Resident decoded-frame ceiling — the OOM guard. The backend clamps + honors it via LRU eviction."
        >
          OOM ceiling
        </span>
      </label>

      {/* Opacity — per-bank layer opacity the backend compositor reads ([0,1]). */}
      <label className="sampler-device__row">
        <span>Opacity</span>
        <input
          type="range"
          data-testid="framebank-opacity"
          value={fb.opacity ?? 1}
          min={0}
          max={1}
          step={0.01}
          onChange={(e) =>
            setFrameBankOpacity(trackId, clampFinite(Number(e.target.value), 0, 1, 1))
          }
        />
        <span data-testid="framebank-opacity-readout">{(fb.opacity ?? 1).toFixed(2)}</span>
      </label>

      {/* Blend mode — how the bank's frame composites onto the layer below. */}
      <label className="sampler-device__row">
        <span>Blend</span>
        <select
          data-testid="framebank-blend"
          value={fb.blendMode ?? 'normal'}
          onChange={(e) => setFrameBankBlendMode(trackId, e.target.value as BlendMode)}
        >
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
