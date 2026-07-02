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
import { useProjectStore } from '../../stores/project'
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
  // B4-editor: the rack entry is now ENABLED. Its visible label is "Sample Rack"
  // (not "Drum Rack") — "Drum Rack" collides with the B2-lite performance drumRack
  // (PadGrid/PadEditor) and would mislead. The id stays 'drum-rack' for drag/test
  // continuity; only the label changes. RackNode is the drumRack successor.
  { id: 'drum-rack', label: 'Sample Rack', enabled: true },
  // B6.3: the Wavetable IS the Frame-Bank (B6 = "Frame-Bank (Wavetable)"). Now
  // ENABLED — double-click / drag onto a selected Performance track creates a
  // Frame-Bank (addFrameBank). Like the Sampler it needs a video clip on the
  // timeline (its slots scan footage), so it shares the hasVideoClips gate.
  { id: 'wavetable', label: 'Wavetable', enabled: true },
  // B8 (P5b.19): Granulator — a grain-cloud synthesizer that SAMPLES the
  // decoded source frame and scatters seeded grains across the T/Y/X/C/F/L axes.
  // Mirror of the Frame-Bank entry: double-click / drag onto a selected
  // Performance track calls addGranulator. Needs a video clip on the timeline
  // (the grains sample footage — without it grains are transparent), so it
  // shares the hasVideoClips gate.
  { id: 'granulator', label: 'Granulator', enabled: true },
]

export default function InstrumentsBrowser() {
  const addSampler = useInstrumentsStore((s) => s.addSampler)
  const addRack = useInstrumentsStore((s) => s.addRack)
  const addFrameBank = useInstrumentsStore((s) => s.addFrameBank)
  const addGranulator = useInstrumentsStore((s) => s.addGranulator)
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const tracks = useTimelineStore((s) => s.tracks)
  const assets = useProjectStore((s) => s.assets)

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId)

  // B6.3 — project video asset ids, used to SEED a new Frame-Bank's slots so it
  // scans real footage immediately. The serializer resolves these clipIds → asset
  // path for each slot decode.
  const videoClipAssetIds = Object.values(assets)
    .filter((a) => a.type === 'video')
    .map((a) => a.id)

  // INJ-4: Sampler is disabled (with tooltip) when there are no video clips on
  // the timeline — the Sampler needs a base clip as source material.
  const hasVideoClips = tracks.some(
    (t) => (t.type === 'video' || t.type === 'text') && t.clips.length > 0,
  )

  const handleDoubleClick = (entry: RackEntry) => {
    if (!entry.enabled) return
    if (
      entry.id !== 'sampler'
      && entry.id !== 'drum-rack'
      && entry.id !== 'wavetable'
      && entry.id !== 'granulator'
    ) return

    // The Sampler + Frame-Bank (Wavetable) + Granulator need a base video clip
    // (their voices / slots / grains scan footage); the Sample Rack does NOT
    // (pads get sources individually via the RackDevice editor) — so gate only
    // the clip-backed instruments.
    const needsClip =
      entry.id === 'sampler' || entry.id === 'wavetable' || entry.id === 'granulator'
    if (needsClip && !hasVideoClips) {
      const what =
        entry.id === 'sampler'
          ? 'a Sampler'
          : entry.id === 'wavetable'
            ? 'a Frame-Bank'
            : entry.id === 'granulator'
              ? 'a Granulator'
              : 'an instrument'
      useToastStore.getState().addToast({
        level: 'warning',
        message: `Add a video clip to the timeline first, then add ${what}.`,
        source: 'instruments',
      })
      return
    }

    // All instruments require a selected Performance (MIDI) track — same guard/toast.
    if (!selectedTrack || selectedTrack.type !== 'performance') {
      const what =
        entry.id === 'sampler'
          ? 'the Sampler'
          : entry.id === 'wavetable'
            ? 'the Frame-Bank'
            : entry.id === 'granulator'
              ? 'the Granulator'
              : 'the Sample Rack'
      useToastStore.getState().addToast({
        level: 'warning',
        message: `Select a MIDI track first (Cmd+Shift+T to add one), then double-click — or drag ${what} onto it.`,
        source: 'instruments',
      })
      return
    }

    if (entry.id === 'sampler') addSampler(selectedTrack.id)
    else if (entry.id === 'drum-rack') addRack(selectedTrack.id)
    else if (entry.id === 'granulator') {
      // B8 — instantiate a Granulator on the selected track. addGranulator seeds
      // a default GranulatorInstrument (density 4, hann window, all-axes defaults,
      // random selection); the grain cloud samples the live decoded source frame
      // on the backend render arm. The user shapes density/window/axes/selection
      // in the GranulatorDevice (mounted next to FrameBankDevice in App.tsx).
      addGranulator(selectedTrack.id)
    }
    else {
      // B6.3 — seed a couple of slots from the first available video clips so the
      // Frame-Bank scans real footage immediately (the user adds/removes more in
      // the FrameBankDevice). Slot frameIndex defaults to 0.
      const clipIds = videoClipAssetIds.slice(0, 2)
      addFrameBank(selectedTrack.id, clipIds)
    }
  }

  return (
    <div className="instruments-browser" data-testid="instruments-browser">
      <div className="instruments-browser__group">RACKS</div>
      {RACKS.map((entry) => {
        // P3.5/INJ-4: Sampler is drag-disabled when no video clips on timeline.
        // B6.3: the Frame-Bank (Wavetable) shares that gate (slots scan footage).
        // B8: the Granulator shares it too (grains sample the source frame).
        const needsClip =
          entry.id === 'sampler' || entry.id === 'wavetable' || entry.id === 'granulator'
        const clipDisabled = needsClip && !hasVideoClips
        const isDraggable = entry.enabled && !clipDisabled
        const tooltip = !entry.enabled
          ? 'Coming soon'
          : clipDisabled
            ? 'Add a video clip to the timeline first'
            : 'Drag onto a MIDI track, or double-click to add to the selected MIDI track'

        return (
          <div
            key={entry.id}
            className={`instruments-browser__item${(!entry.enabled || clipDisabled) ? ' instruments-browser__item--disabled' : ''}`}
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
            {entry.label}{entry.enabled ? (clipDisabled ? '  (no clip)' : '') : '  (soon)'}
          </div>
        )
      })}
    </div>
  )
}
