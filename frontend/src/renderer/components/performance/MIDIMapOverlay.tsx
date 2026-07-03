/**
 * H-UI (2026-07-02 master-tuneup WS5) — Ableton-style visual hardware-mapping
 * overlay ("MIDI Map mode"). The VIEW/hand-edit layer over the H1–H5 engine.
 *
 * The engine (stores/midi.ts) already models every binding: `ccBankBindings`
 * (which physical CC drives which 4x8 bank slot) and `bankAssignments`
 * (what each slot controls, per focus context). Until now the only way to see
 * or change a mapping was right-click-learn one CC at a time plus a tiny
 * statusbar focus chip. This overlay makes the whole map VISIBLE and editable,
 * per [[reference_kentaro-suzuki-m4l]] ("visualization IS the interface"):
 *
 *   - Renders the MIDImix physical layout as a 4x8 grid (rows 0-3 knob/fader
 *     rows, cols 0-7 channel strips 1-8).
 *   - Each slot shows its bound CC (from ccBankBindings) and the target it
 *     resolves to for the CURRENTLY FOCUSED context (bankAssignments override,
 *     else the auto-default from deriveDefaultAssignment).
 *   - AUTO-DEFAULT vs USER-OVERRIDDEN slots are badged distinctly.
 *   - Click a slot -> click a param (the focus context's candidate targets) to
 *     (re)assign it — writes through the EXISTING setBankAssignment action; no
 *     new persistence/identity logic (that is H5, untouched here).
 *   - When a mapped hardware knob turns, its slot FLASHES (subscribes to the
 *     store's ccValues; purely visual, never a re-render storm — the flash is
 *     driven imperatively via a store subscription, not a render subscription).
 *
 * This component is READ-MOSTLY over the engine: the only store write it makes
 * is setBankAssignment (the "assign" action). It never touches ccBankBindings /
 * controller identity — those remain owned by MIDI-learn (H3) and H5.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ParamDef } from '../../../shared/types'
import type { BankAssignment, BankSlotAddress, SlotTarget } from '../../../shared/bankTypes'
import { BANK_ROWS, BANK_COLS, pagedContextKey } from '../../../shared/bankTypes'
import type { RackMacro } from '../instruments/types'
import { useMIDIStore } from '../../stores/midi'
import { useMIDIMapModeStore } from '../../stores/midiMapMode'
import { useTimelineStore } from '../../stores/timeline'
import { useEffectsStore } from '../../stores/effects'
import { useInstrumentsStore, resolveRackNode } from '../../stores/instruments'
import { useToastStore } from '../../stores/toast'
import { useMappingContext, type MappingContext } from '../../utils/focusContext'
import { deriveDefaultAssignment, type DefaultAssignmentSources } from '../../utils/deriveDefaultAssignment'
import { getFactoryProfileForFingerprint } from '../../utils/controllerProfiles'
import {
  enumerateCandidateTargets,
  slotTargetLabel,
  slotTargetsEqual,
  type CandidateTarget,
} from '../../utils/mapModeTargets'

const FLASH_MS = 450

/** Row labels for the MIDImix: 3 knob rows + the fader row. */
const ROW_LABELS = ['KNOB 1', 'KNOB 2', 'KNOB 3', 'FADER'] as const

function slotKey(row: number, col: number): string {
  return `${row}:${col}`
}

/** Gate wrapper: keeps the ccValues subscription (and body class) OFF unless the
 * overlay is actually open. All real hooks live in the inner component, which is
 * only mounted while mapMode is true. */
export default function MIDIMapOverlay() {
  const mapMode = useMIDIMapModeStore((s) => s.mapMode)
  if (!mapMode) return null
  return <MIDIMapOverlayInner />
}

