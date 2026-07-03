import { useCallback } from 'react'
import type { BlendMode, Track as TrackType, Clip } from '../../../shared/types'
import {
  getTrackCompositing,
  getTerminalComposite,
  makeCompositeEffect,
  normalizeTransform,
} from '../../../shared/types'
import { randomUUID } from '../../utils'
import { useTimelineStore } from '../../stores/timeline'
import { useProjectStore } from '../../stores/project'

/**
 * B3 / L3 — LAYER inspector panel.
 *
 * The deep per-layer controls pulled OUT of the (now lean) track header and
 * moved into this right-dock panel, bound to the SELECTED track only. It reads
 * and writes the SAME store fields the old header controls did — no new backend:
 *   - blend / opacity  → the track's TERMINAL CompositeEffect (params.mode/opacity)
 *   - fill             → the representative clip's `opacity`
 *   - blending options → the representative clip's `maskStack` (matte) — read-only
 *                        summary; full matte editing lives in the mask tools.
 *   - transform        → the representative clip's `transform` (rotate + scale)
 *
 * "Reflects selection; never lists layer order" — order stays in the arrangement.
 * Rendered only under F_CREATRIX_LAYOUT (mounted flag-gated in App.tsx).
 *
 * Persistence: every field this panel edits already round-trips through the
 * project file (composite effect on effectChain, clip.opacity, clip.transform,
 * clip.maskStack) — guarded by b3-layer-persistence.test.ts (the F2 class).
 */

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'add', label: 'Add' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
]

/** Pick the clip whose per-clip fields (opacity/transform/matte) the panel edits:
 *  the selected clip when it lives on this track, else the track's first clip. */
function representativeClip(track: TrackType, selectedClipIds: string[]): Clip | undefined {
  const selected = track.clips.find((c) => selectedClipIds.includes(c.id))
  return selected ?? track.clips[0]
}

