import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track as TrackType } from '../../../shared/types'
import { useTimelineStore } from '../../stores/timeline'
import { useTrackDragReorder } from '../../hooks/useTrackDragReorder'
import { useTrackDragStore } from '../../stores/trackDrag'
import { PARAM_PROBE_DRAG_TYPE } from '../effects/ParamPanel'
import ProbeScope from './ProbeScope'
import {
  registerProbe,
  unregisterProbe,
  mountProbes,
  unmountProbes,
} from './probe-ipc'

/**
 * P6.8 (I1) — Inspector track. A first-class track type carrying probe rows
 * (no clips). Probes are added by dragging a param from the effect panel onto
 * the lane; each row shows a label + a live sparkline (`ProbeScope`). Mute/solo
 * reuse the standard track header controls (mute = pause this track's polling +
 * dim; solo = pure frontend, like instruments).
 *
 * Lifecycle (wiring-check gate): mounting the LANE mounts the backend registry
 * (`probe_mount`) so recording runs only while the inspector track is visible;
 * unmount sends `probe_unmount`. Each binding's `probe_register` is sent when it
 * appears and `probe_unregister` when removed. All pointer/IPC listeners are
 * balanced on unmount.
 */

interface InspectorTrackHeaderProps {
  track: TrackType
  isSelected: boolean
}

export function InspectorTrackHeader({ track, isSelected }: InspectorTrackHeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameText, setRenameText] = useState(track.name)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const drag = useTrackDragReorder({ trackId: track.id, isRenaming })

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select()
  }, [isRenaming])

  const startRename = useCallback(() => {
    setRenameText(track.name)
    setIsRenaming(true)
  }, [track.name])

  const confirmRename = useCallback(() => {
    setIsRenaming(false)
    const trimmed = renameText.trim()
    if (trimmed && trimmed !== track.name) {
      useTimelineStore.getState().renameTrack(track.id, trimmed)
    }
  }, [track.id, track.name, renameText])

  const cancelRename = useCallback(() => setIsRenaming(false), [])

  const handleClick = useCallback(() => {
    useTimelineStore.getState().selectTrack(track.id)
  }, [track.id])

  const handleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      useTimelineStore.getState().toggleMute(track.id)
    },
    [track.id],
  )

  const handleSolo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      useTimelineStore.getState().toggleSolo(track.id)
    },
    [track.id],
  )

  const dragFromIdx = useTrackDragStore((s) => s.fromIdx)
  const headerClasses = [
    'track-header',
    'inspector-track-header',
    isSelected ? 'track-header--selected' : '',
    dragFromIdx !== null && dragFromIdx === drag.ownIdx ? 'track-header--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={headerClasses}
      data-track-idx={drag.ownIdx}
      data-track-type="inspector"
      onClick={handleClick}
      onPointerDown={drag.onPointerDown}
    >
      <div className="track-header__color" style={{ background: track.color }} />
      <div className="track-header__info" onDoubleClick={isRenaming ? undefined : startRename}>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="track-header__rename-input"
            type="text"
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename()
              else if (e.key === 'Escape') cancelRename()
              e.stopPropagation()
            }}
            onBlur={confirmRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="track-header__name">
            <span className="timeline-track__icon--inspector">⊙</span>
            {' '}
            {track.name}
          </div>
        )}
      </div>
      <div className="track-header__controls">
        <button
          className={`track-header__btn${track.isMuted ? ' track-header__btn--active' : ''}`}
          onClick={handleMute}
          title="Mute inspector probes"
        >
          M
        </button>
        <button
          className={`track-header__btn${track.isSoloed ? ' track-header__btn--active' : ''}`}
          onClick={handleSolo}
          title="Solo inspector probes"
        >
          S
        </button>
      </div>
    </div>
  )
}

interface InspectorTrackLaneProps {
  track: TrackType
  isSelected: boolean
}

export function InspectorTrackLane({ track, isSelected }: InspectorTrackLaneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const bindings = track.probeBindings ?? []

  // Mount/unmount the backend probe registry with this lane's lifetime so
  // recording only runs while the inspector track is visible in the timeline.
  useEffect(() => {
    void mountProbes()
    return () => {
      void unmountProbes()
    }
  }, [])

  // Reconcile backend registrations with the current bindings: register any
  // newly-present probe, unregister any that disappeared. The `registered` ref
  // tracks what we last told the backend so we don't spam re-registers.
  const registeredRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const want = new Set(bindings.map((b) => b.probeId))
    const have = registeredRef.current
    for (const b of bindings) {
      if (!have.has(b.probeId)) {
        void registerProbe({
          probeId: b.probeId,
          kind: b.kind,
          label: b.label,
          trackId: track.id,
          effectId: b.effectId,
          paramPath: b.paramPath,
        })
      }
    }
    for (const id of have) {
      if (!want.has(id)) void unregisterProbe(id)
    }
    registeredRef.current = want
  }, [bindings, track.id])

  // On unmount, unregister everything we registered (symmetric cleanup).
  useEffect(() => {
    return () => {
      for (const id of registeredRef.current) void unregisterProbe(id)
      registeredRef.current = new Set()
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const raw = e.dataTransfer.getData(PARAM_PROBE_DRAG_TYPE)
      if (!raw) return
      let parsed: { effectId?: unknown; paramPath?: unknown; label?: unknown }
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
      if (typeof parsed.effectId !== 'string' || typeof parsed.paramPath !== 'string') return
      useTimelineStore.getState().addProbeBinding(track.id, {
        kind: 'param_postmod',
        effectId: parsed.effectId,
        paramPath: parsed.paramPath,
        label: typeof parsed.label === 'string' ? parsed.label : parsed.paramPath,
      })
    },
    [track.id],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only accept our own param-probe drags.
    if (e.dataTransfer.types.includes(PARAM_PROBE_DRAG_TYPE)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleRemove = useCallback(
    (probeId: string) => {
      useTimelineStore.getState().removeProbeBinding(track.id, probeId)
    },
    [track.id],
  )

  const laneClasses = [
    'inspector-track-lane',
    isSelected ? 'inspector-track-lane--selected' : '',
    isDragOver ? 'inspector-track-lane--drag-over' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={laneClasses}
      data-track-type="inspector"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {bindings.length === 0 ? (
        <div className="inspector-track-lane__empty">
          Drag a parameter here to add a probe
        </div>
      ) : (
        bindings.map((b) => (
          <div key={b.probeId} className="inspector-probe-row">
            <span className="inspector-probe-row__label" title={b.label}>
              {b.label}
            </span>
            <ProbeScope probeId={b.probeId} muted={track.isMuted} />
            <button
              className="inspector-probe-row__remove"
              onClick={() => handleRemove(b.probeId)}
              title="Remove probe"
              aria-label={`Remove probe ${b.label}`}
            >
              ×
            </button>
          </div>
        ))
      )}
    </div>
  )
}
