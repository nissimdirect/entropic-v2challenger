/**
 * B2 / PR-A — Instruments browser tab (RACKS folder).
 *
 * Per PLAN.md:191 the instruments tab is a "RACKS" folder with draggable entries:
 * Drum Rack · Sampler · Wavetable. Only Sampler ships now; the others are shown
 * disabled. Drag a Sampler onto a Performance track to instantiate it, or
 * double-click to add it to the currently-selected performance track
 * (DECISIONS.md:43 — drag primary, double-click to selected track).
 *
 * P3.5: upgraded to use the P3.2 drag idiom (EFFECT_DRAG_TYPE + session nonce +
 * kind='instruments' payload). INSTRUMENT_DRAG_TYPE is kept for Track.tsx back-compat.
 * Sampler entry is disabled-with-tooltip when there are no video clips on the timeline
 * (INJ-4 spec: entry only — B1/B2 logic already merged, do NOT reimplement).
 */
import { useInstrumentsStore } from '../../stores/instruments'
import { useTimelineStore } from '../../stores/timeline'
import { useToastStore } from '../../stores/toast'
import {
  EFFECT_DRAG_TYPE,
  CREATRIX_NONCE_TYPE,
  SESSION_NONCE,
  type DragPayload,
} from '../effects/EffectBrowser'

/** Legacy dataTransfer type kept for Track.tsx back-compat drop handler. */
export const INSTRUMENT_DRAG_TYPE = 'application/x-entropic-instrument-id'

interface RackEntry {
  id: string
  label: string
  enabled: boolean
}

const RACKS: RackEntry[] = [
  { id: 'sampler', label: 'Sampler', enabled: true },
  { id: 'drum-rack', label: 'Drum Rack', enabled: false },
  { id: 'wavetable', label: 'Wavetable', enabled: false },
]

export default function InstrumentsBrowser() {
  const addSampler = useInstrumentsStore((s) => s.addSampler)
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const tracks = useTimelineStore((s) => s.tracks)

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId)

  // INJ-4: Sampler is disabled (with tooltip) when there are no video clips on
  // the timeline — the Sampler needs a base clip as source material.
  const hasVideoClips = tracks.some(
    (t) => (t.type === 'video' || t.type === 'text') && t.clips.length > 0,
  )

  const handleDoubleClick = (entry: RackEntry) => {
    if (!entry.enabled || entry.id !== 'sampler') return
    if (!hasVideoClips) {
      useToastStore.getState().addToast({
        level: 'warning',
        message: 'Add a video clip to the timeline first, then add a Sampler.',
        source: 'instruments',
      })
      return
    }
    if (!selectedTrack || selectedTrack.type !== 'performance') {
      useToastStore.getState().addToast({
        level: 'warning',
        message: 'Select a MIDI track first (Cmd+Shift+T to add one), then double-click — or drag the Sampler onto it.',
        source: 'instruments',
      })
      return
    }
    addSampler(selectedTrack.id)
  }

  return (
    <div className="instruments-browser" data-testid="instruments-browser">
      <div className="instruments-browser__group">RACKS</div>
      {RACKS.map((entry) => {
        // P3.5/INJ-4: Sampler is drag-disabled when no video clips on timeline.
        const samplerDisabled = entry.id === 'sampler' && !hasVideoClips
        const isDraggable = entry.enabled && !samplerDisabled
        const tooltip = !entry.enabled
          ? 'Coming soon'
          : samplerDisabled
            ? 'Add a video clip to the timeline first'
            : 'Drag onto a MIDI track, or double-click to add to the selected MIDI track'

        return (
          <div
            key={entry.id}
            className={`instruments-browser__item${(!entry.enabled || samplerDisabled) ? ' instruments-browser__item--disabled' : ''}`}
            data-testid={`instrument-${entry.id}`}
            draggable={isDraggable}
            onDragStart={(e) => {
              if (!isDraggable) return
              // P3.5: P3.2 drag idiom — EFFECT_DRAG_TYPE + nonce + kind=instruments
              const payload: DragPayload = { kind: 'instruments', id: `builtin:${entry.id}` }
              e.dataTransfer.effectAllowed = 'copy'
              e.dataTransfer.setData(EFFECT_DRAG_TYPE, JSON.stringify(payload))
              e.dataTransfer.setData(CREATRIX_NONCE_TYPE, SESSION_NONCE)
              // Back-compat: Track.tsx still reads INSTRUMENT_DRAG_TYPE.
              e.dataTransfer.setData(INSTRUMENT_DRAG_TYPE, entry.id)
              e.dataTransfer.setData('text/plain', entry.label)
            }}
            onDoubleClick={() => handleDoubleClick(entry)}
            title={tooltip}
          >
            {entry.label}{entry.enabled ? (samplerDisabled ? '  (no clip)' : '') : '  (soon)'}
          </div>
        )
      })}
    </div>
  )
}
