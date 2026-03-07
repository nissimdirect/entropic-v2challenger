/**
 * Mode selector: Read / Latch / Touch / Draw (radio buttons).
 * Simplify button, clear button. Shows armed track name.
 */
import { useCallback } from 'react'
import { useAutomationStore, type AutomationMode } from '../../stores/automation'
import { useTimelineStore } from '../../stores/timeline'

const MODES: { value: AutomationMode; label: string; title: string }[] = [
  { value: 'read', label: 'R', title: 'Read — playback only' },
  { value: 'latch', label: 'L', title: 'Latch — record while playing' },
  { value: 'touch', label: 'T', title: 'Touch — record while knob held' },
  { value: 'draw', label: 'D', title: 'Draw — paint freehand' },
]

export default function AutomationToolbar() {
  const mode = useAutomationStore((s) => s.mode)
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const tracks = useTimelineStore((s) => s.tracks)
  const armedTrack = tracks.find((t) => t.id === armedTrackId)

  const handleModeChange = useCallback((newMode: AutomationMode) => {
    useAutomationStore.getState().setMode(newMode)
  }, [])

  const handleSimplify = useCallback(() => {
    const state = useAutomationStore.getState()
    if (!state.armedTrackId) return
    const lanes = state.getLanesForTrack(state.armedTrackId)
    for (const lane of lanes) {
      if (lane.points.length > 2) {
        state.simplifyLane(state.armedTrackId, lane.id, 0.01)
      }
    }
  }, [])

  const handleClear = useCallback(() => {
    const state = useAutomationStore.getState()
    if (!state.armedTrackId) return
    const lanes = state.getLanesForTrack(state.armedTrackId)
    for (const lane of lanes) {
      state.clearLane(state.armedTrackId, lane.id)
    }
  }, [])

  return (
    <div className="auto-toolbar">
      <div className="auto-toolbar__modes">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={`auto-toolbar__mode-btn${mode === m.value ? ' auto-toolbar__mode-btn--active' : ''}`}
            onClick={() => handleModeChange(m.value)}
            title={m.title}
          >
            {m.label}
          </button>
        ))}
      </div>
      <button
        className="auto-toolbar__btn"
        onClick={handleSimplify}
        title="Simplify curves (RDP)"
        disabled={!armedTrackId}
      >
        Simplify
      </button>
      <button
        className="auto-toolbar__btn auto-toolbar__btn--danger"
        onClick={handleClear}
        title="Clear all automation on armed track"
        disabled={!armedTrackId}
      >
        Clear
      </button>
      {armedTrack && (
        <span className="auto-toolbar__armed">
          Armed: {armedTrack.name}
        </span>
      )}
    </div>
  )
}
