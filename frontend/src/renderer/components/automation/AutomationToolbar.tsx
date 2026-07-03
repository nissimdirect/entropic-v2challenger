/**
 * Mode selector: Read / Latch / Touch / Draw (radio buttons).
 * Simplify button, clear button. Shows armed track name.
 * Add Lane / Add Trigger Lane buttons with param picker.
 */
import { useCallback, useState } from 'react'
import { useAutomationStore, type AutomationMode } from '../../stores/automation'
import { useTimelineStore } from '../../stores/timeline'
import { useEffectsStore } from '../../stores/effects'
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import type { TriggerMode, BlendOp, AutomationLaneSource } from '../../../shared/types'
import type { Axis } from '../../../shared/axis-binding'
import { FF } from '../../../shared/feature-flags'
import {
  TRANSFORM_FIELDS,
  TRANSFORM_FIELD_META,
  formatTransformLaneEffectId,
} from '../../utils/transformLanes'
import { isTriggerLane, MODULATION_LANE_COLOR } from '../../utils/automation-evaluate'
import {
  AUTOMATION_SHAPES,
  defaultShapePointCount,
  type AutomationShapeKind,
} from '../../utils/automation-shapes'

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

const BLEND_OPS: { value: BlendOp; label: string }[] = [
  { value: 'add', label: 'Add' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'max', label: 'Max' },
]

interface ParamOption {
  effectId: string
  effectName: string
  paramKey: string
  paramLabel: string
  /** P2.1: When true, paramPath = 'projectParam.<paramKey>' instead of '<effectId>.<paramKey>'. */
  isProjectParam?: boolean
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
  // A4 — continuous-lane overdub toggle (D2: 'replace'/punch-replace is the
  // locked default; 'overdub' additively layers new points instead).
  const recordMode = useAutomationStore((s) => s.recordMode)
  // AA.4b — Flatten/Ramp act on the active breakpoint selection (AA.4).
  const selectedPoints = useAutomationStore((s) => s.selectedPoints)
  const tracks = useTimelineStore((s) => s.tracks)
  // A1+A2: transform lanes target the SELECTED clip on the armed track. Subscribe
  // so the picker refreshes when the selection changes.
  const selectedClipId = useTimelineStore((s) => s.selectedClipId)
  const armedTrack = tracks.find((t) => t.id === armedTrackId)
  const [pickerMode, setPickerMode] = useState<'lane' | 'trigger' | 'mod' | null>(null)
  const [pickDomain, setPickDomain] = useState<Axis>('t')
  // AA.2 — blendOp chosen for the NEXT modulation lane created via the "+ Mod" picker.
  const [modBlendOp, setModBlendOp] = useState<BlendOp>('add')
  // AA.3-A — value source chosen for the NEXT modulation lane: drawn
  // breakpoints (AA.2 default) or a live LFO operator.
  const [modSource, setModSource] = useState<AutomationLaneSource>('drawn')

  // AA.3a — Insert Automation Shape: shape/cycles/amplitude config + the
  // open/closed state of the target-lane picker (mirrors pickerMode above).
  const [shapePickerOpen, setShapePickerOpen] = useState(false)
  const [shapeKind, setShapeKind] = useState<AutomationShapeKind>('sine')
  const [shapeCycles, setShapeCycles] = useState(4)
  const [shapeAmplitude, setShapeAmplitude] = useState(1)
  // Subscribe to lanes so the target-lane list refreshes as lanes are added/removed.
  const lanesByTrack = useAutomationStore((s) => s.lanes)
  const armedTrackLanes = (armedTrackId ? lanesByTrack[armedTrackId] : undefined) ?? []
  // Shapes only make sense on continuous lanes — trigger lanes are square-wave
  // 0/1 envelopes with their own gate/oneShot semantics (mirrors
  // AutomationTransformBox, which is also skipped for trigger lanes).
  const shapeTargetLanes = armedTrackLanes.filter((l) => !isTriggerLane(l))
  // AA.2 — "+ Mod" targets: existing absolute (non-trigger, non-modulation)
  // lanes on the armed track. A modulation lane superimposes onto an
  // absolute lane sharing its paramPath (see evaluateAutomationOverrides.ts),
  // so it always targets an ALREADY-mapped param rather than the "pick any
  // unmapped effect param" flow that + Lane/+ Trigger use.
  const modTargetLanes = armedTrackLanes.filter((l) => !isTriggerLane(l) && l.kind !== 'modulation')
  // Existing modulation lanes on the armed track — listed with an inline
  // blendOp selector so it's editable after creation, not just at add-time.
  const armedModulationLanes = armedTrackLanes.filter((l) => l.kind === 'modulation')

