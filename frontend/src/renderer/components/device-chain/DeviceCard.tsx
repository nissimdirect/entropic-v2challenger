import { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import type { EffectInstance, EffectInfo, ParamDef, ParamValue, MatteNode, MatteRef, AutomationLane } from '../../../shared/types'
import { isFieldRef, makeFieldRef, clampGain, type FieldKind } from '../../../shared/field-param'
import Knob from '../common/Knob'
import ParamChoice from '../effects/ParamChoice'
import ParamToggle from '../effects/ParamToggle'
import { useAutomationStore } from '../../stores/automation'
import { useTimelineStore } from '../../stores/timeline'
import { useMIDIStore } from '../../stores/midi'
import { useOperatorStore } from '../../stores/operators'
import { useToastStore } from '../../stores/toast'
import { LIMITS } from '../../../shared/limits'
import { recordPointWithMode } from '../../utils/automation-record'
import { isParamAutomated } from '../../utils/automation-evaluate'
import { parseOperatorDrop, dragHasOperatorChannel } from '../effects/operator-drag'
import ABSwitch from './ABSwitch'

interface DeviceCardProps {
  effect: EffectInstance
  effectInfo: EffectInfo | undefined
  isSelected: boolean
  modulatedValues?: Record<string, number>
  onSelect: () => void
  onToggle: () => void
  onRemove: () => void
  onUpdateParam: (effectId: string, paramName: string, value: ParamValue) => void
  onSetMix: (effectId: string, mix: number) => void
  /**
   * P6.6: image/video media items selectable as a 2D field source for a
   * field-capable param. Empty/absent → no sources to assign (the Field…
   * control still appears for field-capable params but offers no options).
   */
  fieldSources?: { id: string; label: string; kind: 'image' | 'video' }[]
  /** MK.3: matte nodes assignable as this device's mask (from the active clip). */
  maskNodes?: MatteNode[]
  /** MK.13: clip id of the clip that owns the mask stack (used for mask_thumbnail IPC). */
  maskClipId?: string
  /** MK.3: assign (or clear, with null) this device's mask-routing ref. */
  onSetMaskRef?: (effectId: string, maskRef: MatteRef | null) => void
  /**
   * MK.3: whether this device's mask row may be shown/edited. False for
   * rack-PAD / branch-chain effects, whose mask assignment is NOT yet plumbed
   * (setEffectMaskRef only edits the track chain → would silently no-op). When
   * false the mask row is hidden so the control never lies. Defaults to true.
   */
  maskAssignable?: boolean
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function DeviceCard({
  effect,
  effectInfo,
  isSelected,
  modulatedValues,
  onSelect,
  onToggle,
  onRemove,
  onUpdateParam,
  onSetMix,
  fieldSources,
  maskNodes,
  maskClipId,
  onSetMaskRef,
  maskAssignable = true,
  onContextMenu,
}: DeviceCardProps) {
  // P6.6: remember the last scalar value per param so "Clear field" can restore
  // it (the field assignment replaces the scalar in the store, so we stash it
  // here in component state). Keyed by param name.
  const lastScalarRef = useRef<Record<string, number | string | boolean>>({})
  // MK.13: matte-presence thumbnail. Keyed by (nodeId, invert) so toggling
  // invert re-fetches with inverted CSS filter; nodeId change also re-fetches.
  // null = not yet fetched or procedural/error → keep text badge.
  const [matteThumbnail, setMatteThumbnail] = useState<string | null>(null)
  // Track the last fetch key to avoid stale-state races.
  const thumbnailKeyRef = useRef<string>('')

  useEffect(() => {
    const maskRef = effect.maskRef
    if (!maskRef || !maskClipId) {
      setMatteThumbnail(null)
      thumbnailKeyRef.current = ''
      return
    }

    const key = `${maskRef.nodeId}:${String(maskRef.invert)}:${maskClipId}`
    if (thumbnailKeyRef.current === key) return  // already fetched for this state
    thumbnailKeyRef.current = key

    // Find the node in maskNodes to include in the IPC payload.
    const node = (maskNodes ?? []).find((n) => n.id === maskRef.nodeId)
    if (!node) {
      setMatteThumbnail(null)
      return
    }

    if (
      typeof window === 'undefined' ||
      typeof window.entropic?.sendCommand !== 'function'
    ) {
      return
    }

    window.entropic
      .sendCommand({
        cmd: 'mask_thumbnail',
        clip_id: maskClipId,
        node: node as unknown as Record<string, unknown>,
        width: 64,
        height: 36,
      })
      .then((res) => {
        // Guard: only apply if the key hasn't changed (no stale-state overwrite).
        if (thumbnailKeyRef.current !== key) return
        if (res.ok && typeof res.thumbnail === 'string') {
          setMatteThumbnail(res.thumbnail)
        } else {
          // procedural node or error → keep text badge
          setMatteThumbnail(null)
        }
      })
      .catch(() => {
        if (thumbnailKeyRef.current === key) setMatteThumbnail(null)
      })
  }, [effect.maskRef, maskClipId, maskNodes])

  const handleKnobChange = useCallback(
    (key: string, def: ParamDef, value: number) => {
      onUpdateParam(effect.id, key, value)

      const autoStore = useAutomationStore.getState()
      const mode = autoStore.mode
      if (mode !== 'latch' && mode !== 'touch') return
      if (!autoStore.armedTrackId) return

      const paramPath = `${effect.id}.${key}`
      const lanes = autoStore.getLanesForTrack(autoStore.armedTrackId)
      const lane = lanes.find((l) => l.paramPath === paramPath)
      if (!lane) return

      const time = useTimelineStore.getState().playheadTime
      const pMin = def.min ?? 0
      const pMax = def.max ?? 1
      const normalized = pMax > pMin ? (value - pMin) / (pMax - pMin) : 0
      const newPoints = recordPointWithMode(lane.points, time, Math.max(0, Math.min(1, normalized)), autoStore.recordMode)
      autoStore.setPoints(autoStore.armedTrackId, lane.id, newPoints)
    },
    [effect.id, onUpdateParam],
  )

  // P6.6: assign a media source as a 2D field on a field-capable param.
  // The param value becomes {__field__: {kind, source_id, gain, invert}}.
  // We stash the current scalar first so "Clear field" can restore it.
  const handleAssignField = useCallback(
    (key: string, def: ParamDef, sourceId: string, kind: FieldKind) => {
      const cur = effect.parameters[key]
      if (!isFieldRef(cur)) {
        lastScalarRef.current[key] = (cur ?? def.default) as number | string | boolean
      }
      onUpdateParam(effect.id, key, makeFieldRef(kind, sourceId, 1, false))
    },
    [effect.id, effect.parameters, onUpdateParam],
  )

  // P6.6: change gain (clamped [-4,4]) or invert on an existing field value.
  const handleFieldGain = useCallback(
    (key: string, gain: number) => {
      const cur = effect.parameters[key]
      if (!isFieldRef(cur)) return
      const inner = cur.__field__
      onUpdateParam(effect.id, key, makeFieldRef(inner.kind, inner.source_id, clampGain(gain), inner.invert))
    },
    [effect.id, effect.parameters, onUpdateParam],
  )

  const handleFieldInvert = useCallback(
    (key: string) => {
      const cur = effect.parameters[key]
      if (!isFieldRef(cur)) return
      const inner = cur.__field__
      onUpdateParam(effect.id, key, makeFieldRef(inner.kind, inner.source_id, inner.gain, !inner.invert))
    },
    [effect.id, effect.parameters, onUpdateParam],
  )

  // P6.6: clear the field, restoring the last scalar (or the param default).
  const handleClearField = useCallback(
    (key: string, def: ParamDef) => {
      const restore = lastScalarRef.current[key] ?? def.default
      onUpdateParam(effect.id, key, restore)
    },
    [effect.id, onUpdateParam],
  )

  const handleMixChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSetMix(effect.id, parseFloat(e.target.value) / 100)
    },
    [effect.id, onSetMix],
  )

  // P4.6: accept an operator dragged from the browser op tab onto a param knob.
  // dropEffect 'copy' lights the target only when our drag channel carries an
  // operator (parseOperatorDrop rejects fx/composite/instruments/external drags).
  const handleParamDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!dragHasOperatorChannel(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Drop on a param knob → addOperator(type) + auto-mapping at depth 1.0 linear
  // targeting THIS effect/param. Gate 14 chaos: invalid drop = no-op (0 mutations,
  // 0 console.error); at the 64-operator cap = no-op + exactly ONE visible toast.
  const handleParamDrop = useCallback(
    (key: string, e: React.DragEvent<HTMLDivElement>) => {
      const type = parseOperatorDrop(e.dataTransfer)
      if (!type) return // not an operator drag → clean no-op (invalid target)
      e.preventDefault()
      e.stopPropagation()

      const store = useOperatorStore.getState()
      // Cap refusal: at MAX_OPERATORS, addOperator no-ops silently — we surface
      // ONE rate-limited toast (source field) so the refusal is never silent.
      if (store.operators.length >= LIMITS.MAX_OPERATORS) {
        useToastStore.getState().addToast({
          level: 'warning',
          message: `Operator limit reached (${LIMITS.MAX_OPERATORS}) — remove one to add more`,
          source: 'operator-cap',
        })
        return
      }

      const before = new Set(store.operators.map((o) => o.id))
      store.addOperator(type)
      const created = useOperatorStore.getState().operators.find((o) => !before.has(o.id))
      if (!created) return // defensive: add was refused → no mapping
      useOperatorStore.getState().addMapping(created.id, {
        targetEffectId: effect.id,
        targetParamKey: key,
        depth: 1.0,
        min: 0,
        max: 1,
        curve: 'linear',
      })
    },
    [effect.id],
  )

  // MK.3: assign / clear the device's mask node from the dropdown.
  const handleMaskNodeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nodeId = e.target.value
      if (!nodeId) {
        onSetMaskRef?.(effect.id, null) // "None" → clear routing
      } else {
        onSetMaskRef?.(effect.id, { nodeId, invert: effect.maskRef?.invert ?? false })
      }
    },
    [effect.id, effect.maskRef, onSetMaskRef],
  )

  // MK.3: flip the routing at the ref (keeps the assigned node).
  const handleMaskInvertToggle = useCallback(() => {
    if (!effect.maskRef) return
    onSetMaskRef?.(effect.id, { nodeId: effect.maskRef.nodeId, invert: !effect.maskRef.invert })
  }, [effect.id, effect.maskRef, onSetMaskRef])

  // AA.6 — read-only subscription to automation lanes (Ableton parity §25.1).
  // We only READ lane state here to drive the per-control automated-dot
  // indicator; lane CRUD stays owned entirely by stores/automation.ts.
  // Declared before the early return below to preserve hook ordering.
  const lanesByTrack = useAutomationStore((s) => s.lanes)
  const allLanes = useMemo<AutomationLane[]>(
    () => Object.values(lanesByTrack).flat(),
    [lanesByTrack],
  )

  if (!effectInfo) {
    return (
      <div className="device-card device-card--error" data-testid="device-card" onClick={onSelect} onContextMenu={onContextMenu}>
        <div className="device-card__header">
          <span className="device-card__name">{effect.effectId}</span>
        </div>
        <div className="device-card__body">Unknown effect</div>
      </div>
    )
  }

  const paramEntries = Object.entries(effectInfo.params)
  const numericParams = paramEntries.filter(([, def]) => def.type === 'float' || def.type === 'int')
  const otherParams = paramEntries.filter(([, def]) => def.type !== 'float' && def.type !== 'int')
  const mixPercent = Math.round(effect.mix * 100)
  // P6.6: which params accept a FieldRef (from the backend fieldParams list).
  const fieldParamSet = new Set(effectInfo.fieldParams ?? [])
  const sources = fieldSources ?? []

  return (
    <div
      className={`device-card${isSelected ? ' device-card--selected' : ''}${!effect.isEnabled ? ' device-card--disabled' : ''}`}
      data-testid="device-card"
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      {/* Header */}
      <div className="device-card__header">
        <button
          className={`device-card__toggle${effect.isEnabled ? '' : ' device-card__toggle--off'}`}
          data-testid="device-toggle"
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        >
          {effect.isEnabled ? 'ON' : 'OFF'}
        </button>
        <span className="device-card__name" data-testid="device-card-name">
          {effectInfo.name}
        </span>
        <ABSwitch
          effectId={effect.id}
          isActive={!!effect.abState}
          activeSlot={effect.abState?.active ?? 'a'}
        />
        <button
          className="device-card__remove"
          data-testid="device-remove"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="Remove"
        >
          ×
        </button>
      </div>

      {/* Params */}
      <div className="device-card__params" data-testid="device-params">
        {numericParams.map(([key, def]) => {
          const rawValue = effect.parameters[key] ?? def.default
          const isFieldCapable = fieldParamSet.has(key)
          const fieldVal = isFieldRef(rawValue) ? rawValue.__field__ : null

          // P6.6: a field-valued param renders a field badge + inline controls
          // instead of a knob (the value is an object, not a scalar).
          if (fieldVal) {
            return (
              <div
                key={key}
                className="device-card__param device-card__param--field"
                data-testid={`param-field-${effect.id}-${key}`}
              >
                <span className="device-card__param-label">{def.label}</span>
                <span className="device-card__field-badge" data-testid={`field-badge-${effect.id}-${key}`}>field</span>
                <input
                  className="device-card__field-gain"
                  data-testid={`field-gain-${effect.id}-${key}`}
                  type="range"
                  min={-4}
                  max={4}
                  step={0.1}
                  value={fieldVal.gain}
                  onChange={(e) => handleFieldGain(key, Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  title={`Field gain ×${fieldVal.gain.toFixed(2)}`}
                />
                <button
                  className={`device-card__field-invert${fieldVal.invert ? ' device-card__field-invert--on' : ''}`}
                  data-testid={`field-invert-${effect.id}-${key}`}
                  onClick={(e) => { e.stopPropagation(); handleFieldInvert(key) }}
                  title="Invert field"
                >
                  INV
                </button>
                <button
                  className="device-card__field-clear"
                  data-testid={`field-clear-${effect.id}-${key}`}
                  onClick={(e) => { e.stopPropagation(); handleClearField(key, def) }}
                  title="Clear field (restore value)"
                >
                  Clear field
                </button>
              </div>
            )
          }

          const value = rawValue
          const ghostValue = modulatedValues?.[key] ?? (value as number)
          const hasCCMapping = useMIDIStore.getState().ccMappings.some(
            (m) => m.effectId === effect.id && m.paramKey === key
          )
          // AA.6 — is this param currently under an active automation lane
          // (a lane with matching paramPath and >=1 recorded point)?
          const isAutomated = isParamAutomated(`${effect.id}.${key}`, allLanes)

          return (
            <div
              key={key}
              className="device-card__param"
              data-testid={`param-knob-${effect.id}-${key}`}
              onDragOver={handleParamDragOver}
              onDrop={(e) => handleParamDrop(key, e)}
            >
              <Knob
                value={value as number}
                min={def.min ?? 0}
                max={def.max ?? 1}
                default={def.default as number}
                label={def.label}
                type={def.type as 'float' | 'int'}
                unit={def.unit}
                curve={def.curve}
                description={def.description}
                ghostValue={ghostValue}
                onChange={(v) => handleKnobChange(key, def, v)}
              />
              {hasCCMapping && <span className="device-card__cc-badge">CC</span>}
              {isAutomated && (
                <span
                  className="device-card__automated-dot"
                  data-testid={`param-automated-dot-${effect.id}-${key}`}
                  title="Parameter is automated"
                />
              )}
              {isFieldCapable && (
                <select
                  className="device-card__field-assign"
                  data-testid={`field-assign-${effect.id}-${key}`}
                  value=""
                  onChange={(e) => {
                    const sid = e.target.value
                    if (!sid) return
                    const src = sources.find((s) => s.id === sid)
                    if (src) handleAssignField(key, def, src.id, src.kind)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title="Assign an image/video as a 2D field"
                >
                  <option value="">Field…</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
        {otherParams.map(([key, def]) => {
          const value = effect.parameters[key] ?? def.default
          if (def.type === 'choice') {
            return (
              <ParamChoice
                key={key}
                paramKey={key}
                def={def}
                value={value as string}
                onChange={(k, v) => onUpdateParam(effect.id, k, v)}
              />
            )
          }
          if (def.type === 'bool') {
            return (
              <ParamToggle
                key={key}
                paramKey={key}
                def={def}
                value={value as boolean}
                onChange={(k, v) => onUpdateParam(effect.id, k, v)}
              />
            )
          }
          return null
        })}
      </div>

      {/* Mix */}
      <div className="device-card__mix" data-testid="device-mix">
        <span className="device-card__mix-label">Mix</span>
        <input
          className="device-card__mix-slider"
          type="range"
          min={0}
          max={100}
          value={mixPercent}
          onChange={handleMixChange}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="device-card__mix-value">{mixPercent}%</span>
      </div>

      {/* MK.13: 64×36 matte-presence chip. Shown when this device has an active maskRef.
          Static mattes (rect/ellipse/polygon/bitmap) render a real grayscale thumbnail
          fetched via mask_thumbnail IPC. Procedural mattes and error cases fall back to
          the text badge ("MSK"/"INV"). Unmasked devices render nothing here. */}
      {effect.maskRef && (
        <div
          className="masking__matte-chip"
          data-testid="device-matte-chip"
          title={`Masked: node ${effect.maskRef.nodeId}${effect.maskRef.invert ? ' (inverted)' : ''}`}
          style={{ width: 64, height: 36 }}
        >
          {matteThumbnail ? (
            <img
              className="masking__matte-chip-img"
              src={`data:image/png;base64,${matteThumbnail}`}
              width={64}
              height={36}
              alt="matte thumbnail"
              style={effect.maskRef.invert ? { filter: 'invert(1)' } : undefined}
              data-testid="device-matte-chip-img"
            />
          ) : (
            <span className="masking__matte-chip-label">
              {effect.maskRef.invert ? 'INV' : 'MSK'}
            </span>
          )}
        </div>
      )}

      {/* MK.3: minimal mask-routing row. Shown when the clip has matte nodes to
          assign, OR a maskRef is already set (so it remains editable even if the
          source clip changed). Rich UI is MK.13's job. HIDDEN for rack-PAD /
          branch-chain effects (maskAssignable=false): setEffectMaskRef only edits
          the track chain, so showing the dropdown there would silently no-op. */}
      {maskAssignable && (((maskNodes?.length ?? 0) > 0) || effect.maskRef) && (
        <div className="device-card__mask" data-testid="device-mask">
          <span className="device-card__mask-label">Mask</span>
          <select
            className="device-card__mask-select"
            data-testid="device-mask-select"
            value={effect.maskRef?.nodeId ?? ''}
            onChange={handleMaskNodeChange}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">None</option>
            {(maskNodes ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.id} ({n.kind})
              </option>
            ))}
            {/* Keep a stale assigned node visible even if it left the clip's stack. */}
            {effect.maskRef && !(maskNodes ?? []).some((n) => n.id === effect.maskRef!.nodeId) && (
              <option value={effect.maskRef.nodeId}>{effect.maskRef.nodeId} (missing)</option>
            )}
          </select>
          <button
            className={`device-card__mask-invert${effect.maskRef?.invert ? ' device-card__mask-invert--on' : ''}`}
            data-testid="device-mask-invert"
            disabled={!effect.maskRef}
            onClick={(e) => { e.stopPropagation(); handleMaskInvertToggle() }}
            title="Invert mask routing"
          >
            INV
          </button>
        </div>
      )}
    </div>
  )
}
