/**
 * B1 mount — Instruments sidebar tab.
 *
 * In-place home for the single B1 sampler (INJ-4's instruments tab is gated on
 * the not-yet-built PR-A layout, so this lives as a third sidebar tab next to
 * Effects / Presets). Add resolves a source clip from the selected timeline clip
 * (falling back to the first loaded asset); the render trigger is wired by an
 * effect in App.tsx that subscribes to the instrument store, so this component
 * is purely store-driven and unit-testable on its own.
 */
import { useInstrumentsStore } from '../../stores/instruments'
import { useProjectStore } from '../../stores/project'
import { useTimelineStore } from '../../stores/timeline'
import SamplerDevice from './SamplerDevice'

export default function InstrumentsPanel() {
  const instrument = useInstrumentsStore((s) => s.instrument)
  const addSampler = useInstrumentsStore((s) => s.addSampler)
  const removeSampler = useInstrumentsStore((s) => s.removeSampler)
  const assets = useProjectStore((s) => s.assets)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const tracks = useTimelineStore((s) => s.tracks)

  // Source clip = selected timeline clip's asset, else the first loaded asset.
  let clipId: string | null = null
  const selectedClipId = selectedClipIds[0] ?? null
  if (selectedClipId) {
    for (const t of tracks) {
      const c = t.clips.find((clip) => clip.id === selectedClipId)
      if (c?.assetId && assets[c.assetId]) {
        clipId = c.assetId
        break
      }
    }
  }
  if (!clipId) {
    const keys = Object.keys(assets)
    clipId = keys.length > 0 ? keys[0] : null
  }

  return (
    <div className="instruments-panel" data-testid="instruments-panel">
      {!instrument ? (
        <button
          className="instruments-panel__add"
          data-testid="add-sampler"
          disabled={!clipId}
          onClick={() => {
            if (clipId) addSampler(clipId)
          }}
        >
          {clipId ? 'Add Sampler from current clip' : 'Load a clip first'}
        </button>
      ) : (
        <div className="instruments-panel__device">
          <div className="instruments-panel__header">
            <span className="instruments-panel__title">Sampler</span>
            <button
              className="instruments-panel__remove"
              data-testid="remove-sampler"
              onClick={() => removeSampler()}
            >
              Remove
            </button>
          </div>
          <SamplerDevice />
        </div>
      )}
    </div>
  )
}
