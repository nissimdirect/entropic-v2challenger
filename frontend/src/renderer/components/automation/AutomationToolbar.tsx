/**
 * Mode selector: Read / Latch / Touch / Draw (radio buttons).
 * Simplify button, clear button. Shows armed track name.
 * Add Lane / Add Trigger Lane buttons with param picker.
 */
import { useCallback, useState } from 'react'
import { useAutomationStore, type AutomationMode } from '../../stores/automation'
import { useTimelineStore } from '../../stores/timeline'
import { useEffectsStore } from '../../stores/effects'
import type { TriggerMode } from '../../../shared/types'
import { FF } from '../../../shared/feature-flags'

const MODES: { value: AutomationMode; label: string; title: string }[] = [
  { value: 'read', label: 'R', title: 'Read — playback only' },
  { value: 'latch', label: 'L', title: 'Latch — record while playing' },
  { value: 'touch', label: 'T', title: 'Touch — record while knob held' },
  { value: 'draw', label: 'D', title: 'Draw — paint freehand' },
]

const LANE_COLORS = ['#4ade80', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899']

function pickColor(existingCount: number): string {
  return LANE_COLORS[existingCount % LANE_COLORS.length]
}

interface ParamOption {
  effectId: string
  effectName: string
  paramKey: string
  paramLabel: string
}

export default function AutomationToolbar() {
  const mode = useAutomationStore((s) => s.mode)
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const tracks = useTimelineStore((s) => s.tracks)
  const armedTrack = tracks.find((t) => t.id === armedTrackId)
  const [pickerMode, setPickerMode] = useState<'lane' | 'trigger' | null>(null)

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

  const getAvailableParams = useCallback((): ParamOption[] => {
    if (!armedTrack) return []
    const registry = useEffectsStore.getState().registry
    const autoState = useAutomationStore.getState()
    const existingLanes = armedTrack ? autoState.getLanesForTrack(armedTrack.id) : []
    const existingPaths = new Set(existingLanes.map((l) => l.paramPath))

    const options: ParamOption[] = []
    for (const effect of armedTrack.effectChain) {
      const info = registry.find((r) => r.id === effect.effectId)
      if (!info) continue
      for (const [key, def] of Object.entries(info.params)) {
        // Only show numeric params for automation lanes
        if (def.type !== 'float' && def.type !== 'int') continue
        const paramPath = `${effect.id}.${key}`
        if (existingPaths.has(paramPath)) continue
        options.push({
          effectId: effect.id,
          effectName: info.name,
          paramKey: key,
          paramLabel: def.label,
        })
      }
    }
    return options
  }, [armedTrack])

  const handleAddLane = useCallback(() => {
    setPickerMode((prev) => (prev === 'lane' ? null : 'lane'))
  }, [])

  const handleAddTrigger = useCallback(() => {
    setPickerMode((prev) => (prev === 'trigger' ? null : 'trigger'))
  }, [])

  const handlePickParam = useCallback((option: ParamOption) => {
    if (!armedTrackId) return
    const autoState = useAutomationStore.getState()
    const existingCount = autoState.getLanesForTrack(armedTrackId).length
    const color = pickColor(existingCount)

    if (pickerMode === 'trigger') {
      const defaultTriggerMode: TriggerMode = 'gate'
      autoState.addTriggerLane(armedTrackId, option.effectId, option.paramKey, color, defaultTriggerMode)
    } else {
      autoState.addLane(armedTrackId, option.effectId, option.paramKey, color)
    }
    setPickerMode(null)
  }, [armedTrackId, pickerMode])

  const paramOptions = pickerMode ? getAvailableParams() : []

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
      {/* F-0512-34: when no track is armed, the tooltips tell users HOW to
          arm — previously they only mentioned the precondition and the user
          had no way to discover the "A" button on the track header. */}
      <button
        className="auto-toolbar__btn"
        onClick={handleAddLane}
        title={FF.F_0512_34_ARM_HINT && !armedTrackId
          ? 'Arm a track first — click the R button on a track header'
          : 'Add automation lane to armed track'}
        disabled={!armedTrackId}
        data-testid="add-lane-btn"
      >
        + Lane
      </button>
      <button
        className="auto-toolbar__btn"
        onClick={handleAddTrigger}
        title={FF.F_0512_34_ARM_HINT && !armedTrackId
          ? 'Arm a track first — click the R button on a track header'
          : 'Add trigger automation lane (0/1 toggle) to armed track'}
        disabled={!armedTrackId}
        data-testid="add-trigger-btn"
      >
        + Trigger
      </button>
      <button
        className="auto-toolbar__btn"
        onClick={handleSimplify}
        title={FF.F_0512_34_ARM_HINT && !armedTrackId
          ? 'Arm a track first — click the R button on a track header'
          : 'Simplify curves (RDP)'}
        disabled={!armedTrackId}
      >
        Simplify
      </button>
      <button
        className="auto-toolbar__btn auto-toolbar__btn--danger"
        onClick={handleClear}
        title={FF.F_0512_34_ARM_HINT && !armedTrackId
          ? 'Arm a track first — click the R button on a track header'
          : 'Clear all automation on armed track'}
        disabled={!armedTrackId}
      >
        Clear
      </button>
      {FF.F_0512_34_ARM_HINT && !armedTrackId && (
        <span className="auto-toolbar__hint">
          Click <kbd>R</kbd> on a track to arm
        </span>
      )}
      {armedTrack && (
        <span className="auto-toolbar__armed">
          Armed: {armedTrack.name}
        </span>
      )}
      {pickerMode && armedTrackId && (
        <div className="auto-toolbar__picker" data-testid="param-picker">
          <div className="auto-toolbar__picker-title">
            {pickerMode === 'trigger' ? 'Add Trigger Lane' : 'Add Automation Lane'}
          </div>
          {paramOptions.length === 0 ? (
            <div className="auto-toolbar__picker-empty">
              No available parameters (add effects or all params mapped)
            </div>
          ) : (
            paramOptions.map((opt) => (
              <button
                key={`${opt.effectId}.${opt.paramKey}`}
                className="auto-toolbar__picker-item"
                onClick={() => handlePickParam(opt)}
                data-testid={`param-option-${opt.paramKey}`}
              >
                {opt.effectName} &rsaquo; {opt.paramLabel}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
