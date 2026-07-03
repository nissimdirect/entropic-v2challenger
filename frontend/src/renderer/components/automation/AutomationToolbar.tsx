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
import type { Axis } from '../../../shared/axis-binding'
import { FF } from '../../../shared/feature-flags'
import {
  TRANSFORM_FIELDS,
  TRANSFORM_FIELD_META,
  formatTransformLaneEffectId,
} from '../../utils/transformLanes'

// PR-B Commit-2: Tier-1 selectable axis domains. P6.6 (C2/C3): Y/X now render
// live — a Y/X-domain lane drives a per-band spatial gradient via the backend
// banded render. 't' = today's behavior (time-domain automation_overrides).
const TIER1_DOMAINS: { value: Axis; label: string }[] = [
  { value: 't', label: 'Time' },
  { value: 'y', label: 'Y (scanline)' },
  { value: 'x', label: 'X (scanline)' },
]

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
  /** P2.1: When true, paramPath = 'projectParam.<paramKey>' instead of '<effectId>.<paramKey>'. */
  isProjectParam?: boolean
  /** F-0703: bool params are TRIGGER-only targets (gate/toggle/one-shot pulses). */
  boolOnly?: boolean
}

/**
 * P2.1 — Project-level params available as automation targets.
 * These appear as "Mixer → BPM" in the picker regardless of which track is armed.
 * paramPath in the created lane: 'projectParam.bpm'.
 */
const PROJECT_PARAM_OPTIONS: ParamOption[] = [
  {
    effectId: 'projectParam',
    effectName: 'Mixer',
    paramKey: 'bpm',
    paramLabel: 'BPM',
    isProjectParam: true,
  },
]

export default function AutomationToolbar() {
  const mode = useAutomationStore((s) => s.mode)
  const armedTrackId = useAutomationStore((s) => s.armedTrackId)
  const tracks = useTimelineStore((s) => s.tracks)
  // A1+A2: transform lanes target the SELECTED clip on the armed track. Subscribe
  // so the picker refreshes when the selection changes.
  const selectedClipId = useTimelineStore((s) => s.selectedClipId)
  const armedTrack = tracks.find((t) => t.id === armedTrackId)
  const [pickerMode, setPickerMode] = useState<'lane' | 'trigger' | null>(null)
  const [pickDomain, setPickDomain] = useState<Axis>('t')

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
        // Numeric params take continuous lanes; bool params are valid TRIGGER
        // targets (binary pulse lanes — freeze/rewind etc., F-0703). The value
        // path already works: lanes emit normalized 0..1 and the backend
        // coerces any nonzero to true.
        const isBool = def.type === 'bool'
        if (def.type !== 'float' && def.type !== 'int' && !isBool) continue
        const paramPath = `${effect.id}.${key}`
        if (existingPaths.has(paramPath)) continue
        options.push({
          effectId: effect.id,
          effectName: info.name,
          paramKey: key,
          paramLabel: def.label,
          ...(isBool ? { boolOnly: true } : {}),
        })
      }
    }

    // P2.1: Append project-level params (e.g. Mixer → BPM) if not already mapped.
    for (const opt of PROJECT_PARAM_OPTIONS) {
      const paramPath = `${opt.effectId}.${opt.paramKey}` // 'projectParam.bpm'
      if (!existingPaths.has(paramPath)) {
        options.push(opt)
      }
    }

    // A1+A2: Append the 5 clip-transform fields for the SELECTED clip — but only
    // when that clip belongs to the armed track (transform lanes live on the
    // track's lane set, keyed to a specific clip). effectId is the reserved
    // `clipTransform.<clipId>` namespace (projectParam.bpm precedent), so
    // addLane concatenates to `clipTransform.<clipId>.<field>`.
    const selClipOnArmedTrack =
      selectedClipId && armedTrack.clips.some((c) => c.id === selectedClipId)
    if (selClipOnArmedTrack) {
      const effectId = formatTransformLaneEffectId(selectedClipId)
      for (const field of TRANSFORM_FIELDS) {
        const paramPath = `${effectId}.${field}` // clipTransform.<clipId>.<field>
        if (existingPaths.has(paramPath)) continue
        options.push({
          effectId,
          effectName: 'Clip Transform',
          paramKey: field,
          paramLabel: `Clip Transform · ${TRANSFORM_FIELD_META[field].label}`,
        })
      }
    }

    return options
  }, [armedTrack, selectedClipId])

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
    // PR-B Commit-2: apply the chosen axis domain to the just-added lane (t = none).
    if (pickDomain !== 't') {
      const lanes = autoState.getLanesForTrack(armedTrackId)
      const newLane = lanes[lanes.length - 1]
      if (newLane) {
        autoState.setLaneAxisBinding(armedTrackId, newLane.id, {
          domain: pickDomain, bindingRule: 'broadcast', interpolationMode: 'linear',
        })
      }
    }
    setPickerMode(null)
  }, [armedTrackId, pickerMode, pickDomain])

  const allParamOptions = pickerMode ? getAvailableParams() : []
  // bool params only make sense as pulses — hide them from the continuous-lane picker
  const paramOptions = pickerMode === 'trigger' ? allParamOptions : allParamOptions.filter((o) => !o.boolOnly)

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
          had no way to discover the "R" button on the track header
          (formerly "A" before F-0516-10 relabel). */}
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
          <label className="auto-toolbar__picker-domain" title="Axis the lane's curve reads along. Y/X render live as a spatial gradient across the frame; T is time-domain automation.">
            Domain:{' '}
            <select
              data-testid="lane-domain-select"
              value={pickDomain}
              onChange={(e) => setPickDomain(e.target.value as Axis)}
            >
              {TIER1_DOMAINS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>
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
