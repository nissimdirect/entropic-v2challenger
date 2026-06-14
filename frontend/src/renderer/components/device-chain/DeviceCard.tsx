import { useCallback, useState, useEffect, useRef } from 'react'
import type { EffectInstance, EffectInfo, ParamDef, MatteNode, MatteRef } from '../../../shared/types'
import Knob from '../common/Knob'
import ParamChoice from '../effects/ParamChoice'
import ParamToggle from '../effects/ParamToggle'
import { useAutomationStore } from '../../stores/automation'
import { useTimelineStore } from '../../stores/timeline'
import { useMIDIStore } from '../../stores/midi'
import { useOperatorStore } from '../../stores/operators'
import { useToastStore } from '../../stores/toast'
import { LIMITS } from '../../../shared/limits'
import { recordPoint } from '../../utils/automation-record'
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
  onUpdateParam: (effectId: string, paramName: string, value: number | string | boolean) => void
  onSetMix: (effectId: string, mix: number) => void
  /** MK.3: matte nodes assignable as this device's mask (from the active clip). */
  maskNodes?: MatteNode[]
  /** MK.13: clip id of the clip that owns the mask stack (used for mask_thumbnail IPC). */
  maskClipId?: string
  /** MK.3: assign (or clear, with null) this device's mask-routing ref. */
  onSetMaskRef?: (effectId: string, maskRef: MatteRef | null) => void
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
  maskNodes,
  maskClipId,
  onSetMaskRef,
  onContextMenu,
}: DeviceCardProps) {
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
      const newPoints = recordPoint(lane.points, time, Math.max(0, Math.min(1, normalized)))
      autoStore.setPoints(autoStore.armedTrackId, lane.id, newPoints)
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
          const value = effect.parameters[key] ?? def.default
          const ghostValue = modulatedValues?.[key] ?? (value as number)
          const hasCCMapping = useMIDIStore.getState().ccMappings.some(
            (m) => m.effectId === effect.id && m.paramKey === key
          )

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
          source clip changed). Rich UI is MK.13's job. */}
      {(((maskNodes?.length ?? 0) > 0) || effect.maskRef) && (
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
