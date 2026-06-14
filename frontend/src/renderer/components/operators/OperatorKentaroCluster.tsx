/**
 * OperatorKentaroCluster — editor for the 8-LFO Kentaro Cluster operator (P4.4).
 *
 * Direct-manipulation drag pattern (Research Gate / Rule 1.5):
 *   Pattern from the W3C Pointer Events drag idiom (javascript.info/pointer-events
 *   "Drag'n'Drop with pointer events") as used by react-moveable / Madrona Aalto:
 *   a `pointerdown` on the waveform overlay records `isDragging=true` in a ref,
 *   then `pointermove`/`pointerup` are attached at the DOCUMENT level so the drag
 *   keeps tracking even when the cursor leaves the overlay box. The vertical
 *   pointer position maps to that sub-LFO's depth (top = 1.0, bottom = 0.0).
 *   On `pointerup` the document listeners are removed and the isDragging ref is
 *   cleared on the NEXT tick so the synthesized click (mouseup→click) does not
 *   bubble up and deselect the operator card (feedback_drag-end-suppresses-click).
 *   All document listeners are also torn down in the effect cleanup so an
 *   unmount mid-drag never leaks a listener.
 *
 * Store conventions follow LFOEditor.tsx: this component owns NO new store
 * actions — it reads/writes via updateOperator / addMapping / updateMapping /
 * removeMapping only. The per-LFO config lives in `operator.parameters.lfos`
 * (a list of { shape, rate_hz, depth, phase }), matching the backend
 * evaluate_kentaro_cluster contract (kentaro_cluster.py). A mapping's
 * `sourceKey` of `lfo{i}` addresses a single sub-LFO; absent = master mix.
 *
 * Legacy safety: a kentaroCluster created before P4.4 has no `lfos` param (P4.1
 * default seeds only lfo_count/master_rate_hz/master_depth/bpm_sync). We
 * synthesize the rows from `lfo_count` on first render WITHOUT mutating the
 * store, so an old project loads without crashing.
 */
import { useEffect, useRef } from 'react'
import { useOperatorStore } from '../../stores/operators'
import type { Operator, LFOWaveform, OperatorMapping, EffectInfo } from '../../../shared/types'
import OperatorDepthArc from './OperatorDepthArc'

const WAVEFORMS: LFOWaveform[] = ['sine', 'saw', 'square', 'triangle', 'random', 'noise', 'sample_hold']

const MIN_LFO_COUNT = 2
const MAX_LFO_COUNT = 8
// Design-token color (DESIGN-SPEC v1.1): the acid "action" accent, resolved at
// render time via CSS custom property — no hardcoded hex.
const ARC_COLOR = 'var(--cx-action)'

interface LFOConfig {
  shape: string
  rate_hz: number
  depth: number
  phase: number
}

interface OperatorKentaroClusterProps {
  operator: Operator
  effectChain: { id: string; effectId: string }[]
  registry: EffectInfo[]
  /**
   * Live cluster signal values keyed by `${op.id}` (master) and
   * `${op.id}/lfo{i}` (sub-LFOs), as emitted by the backend. Optional — absent
   * → effective display falls back to the set depth (no animation).
   */
  operatorValues?: Record<string, number>
}

