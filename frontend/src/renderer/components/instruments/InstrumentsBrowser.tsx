/**
 * B2 / PR-A — Instruments browser tab (RACKS folder).
 *
 * Per PLAN.md:191 the instruments tab is a "RACKS" folder with draggable entries:
 * Drum Rack · Sampler · Wavetable. Only Sampler ships now; the others are shown
 * disabled. Drag a Sampler onto a Performance track to instantiate it, or
 * double-click to add it to the currently-selected performance track
 * (DECISIONS.md:43 — drag primary, double-click to selected track).
 */
import { useInstrumentsStore } from '../../stores/instruments'
import { useTimelineStore } from '../../stores/timeline'
import { useToastStore } from '../../stores/toast'

/** dataTransfer type for an instrument dragged from the browser (mirrors EFFECT_DRAG_TYPE). */
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

  const handleDoubleClick = (entry: RackEntry) => {
    if (!entry.enabled || entry.id !== 'sampler') return
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
      {RACKS.map((entry) => (
        <div
          key={entry.id}
          className={`instruments-browser__item${entry.enabled ? '' : ' instruments-browser__item--disabled'}`}
          data-testid={`instrument-${entry.id}`}
          draggable={entry.enabled}
          onDragStart={(e) => {
            if (!entry.enabled) return
            e.dataTransfer.effectAllowed = 'copy'
            e.dataTransfer.setData(INSTRUMENT_DRAG_TYPE, entry.id)
            e.dataTransfer.setData('text/plain', entry.label)
          }}
          onDoubleClick={() => handleDoubleClick(entry)}
          title={entry.enabled
            ? 'Drag onto a MIDI track, or double-click to add to the selected MIDI track'
            : 'Coming soon'}
        >
          {entry.label}{entry.enabled ? '' : '  (soon)'}
        </div>
      ))}
    </div>
  )
}