  const handleModeChange = useCallback((newMode: AutomationMode) => {
    useAutomationStore.getState().setMode(newMode)
  }, [])

  const handleToggleRecordMode = useCallback(() => {
    const state = useAutomationStore.getState()
    state.setRecordMode(state.recordMode === 'overdub' ? 'replace' : 'overdub')
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

  // AA.4b — Flatten: collapse the active selection to its average value.
  const handleFlatten = useCallback(() => {
    useAutomationStore.getState().flattenSelectedPoints('average')
  }, [])

  // AA.4b — Ramp: replace the selection with a straight first->last line.
  const handleRamp = useCallback(() => {
    useAutomationStore.getState().rampSelectedPoints()
  }, [])

  // AA.3a — Insert Automation Shape: toggle the target-lane picker panel.
  const handleToggleShapePicker = useCallback(() => {
    setShapePickerOpen((prev) => !prev)
  }, [])

  // AA.3a — bake the configured shape into `laneId` as ONE undo step. Honors
  // the SAME quantize grid toggle as clip editing (Cmd+U) — same
  // useLayoutStore/useProjectStore read pattern as AutomationLane.tsx's
  // getQuantizeOptions()/handleMoveSelection.
  const handleInsertShape = useCallback(
    (laneId: string) => {
      if (!armedTrackId) return
      const { quantizeEnabled, quantizeDivision } = useLayoutStore.getState()
      const { bpm } = useProjectStore.getState()
      useAutomationStore.getState().insertShapeIntoLane(armedTrackId, laneId, shapeKind, {
        cycles: shapeCycles,
        amplitude: shapeAmplitude,
        count: defaultShapePointCount(shapeCycles),
        quantize: { enabled: quantizeEnabled, bpm, division: quantizeDivision },
      })
      setShapePickerOpen(false)
    },
    [armedTrackId, shapeKind, shapeCycles, shapeAmplitude],
  )

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

  // AA.2 — toggle the "+ Mod" target-lane picker.
  const handleAddMod = useCallback(() => {
    setPickerMode((prev) => (prev === 'mod' ? null : 'mod'))
  }, [])

  // AA.2 — create a modulation lane on `targetLane.paramPath`, using the
  // currently-selected modBlendOp and the fixed MODULATION_LANE_COLOR.
  const handlePickModTarget = useCallback((targetLane: { paramPath: string }) => {
    if (!armedTrackId) return
    const autoState = useAutomationStore.getState()
    const laneId = autoState.addModulationLane(
      armedTrackId,
      targetLane.paramPath,
      MODULATION_LANE_COLOR,
      modBlendOp,
    )
    // AA.3-A: when the picker's source is 'operator', immediately switch the
    // just-created lane to a live LFO — setLaneSource seeds the default LFO
    // config (waveform sine, 1Hz) on first switch.
    if (modSource === 'operator') {
      autoState.setLaneSource(armedTrackId, laneId, 'operator')
    }
    setPickerMode(null)
  }, [armedTrackId, modBlendOp, modSource])

  // AA.2 — change an existing modulation lane's blendOp inline.
  const handleChangeModBlendOp = useCallback((laneId: string, blendOp: BlendOp) => {
    if (!armedTrackId) return
    useAutomationStore.getState().setLaneBlendOp(armedTrackId, laneId, blendOp)
  }, [armedTrackId])

  // AA.3-A — toggle an existing modulation lane's value source inline.
  const handleChangeLaneSource = useCallback((laneId: string, source: AutomationLaneSource) => {
    if (!armedTrackId) return
    useAutomationStore.getState().setLaneSource(armedTrackId, laneId, source)
  }, [armedTrackId])

  // AA.3-A — LFO param edits for an operator-sourced lane's generator panel.
  const handleChangeLfoRate = useCallback((laneId: string, rateHz: number) => {
    if (!armedTrackId || !Number.isFinite(rateHz)) return
    useAutomationStore.getState().updateLaneOperator(armedTrackId, laneId, {
      params: { rate_hz: rateHz },
    })
  }, [armedTrackId])

  const handleChangeLfoWaveform = useCallback((laneId: string, waveform: string) => {
    if (!armedTrackId) return
    useAutomationStore.getState().updateLaneOperator(armedTrackId, laneId, {
      params: { waveform },
    })
  }, [armedTrackId])

  const handleChangeLaneOperatorDepth = useCallback((laneId: string, depth: number) => {
    if (!armedTrackId || !Number.isFinite(depth)) return
    useAutomationStore.getState().updateLaneOperator(armedTrackId, laneId, { depth })
  }, [armedTrackId])

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

  const paramOptions = pickerMode === 'lane' || pickerMode === 'trigger' ? getAvailableParams() : []

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
      {/* A4 — overdub toggle: 'replace' (default, D2 punch-replace) overwrites a
          nearby point when recording; 'overdub' additively layers new points
          on top of the existing lane instead. Not gated on armedTrackId — it's
          a write-mode preference, consulted the next time a point is recorded. */}
      <button
        className={`auto-toolbar__btn${recordMode === 'overdub' ? ' auto-toolbar__btn--active' : ''}`}
        onClick={handleToggleRecordMode}
        title={recordMode === 'overdub'
          ? 'Overdub — new points layer on top of existing automation (click for Replace)'
          : 'Replace — recording overwrites nearby points (click for Overdub)'}
        data-testid="overdub-toggle-btn"
        aria-pressed={recordMode === 'overdub'}
      >
        Overdub
      </button>
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
      {/* AA.2 — modulation lane: a standalone drawn relative envelope that
          superimposes onto an EXISTING absolute lane sharing its paramPath
          (not an operator reference — see AutomationLane.kind doc comment).
          Disabled when the armed track has no eligible target lane yet. */}
      <button
        className="auto-toolbar__btn"
        onClick={handleAddMod}
        title={FF.F_0512_34_ARM_HINT && !armedTrackId
          ? 'Arm a track first — click the R button on a track header'
          : modTargetLanes.length === 0
            ? 'Add an automation lane first — modulation superimposes onto an existing lane'
            : 'Add a modulation lane superimposed on an existing lane\'s parameter'}
        disabled={!armedTrackId || modTargetLanes.length === 0}
        data-testid="add-mod-btn"
      >
        + Mod
      </button>
      {/* AA.4b — Flatten/Ramp: only meaningful with an active breakpoint
          selection (AA.4); the transform box (drag handles) is the primary
          gesture, these buttons are a discoverable one-click fallback. */}
      <button
        className="auto-toolbar__btn"
        onClick={handleFlatten}
        title="Flatten selected breakpoints to their average value"
        disabled={!selectedPoints || selectedPoints.indices.length === 0}
        data-testid="flatten-selection-btn"
      >
        Flatten
      </button>
      <button
        className="auto-toolbar__btn"
        onClick={handleRamp}
        title="Replace selection with a straight line from first to last selected point"
        disabled={!selectedPoints || selectedPoints.indices.length < 2}
        data-testid="ramp-selection-btn"
      >
        Ramp
      </button>
      {/* AA.3a — Insert Automation Shape: one-click bake sine/triangle/saw/
          square/ramp/random breakpoints into a lane. Standalone of AA.4 —
          doesn't require a selection (falls back to the lane's own span, or
          a default span, when none is active). */}
      <button
        className="auto-toolbar__btn"
        onClick={handleToggleShapePicker}
        title={FF.F_0512_34_ARM_HINT && !armedTrackId
          ? 'Arm a track first — click the R button on a track header'
          : 'Insert a generated shape (sine, triangle, saw, square, ramp, random) into a lane'}
        disabled={!armedTrackId}
        data-testid="insert-shape-btn"
      >
        Shape
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
      {(pickerMode === 'lane' || pickerMode === 'trigger') && armedTrackId && (
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
      {pickerMode === 'mod' && armedTrackId && (
        <div className="auto-toolbar__picker" data-testid="mod-picker">
          <div className="auto-toolbar__picker-title">Add Modulation Lane</div>
          <label title="How this modulation lane's evaluated value combines with the absolute lane it's layered onto.">
            Blend:{' '}
            <select
              data-testid="mod-blendop-select"
              value={modBlendOp}
              onChange={(e) => setModBlendOp(e.target.value as BlendOp)}
            >
              {BLEND_OPS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </label>
          {/* AA.3-A — value source for the lane about to be created: drawn
              breakpoints (paint it yourself, AA.2 default) or a live LFO
              (backend-evaluated every frame, spec docs/plans/2026-07-03-aa3-live-generators-spec.md). */}
          <label title="Drawn: paint breakpoints yourself. Operator (LFO): a live sine/tri/saw/square generator drives the value every frame.">
            Source:{' '}
            <select
              data-testid="mod-source-select"
              value={modSource}
              onChange={(e) => setModSource(e.target.value as AutomationLaneSource)}
            >
              <option value="drawn">Drawn</option>
              <option value="operator">Operator (LFO)</option>
            </select>
          </label>
          {modTargetLanes.length === 0 ? (
            <div className="auto-toolbar__picker-empty">
              No automation lanes to modulate — add a lane first
            </div>
          ) : (
            modTargetLanes.map((lane) => (
              <button
                key={lane.id}
                className="auto-toolbar__picker-item"
                onClick={() => handlePickModTarget(lane)}
                data-testid={`mod-target-${lane.id}`}
                title={`Superimpose a ${modBlendOp} modulation lane onto ${lane.paramPath}`}
              >
                <span style={{ color: lane.color }}>&#9679;</span> {lane.paramPath}
              </button>
            ))
          )}
        </div>
      )}
      {/* AA.2 — existing modulation lanes on the armed track, with an inline
          blendOp selector so it's editable after creation too, not just at
          add-time above. */}
      {armedModulationLanes.length > 0 && (
        <div className="auto-toolbar__mod-list" data-testid="mod-lane-list">
          {armedModulationLanes.map((lane) => (
            <label key={lane.id} className="auto-toolbar__mod-list-item" title={lane.paramPath}>
              <span style={{ color: MODULATION_LANE_COLOR }}>&#9679;</span> {lane.paramPath}
              {' '}
              <select
                data-testid={`mod-blendop-select-${lane.id}`}
                value={lane.blendOp ?? 'add'}
                onChange={(e) => handleChangeModBlendOp(lane.id, e.target.value as BlendOp)}
              >
                {BLEND_OPS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
              {' '}
              {/* AA.3-A — inline source toggle + LFO generator panel, shown
                  when this lane is operator-sourced. */}
              <select
                data-testid={`mod-source-select-${lane.id}`}
                value={lane.source ?? 'drawn'}
                onChange={(e) => handleChangeLaneSource(lane.id, e.target.value as AutomationLaneSource)}
              >
                <option value="drawn">Drawn</option>
                <option value="operator">LFO</option>
              </select>
              {lane.source === 'operator' && lane.operator && (
                <span className="auto-toolbar__lfo-panel" data-testid={`lfo-panel-${lane.id}`}>
                  {' '}
                  <select
                    data-testid={`lfo-waveform-select-${lane.id}`}
                    value={String(lane.operator.params.waveform ?? 'sine')}
                    onChange={(e) => handleChangeLfoWaveform(lane.id, e.target.value)}
                  >
                    <option value="sine">Sine</option>
                    <option value="triangle">Triangle</option>
                    <option value="saw">Saw</option>
                    <option value="square">Square</option>
                  </select>
                  {' '}
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    data-testid={`lfo-rate-input-${lane.id}`}
                    title="LFO rate (Hz)"
                    value={Number(lane.operator.params.rate_hz ?? 1)}
                    onChange={(e) => handleChangeLfoRate(lane.id, e.target.valueAsNumber)}
                  />
                  {' Hz '}
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    data-testid={`lfo-depth-input-${lane.id}`}
                    title="Depth — scales the LFO's influence [0,1]"
                    value={lane.operator.depth ?? 1}
                    onChange={(e) => handleChangeLaneOperatorDepth(lane.id, e.target.valueAsNumber)}
                  />
                  {' depth'}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
      {shapePickerOpen && armedTrackId && (
        <div className="auto-toolbar__picker" data-testid="shape-picker">
          <div className="auto-toolbar__picker-title">Insert Automation Shape</div>
          <label>
            Shape:{' '}
            <select
              data-testid="shape-kind-select"
              value={shapeKind}
              onChange={(e) => setShapeKind(e.target.value as AutomationShapeKind)}
            >
              {AUTOMATION_SHAPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <label title="Number of periods across the target range (ignored by Ramp Up/Down; used as the number of hold-steps for Random).">
            Cycles:{' '}
            <input
              data-testid="shape-cycles-input"
              type="number"
              min={0.25}
              step={0.25}
              value={shapeCycles}
              onChange={(e) => setShapeCycles(Number(e.target.value))}
            />
          </label>
          <label title="0 = flat line at the lane midpoint, 1 = full swing across the lane's value range.">
            Amplitude:{' '}
            <input
              data-testid="shape-amplitude-input"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={shapeAmplitude}
              onChange={(e) => setShapeAmplitude(Number(e.target.value))}
            />
          </label>
          {shapeTargetLanes.length === 0 ? (
            <div className="auto-toolbar__picker-empty">
              No automation lanes to insert into — add a lane first
            </div>
          ) : (
            shapeTargetLanes.map((lane) => (
              <button
                key={lane.id}
                className="auto-toolbar__picker-item"
                onClick={() => handleInsertShape(lane.id)}
                data-testid={`insert-shape-target-${lane.id}`}
                title={`Insert ${shapeKind} into ${lane.paramPath}`}
              >
                <span style={{ color: lane.color }}>&#9679;</span> {lane.paramPath}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