function clampDepth(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function defaultLfo(): LFOConfig {
  return { shape: 'sine', rate_hz: 1.0, depth: 1.0, phase: 0.0 }
}

/**
 * Derive the per-LFO config list from operator params. If `lfos` is missing or
 * malformed (legacy project), synthesize `lfo_count` default rows so the editor
 * renders without crashing and without mutating the store on render.
 */
function readLfos(operator: Operator): LFOConfig[] {
  const raw = operator.parameters.lfos
  const rawCount = Number(operator.parameters.lfo_count ?? MAX_LFO_COUNT)
  const count = Number.isFinite(rawCount)
    ? Math.max(MIN_LFO_COUNT, Math.min(MAX_LFO_COUNT, Math.round(rawCount)))
    : MAX_LFO_COUNT

  let list: LFOConfig[]
  if (Array.isArray(raw)) {
    list = raw.map((c) => {
      const cfg = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
      return {
        shape: typeof cfg.shape === 'string' ? cfg.shape : 'sine',
        rate_hz: Number.isFinite(Number(cfg.rate_hz)) ? Number(cfg.rate_hz) : 1.0,
        depth: clampDepth(Number(cfg.depth ?? 1.0)),
        phase: Number.isFinite(Number(cfg.phase)) ? Number(cfg.phase) : 0.0,
      }
    })
  } else {
    list = []
  }

  // Pad up to `count` with defaults; never exceed MAX.
  while (list.length < count) list.push(defaultLfo())
  return list.slice(0, Math.min(count, MAX_LFO_COUNT))
}

export default function OperatorKentaroCluster({
  operator,
  effectChain,
  registry,
  operatorValues,
}: OperatorKentaroClusterProps) {
  const updateOperator = useOperatorStore((s) => s.updateOperator)
  const addMapping = useOperatorStore((s) => s.addMapping)
  const updateMapping = useOperatorStore((s) => s.updateMapping)
  const removeMapping = useOperatorStore((s) => s.removeMapping)

  const params = operator.parameters
  const lfos = readLfos(operator)

  // --- drag state (document-level pointer listeners, cleaned on unmount) ------
  const isDraggingRef = useRef(false)
  // Holds the active teardown so the unmount effect can remove listeners even
  // if a drag is in progress when the component unmounts (no leak).
  const teardownRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      // Unmount: remove any document-level pointer listeners still attached.
      if (teardownRef.current) {
        teardownRef.current()
        teardownRef.current = null
      }
      isDraggingRef.current = false
    }
  }, [])

  const setParam = (key: string, value: number | string | boolean) => {
    updateOperator(operator.id, {
      parameters: { ...params, [key]: value },
    })
  }

  const writeLfos = (next: LFOConfig[]) => {
    updateOperator(operator.id, {
      parameters: { ...params, lfos: next as unknown as never, lfo_count: next.length },
    })
  }

  const setLfoField = (index: number, field: keyof LFOConfig, value: number | string) => {
    const next = lfos.map((l) => ({ ...l }))
    if (!next[index]) return
    if (field === 'shape') {
      next[index].shape = String(value)
    } else if (field === 'depth') {
      next[index].depth = clampDepth(Number(value))
    } else {
      next[index][field] = Number(value) as never
    }
    writeLfos(next)
  }

  // lfo_count input: clamp to [2,8], reject NaN/garbage (no-op, never NaN store).
  const setLfoCount = (raw: string) => {
    const parsed = parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return // reject 'e'/'' etc.
    const clamped = Math.max(MIN_LFO_COUNT, Math.min(MAX_LFO_COUNT, parsed))
    const next = lfos.map((l) => ({ ...l }))
    while (next.length < clamped) next.push(defaultLfo())
    writeLfos(next.slice(0, clamped))
  }

  const setMasterDepth = (value: number) => {
    setParam('master_depth', clampDepth(value))
  }

  // --- per-LFO target mapping -------------------------------------------------
  const mappingForLfo = (i: number): { mapping: OperatorMapping; index: number } | null => {
    const key = `lfo${i}`
    const idx = operator.mappings.findIndex((m) => m.sourceKey === key)
    return idx >= 0 ? { mapping: operator.mappings[idx], index: idx } : null
  }

  const addMappingForLfo = (i: number) => {
    if (effectChain.length === 0) return
    const firstEffect = effectChain[0]
    const info = registry.find((r) => r.id === firstEffect.effectId)
    const firstParam = info ? Object.keys(info.params)[0] ?? '' : ''
    const mapping: OperatorMapping = {
      targetEffectId: firstEffect.id,
      targetParamKey: firstParam,
      depth: 1.0,
      min: 0.0,
      max: 1.0,
      curve: 'linear',
      sourceKey: `lfo${i}`,
    }
    addMapping(operator.id, mapping)
  }

  const setMappingTarget = (mappingIndex: number, instanceId: string, paramKey: string) => {
    updateMapping(operator.id, mappingIndex, {
      targetEffectId: instanceId,
      targetParamKey: paramKey,
    })
  }

  // --- waveform-overlay depth sculpting (direct manipulation) -----------------
  // pointer Y within the overlay box → depth (top = 1.0, bottom = 0.0).
  const beginDepthDrag = (index: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    isDraggingRef.current = true

    const applyFromClientY = (clientY: number) => {
      const t = (clientY - rect.top) / Math.max(1, rect.height)
      const depth = clampDepth(1 - t) // top = 1.0
      setLfoField(index, 'depth', depth)
    }
    applyFromClientY(e.clientY)

    const onMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return
      applyFromClientY(ev.clientY)
    }
    const onUp = () => {
      teardown()
      // Clear isDragging on the NEXT tick so the synthesized click that follows
      // pointerup does not deselect the operator card.
      setTimeout(() => {
        isDraggingRef.current = false
      }, 0)
    }
    const teardown = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      teardownRef.current = null
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    teardownRef.current = teardown
  }

  const masterDepth = clampDepth(Number(params.master_depth ?? 1.0))
  const masterRate = Number(params.master_rate_hz ?? 1.0)
  const bpmSync = Boolean(params.bpm_sync ?? false)
  const masterEffective = operatorValues?.[operator.id] ?? masterDepth

  return (
    <div className="operator-card__body operator-kentaro">
      {/* --- shared master controls --- */}
      <div className="operator-kentaro__master">
        <div className="operator-card__param-row">
          <span className="operator-card__param-label">LFOs</span>
          <input
            className="operator-card__param-input"
            type="number"
            min={MIN_LFO_COUNT}
            max={MAX_LFO_COUNT}
            step={1}
            value={lfos.length}
            onChange={(e) => setLfoCount(e.target.value)}
            aria-label="lfo count"
          />
        </div>
        <div className="operator-card__param-row">
          <span className="operator-card__param-label">M.Rate</span>
          <input
            className="operator-card__param-input"
            type="number"
            min={0.01}
            max={50}
            step={0.1}
            value={Number.isFinite(masterRate) ? masterRate : 1}
            onChange={(e) => setParam('master_rate_hz', parseFloat(e.target.value) || 0.01)}
            aria-label="master rate"
          />
          <span className="operator-card__param-label">Hz</span>
        </div>
        <div className="operator-card__param-row">
          <span className="operator-card__param-label">M.Depth</span>
          <input
            type="range"
            className="operator-kentaro__master-depth"
            min={0}
            max={1}
            step={0.01}
            value={masterDepth}
            onChange={(e) => setMasterDepth(parseFloat(e.target.value))}
            aria-label="master depth"
          />
          <OperatorDepthArc depth={masterEffective} color={ARC_COLOR} radius={9} />
        </div>
        <div className="operator-card__param-row">
          <label className="operator-card__param-label">
            <input
              type="checkbox"
              checked={bpmSync}
              onChange={(e) => setParam('bpm_sync', e.target.checked)}
              aria-label="bpm sync"
            />
            BPM Sync
          </label>
        </div>
      </div>

      {/* --- per-LFO rows --- */}
      <div className="operator-kentaro__lfos">
        {lfos.map((lfo, i) => {
          const setDepth = lfo.depth
          const effective = operatorValues?.[`${operator.id}/lfo${i}`] ?? setDepth
          const map = mappingForLfo(i)
          return (
            <div key={i} className="operator-kentaro__lfo-row" data-lfo-index={i}>
              <div className="operator-kentaro__lfo-head">
                <span className="operator-card__param-label">{`L${i}`}</span>
                <select
                  className="operator-card__param-select"
                  value={lfo.shape}
                  onChange={(e) => setLfoField(i, 'shape', e.target.value)}
                  aria-label={`lfo ${i} shape`}
                >
                  {WAVEFORMS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
                <input
                  className="operator-card__param-input"
                  type="number"
                  min={0.01}
                  max={50}
                  step={0.1}
                  value={Number.isFinite(lfo.rate_hz) ? lfo.rate_hz : 1}
                  onChange={(e) => setLfoField(i, 'rate_hz', parseFloat(e.target.value) || 0.01)}
                  aria-label={`lfo ${i} rate`}
                  title="rate"
                />
                <input
                  className="operator-card__param-input"
                  type="number"
                  min={0}
                  max={6.28}
                  step={0.1}
                  value={Number.isFinite(lfo.phase) ? lfo.phase : 0}
                  onChange={(e) => setLfoField(i, 'phase', parseFloat(e.target.value) || 0)}
                  aria-label={`lfo ${i} phase`}
                  title="phase"
                />
              </div>

              {/* drag-on-waveform-overlay depth sculpting. Set depth = filled
                  height; effective (live) value shown as an animated arc. */}
              <div
                className="operator-kentaro__wave"
                data-lfo-overlay={i}
                onPointerDown={(e) => beginDepthDrag(i, e)}
                title={`Drag to sculpt depth (${setDepth.toFixed(2)})`}
                role="slider"
                aria-label={`lfo ${i} depth`}
                aria-valuenow={setDepth}
                aria-valuemin={0}
                aria-valuemax={1}
              >
                <div
                  className="operator-kentaro__wave-set"
                  style={{ height: `${clampDepth(setDepth) * 100}%` }}
                />
                <div
                  className="operator-kentaro__wave-effective"
                  style={{ height: `${clampDepth(effective) * 100}%` }}
                />
                <OperatorDepthArc depth={effective} color={ARC_COLOR} radius={7} />
              </div>

              {/* per-LFO target mapping (sourceKey = lfo{i}) */}
              <div className="operator-kentaro__lfo-map">
                {map ? (
                  <>
                    <select
                      className="operator-card__param-select"
                      value={`${map.mapping.targetEffectId}::${map.mapping.targetParamKey}`}
                      onChange={(e) => {
                        const [instId, pKey] = e.target.value.split('::')
                        setMappingTarget(map.index, instId, pKey)
                      }}
                      aria-label={`lfo ${i} target`}
                    >
                      {effectChain.map((fx) => {
                        const info = registry.find((r) => r.id === fx.effectId)
                        const paramKeys = info ? Object.keys(info.params) : []
                        return paramKeys.map((pk) => (
                          <option key={`${fx.id}::${pk}`} value={`${fx.id}::${pk}`}>
                            {(info?.name ?? fx.effectId)} · {pk}
                          </option>
                        ))
                      })}
                    </select>
                    <button
                      className="operator-card__remove-btn"
                      onClick={() => removeMapping(operator.id, map.index)}
                      aria-label={`remove lfo ${i} mapping`}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <button
                    className="operator-card__toggle-btn"
                    onClick={() => addMappingForLfo(i)}
                    disabled={effectChain.length === 0}
                    aria-label={`map lfo ${i}`}
                  >
                    + Map
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