export default function LayerPanel() {
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const tracks = useTimelineStore((s) => s.tracks)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)

  const track = tracks.find((t) => t.id === selectedTrackId)

  // Ensure the track has a terminal composite, creating one if absent. Returns
  // the terminal composite's id (read from FRESH store state after any create),
  // or null when the track can't composite / vanished. addEffect appends via the
  // validated undo transaction so the composite lands TERMINAL.
  const ensureComposite = useCallback((trackId: string): string | null => {
    const t0 = useTimelineStore.getState().tracks.find((t) => t.id === trackId)
    if (!t0) return null
    let composite = getTerminalComposite(t0.effectChain)
    if (!composite) {
      useProjectStore.getState().addEffect(trackId, makeCompositeEffect(randomUUID()))
      const t1 = useTimelineStore.getState().tracks.find((t) => t.id === trackId)
      composite = t1 ? getTerminalComposite(t1.effectChain) : null
    }
    return composite ? composite.id : null
  }, [])

  const handleSetBlend = useCallback(
    (mode: BlendMode) => {
      if (!track) return
      const compositeId = ensureComposite(track.id)
      if (!compositeId) return
      useProjectStore.getState().updateParam(track.id, compositeId, 'mode', mode)
    },
    [track, ensureComposite],
  )

  const handleSetOpacity = useCallback(
    (value: number) => {
      if (!track) return
      const compositeId = ensureComposite(track.id)
      if (!compositeId) return
      useProjectStore.getState().updateParam(track.id, compositeId, 'opacity', value)
    },
    [track, ensureComposite],
  )

  const handleSetFill = useCallback(
    (clipId: string, value: number) => {
      useTimelineStore.getState().setClipOpacity(clipId, value)
    },
    [],
  )

  const handleSetRotate = useCallback(
    (clip: Clip, deg: number) => {
      const base = normalizeTransform(clip.transform)
      useTimelineStore.getState().setClipTransform(clip.id, { ...base, rotation: deg })
    },
    [],
  )

  const handleSetScale = useCallback(
    (clip: Clip, scale: number) => {
      const base = normalizeTransform(clip.transform)
      useTimelineStore.getState().setClipTransform(clip.id, { ...base, scaleX: scale, scaleY: scale })
    },
    [],
  )

  if (!track) {
    return (
      <div className="b3-layer b3-layer--empty" data-testid="layer-panel-empty">
        <div className="b3-layer__head">
          <b>LAYER</b>
          <span className="b3-layer__hint">select a track</span>
        </div>
      </div>
    )
  }

  const compositing = getTrackCompositing(track.effectChain)
  const clip = representativeClip(track, selectedClipIds)
  const transform = clip ? normalizeTransform(clip.transform) : null
  const fill = clip?.opacity ?? 1
  const matte = clip?.maskStack ?? []
  const canComposite = track.type !== 'audio' && track.type !== 'performance'

  return (
    <div className="b3-layer" data-testid="layer-panel">
      <div className="b3-layer__head">
        <span className="b3-layer__cc" style={{ background: track.color }} />
        <b data-testid="layer-panel-name">LAYER — {track.name}</b>
        <span className="b3-layer__link">↖ selected track</span>
      </div>

      {canComposite ? (
        <div className="b3-layer__body">
          <div className="b3-layer__sub">BLEND</div>
          <div className="b3-layer__blends" role="group" aria-label="Blend mode">
            {BLEND_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`b3-layer__blend${compositing.mode === m.value ? ' b3-layer__blend--on' : ''}`}
                aria-pressed={compositing.mode === m.value}
                data-testid={`blend-${m.value}`}
                onClick={() => handleSetBlend(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="b3-layer__row">
            <span>Opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={compositing.opacity}
              data-testid="layer-opacity"
              aria-label="Layer opacity"
              onChange={(e) => handleSetOpacity(parseFloat(e.target.value))}
            />
            <span className="b3-layer__v" data-testid="layer-opacity-v">
              {Math.round(compositing.opacity * 100)}%
            </span>
          </div>

          <div className="b3-layer__row">
            <span>Fill</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fill}
              disabled={!clip}
              data-testid="layer-fill"
              aria-label="Layer fill"
              onChange={(e) => clip && handleSetFill(clip.id, parseFloat(e.target.value))}
            />
            <span className="b3-layer__v" data-testid="layer-fill-v">
              {Math.round(fill * 100)}%
            </span>
          </div>

          <div className="b3-layer__sub">BLENDING OPTIONS</div>
          <div className="b3-layer__opt" data-testid="layer-blending-options">
            {matte.length > 0 ? (
              matte.map((node) => (
                <span key={node.id} className="b3-layer__chip b3-layer__chip--mod">
                  matte: {node.kind}
                  {node.feather > 0 ? ` · feather ${Math.round(node.feather)}` : ''}
                  {node.invert ? ' · INV' : ''}
                </span>
              ))
            ) : (
              <span className="b3-layer__chip">no matte</span>
            )}
            {clip?.maskMode && (
              <span className="b3-layer__chip">{clip.maskMode === 'deleteInside' ? 'knockout' : clip.maskMode}</span>
            )}
          </div>

          <div className="b3-layer__sub">TRANSFORM</div>
          {transform && clip ? (
            <>
              <div className="b3-layer__row">
                <span>Rotate</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={transform.rotation}
                  data-testid="layer-rotate"
                  aria-label="Layer rotation"
                  onChange={(e) => handleSetRotate(clip, parseFloat(e.target.value))}
                />
                <span className="b3-layer__v" data-testid="layer-rotate-v">
                  {Math.round(transform.rotation)}°
                </span>
              </div>
              <div className="b3-layer__row">
                <span>Scale</span>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.01}
                  value={transform.scaleX}
                  data-testid="layer-scale"
                  aria-label="Layer scale"
                  onChange={(e) => handleSetScale(clip, parseFloat(e.target.value))}
                />
                <span className="b3-layer__v" data-testid="layer-scale-v">
                  {Math.round(transform.scaleX * 100)}%
                </span>
              </div>
            </>
          ) : (
            <span className="b3-layer__chip">no clip to transform</span>
          )}
        </div>
      ) : (
        <div className="b3-layer__body">
          <span className="b3-layer__chip" data-testid="layer-no-composite">
            {track.type === 'audio' ? 'audio layer — no compositing' : 'MIDI layer — no compositing'}
          </span>
        </div>
      )}
    </div>
  )
}