function MIDIMapOverlayInner() {
  const setMapMode = useMIDIMapModeStore((s) => s.setMapMode)
  const selectedSlot = useMIDIMapModeStore((s) => s.selectedSlot)
  const setSelectedSlot = useMIDIMapModeStore((s) => s.setSelectedSlot)

  const ccBankBindings = useMIDIStore((s) => s.ccBankBindings)
  const bankAssignments = useMIDIStore((s) => s.bankAssignments)
  // E18 — manual "Load factory mapping" affordance: only offered when the
  // currently connected controller's fingerprint has a known built-in
  // factory profile (e.g. Akai MIDImix). null when no such profile exists
  // (unknown/unconnected controller), which hides the button below.
  const activeControllerFingerprint = useMIDIStore((s) => s.activeControllerFingerprint)
  const factoryProfile = useMemo(
    () => getFactoryProfileForFingerprint(activeControllerFingerprint),
    [activeControllerFingerprint],
  )
  // H7 (bank paging): the resolver keys bankAssignments by
  // pagedContextKey(contextKey, activeBankIndex) so the same physical CC can
  // target a different slot per bank page. The overlay must read/write the
  // SAME paged key or it shows/edits page-0 targets while the live resolver
  // (applyBankModulations) and cc-record.ts act on a different page entirely.
  const activeBankIndex = useMIDIStore((s) => s.activeBankIndex)

  const context = useMappingContext()
  const tracks = useTimelineStore((s) => s.tracks)
  const registry = useEffectsStore((s) => s.registry)
  const racks = useInstrumentsStore((s) => s.racks)

  // ── Live-data sources for the default/candidate derivation ────────────────
  const sources: DefaultAssignmentSources = useMemo(() => {
    if (context.kind === 'rack-pad' || context.kind === 'track') {
      const rack = racks[context.trackId]
      let rackMacros: RackMacro[] = []
      if (rack) {
        const node = context.kind === 'rack-pad' ? resolveRackNode(rack, context.branchPath) : rack
        rackMacros = node?.macros ?? []
      }
      return { rackMacros }
    }
    if (context.kind === 'effect') {
      const track = tracks.find((t) => t.id === context.trackId)
      const inst = track?.effectChain?.find((e) => e.id === context.effectId)
      const def = inst ? registry.find((r) => r.id === inst.effectId) : undefined
      const effectParamEntries: Array<[string, ParamDef]> = def ? Object.entries(def.params) : []
      return { effectParamEntries }
    }
    return {}
  }, [context, tracks, registry, racks])

  const defaultAssignment: BankAssignment = useMemo(
    () => deriveDefaultAssignment(context, sources),
    [context, sources],
  )
  const savedAssignment: BankAssignment | null =
    bankAssignments[pagedContextKey(context.contextKey, activeBankIndex)] ?? null

  // The grid actually in effect = saved override if present, else the default.
  const resolvedGrid: (SlotTarget | null)[][] = savedAssignment?.slots ?? defaultAssignment.slots

  const candidates: CandidateTarget[] = useMemo(
    () => enumerateCandidateTargets(context, sources),
    [context, sources],
  )

  // CC bound to each slot (reverse lookup of ccBankBindings), for display + flash.
  const ccBySlot = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of ccBankBindings) m.set(slotKey(b.slot.row, b.slot.col), b.cc)
    return m
  }, [ccBankBindings])

  // ── Flash-on-CC (imperative; no render subscription to ccValues) ──────────
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set())
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const flashSlot = (slot: BankSlotAddress) => {
      const key = slotKey(slot.row, slot.col)
      const existing = flashTimers.current.get(key)
      if (existing) clearTimeout(existing)
      setFlashing((prev) => {
        if (prev.has(key)) return prev
        const next = new Set(prev)
        next.add(key)
        return next
      })
      const timer = setTimeout(() => {
        flashTimers.current.delete(key)
        setFlashing((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }, FLASH_MS)
      flashTimers.current.set(key, timer)
    }

    let prevCC = useMIDIStore.getState().ccValues
    const unsub = useMIDIStore.subscribe((state) => {
      const nextCC = state.ccValues
      if (nextCC === prevCC) return
      const bindings = state.ccBankBindings
      for (const key of Object.keys(nextCC)) {
        const cc = Number(key)
        if (nextCC[cc] !== prevCC[cc]) {
          const b = bindings.find((bb) => bb.cc === cc)
          if (b) flashSlot(b.slot)
        }
      }
      prevCC = nextCC
    })

    const timers = flashTimers.current
    return () => {
      unsub()
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  // ── Body class so the rest of the app can style "map mode is active" ──────
  useEffect(() => {
    document.body.classList.add('midi-map-mode')
    return () => document.body.classList.remove('midi-map-mode')
  }, [])

  const canAssign = context.kind !== 'none' && candidates.length > 0

  const assign = (slot: BankSlotAddress, target: SlotTarget | null) => {
    // Build a full override grid from what's currently resolved, flipping one slot.
    const slots = resolvedGrid.map((r) => r.slice())
    slots[slot.row][slot.col] = target
    const assignment: BankAssignment = { contextKey: context.contextKey, slots }
    useMIDIStore.getState().setBankAssignment(pagedContextKey(context.contextKey, activeBankIndex), assignment)
    setSelectedSlot(null)
  }

  const contextLabel =
    context.kind === 'none' ? 'nothing focused' : `${context.kind} · ${context.contextKey}`

  // E18 — manual factory-mapping load. Explicit user action, so (unlike the
  // auto-apply-on-connect path in stores/midi.ts applyControllerIdentity)
  // this is ALLOWED to overwrite an existing ccBankBindings set — the toast
  // confirms what just happened so an accidental click is immediately
  // legible/recoverable via re-learn.
  const loadFactoryMapping = () => {
    if (!factoryProfile) return
    useMIDIStore.getState().applyControllerProfile(factoryProfile)
    useToastStore.getState().addToast({
      level: 'info',
      message: 'MIDImix factory mapping loaded (overwrote current bank map)',
      source: 'midi-controller-profile',
    })
  }

  return (
    <div
      className="midi-map-overlay"
      role="dialog"
      aria-label="MIDI Map mode"
      data-testid="midi-map-overlay"
    >
      <div className="midi-map-overlay__panel">
        <header className="midi-map-overlay__header">
          <span className="midi-map-overlay__title">MIDI MAP · MIDImix 4×8</span>
          <span
            className="midi-map-overlay__context"
            data-testid="midi-map-context"
            title="Bindings shown are for this focus context"
          >
            {contextLabel}
          </span>
          {factoryProfile && (
            <button
              className="midi-map-overlay__load-factory"
              data-testid="midi-map-load-factory"
              title="Overwrite the current bank map with the Akai MIDImix factory CC layout"
              onClick={loadFactoryMapping}
            >
              Load factory mapping
            </button>
          )}
          <button
            className="midi-map-overlay__close"
            data-testid="midi-map-close"
            onClick={() => setMapMode(false)}
          >
            Done
          </button>
        </header>

        {!canAssign && (
          <p className="midi-map-overlay__hint" data-testid="midi-map-hint">
            Focus a track, effect, or clip to assign its parameters to hardware slots.
          </p>
        )}

        <div
          className="midi-map-grid"
          data-testid="midi-map-grid"
          role="grid"
          style={{ gridTemplateColumns: `auto repeat(${BANK_COLS}, 1fr)` }}
        >
          {/* column header row */}
          <div className="midi-map-grid__corner" />
          {Array.from({ length: BANK_COLS }, (_, col) => (
            <div key={`col-${col}`} className="midi-map-grid__col-label">
              {col + 1}
            </div>
          ))}

          {Array.from({ length: BANK_ROWS }, (_, row) => (
            <MapRow
              key={`row-${row}`}
              row={row}
              resolvedGrid={resolvedGrid}
              defaultGrid={defaultAssignment.slots}
              savedAssignment={savedAssignment}
              ccBySlot={ccBySlot}
              flashing={flashing}
              selectedSlot={selectedSlot}
              canAssign={canAssign}
              onPick={(slot) => setSelectedSlot(slot)}
            />
          ))}
        </div>

        {selectedSlot && (
          <ParamPicker
            slot={selectedSlot}
            candidates={candidates}
            currentTarget={resolvedGrid[selectedSlot.row]?.[selectedSlot.col] ?? null}
            onAssign={(target) => assign(selectedSlot, target)}
            onClear={() => assign(selectedSlot, null)}
            onCancel={() => setSelectedSlot(null)}
          />
        )}
      </div>
    </div>
  )
}

interface MapRowProps {
  row: number
  resolvedGrid: (SlotTarget | null)[][]
  defaultGrid: (SlotTarget | null)[][]
  savedAssignment: BankAssignment | null
  ccBySlot: Map<string, number>
  flashing: Set<string>
  selectedSlot: BankSlotAddress | null
  canAssign: boolean
  onPick: (slot: BankSlotAddress) => void
}

function MapRow({
  row,
  resolvedGrid,
  defaultGrid,
  savedAssignment,
  ccBySlot,
  flashing,
  selectedSlot,
  canAssign,
  onPick,
}: MapRowProps) {
  return (
    <>
      <div className="midi-map-grid__row-label">{ROW_LABELS[row]}</div>
      {Array.from({ length: BANK_COLS }, (_, col) => {
        const key = slotKey(row, col)
        const target = resolvedGrid[row]?.[col] ?? null
        const isOverridden =
          savedAssignment !== null &&
          !slotTargetsEqual(savedAssignment.slots[row]?.[col] ?? null, defaultGrid[row]?.[col] ?? null)
        const state = target === null ? 'empty' : isOverridden ? 'overridden' : 'default'
        const cc = ccBySlot.get(key)
        const isFlashing = flashing.has(key)
        const isSelected = selectedSlot?.row === row && selectedSlot?.col === col

        return (
          <button
            key={key}
            type="button"
            className="midi-map-slot"
            data-testid={`map-slot-${row}-${col}`}
            data-slot-state={state}
            data-cc={cc === undefined ? '' : String(cc)}
            data-flashing={isFlashing ? 'true' : 'false'}
            data-selected={isSelected ? 'true' : 'false'}
            disabled={!canAssign}
            aria-pressed={isSelected}
            onClick={() => onPick({ row: row as 0 | 1 | 2 | 3, col })}
          >
            <span className="midi-map-slot__cc">{cc === undefined ? '—' : `CC${cc}`}</span>
            <span className="midi-map-slot__target">
              {target ? slotTargetLabel(target) : 'unassigned'}
            </span>
            {state !== 'empty' && (
              <span className="midi-map-slot__badge" data-slot-badge={state}>
                {state === 'overridden' ? 'SET' : 'auto'}
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

interface ParamPickerProps {
  slot: BankSlotAddress
  candidates: CandidateTarget[]
  currentTarget: SlotTarget | null
  onAssign: (target: SlotTarget) => void
  onClear: () => void
  onCancel: () => void
}

function ParamPicker({ slot, candidates, currentTarget, onAssign, onClear, onCancel }: ParamPickerProps) {
  return (
    <div className="midi-map-picker" data-testid="midi-map-picker">
      <div className="midi-map-picker__head">
        <span className="midi-map-picker__title">
          Assign {ROW_LABELS[slot.row]} · ch {slot.col + 1}
        </span>
        <button className="midi-map-picker__cancel" data-testid="midi-map-picker-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="midi-map-picker__list">
        {candidates.map((c) => {
          const isCurrent = slotTargetsEqual(c.target, currentTarget)
          return (
            <button
              key={slotTargetLabel(c.target) + ':' + JSON.stringify(c.target)}
              className="midi-map-picker__item"
              data-testid={`midi-map-picker-item-${slotTargetLabel(c.target)}`}
              data-current={isCurrent ? 'true' : 'false'}
              onClick={() => onAssign(c.target)}
            >
              {c.label}
            </button>
          )
        })}
        {currentTarget !== null && (
          <button
            className="midi-map-picker__clear"
            data-testid="midi-map-picker-clear"
            onClick={onClear}
          >
            Clear slot
          </button>
        )}
      </div>
    </div>
  )
}
