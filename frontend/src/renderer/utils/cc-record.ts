/**
 * H4 (2026-07-02 master-tuneup WS5) — THE CAPSTONE: record hardware CC moves as
 * automation, bank/context-aware.
 *
 * GROUND TRUTH before H4: a hardware CC only ever reached `ccValues`
 * (stores/midi.ts, rate-limited + echo-suppressed) and was folded into a
 * per-frame CLONED chain by applyCCModulations/applyBankModulations — a
 * TRANSIENT overlay, never a store write, never recorded. It bypassed the
 * latch/touch recorder entirely.
 *
 * LOCKED SEMANTIC (D2): hardware CC stays a transient overlay EXCEPT when
 * automation recording is armed — mode 'latch'|'touch' + an armed track +
 * transport PLAYING — in which case a CC move commits through the SAME record
 * path as a manual knob drag (ParamPanel.handleKnobChange for effect params,
 * recordTransformField for clip transforms). When NOT armed the behavior is
 * byte-identical to today: this module's `recordCCMove` returns before touching
 * any store.
 *
 * RATE-LIMIT: recording is driven off `ccValues` CHANGES (installCCRecordSubscriber
 * subscribes to the midi store), and `ccValues` is only ever written by
 * midi.ts's `_writeCCValue` — i.e. AFTER the B10 trailing-edge rate-limiter +
 * echo-suppression have run. So recording inherits the throttle for free: N raw
 * MIDI messages inside one 33ms window commit at most one `ccValues` write and
 * therefore at most one recorded point. There is no separate un-throttled path.
 *
 * FOCUS-FOLLOWS: a bank-bound CC resolves through the SAME snapshotMappingContext
 * + assignment lookup the render overlay uses (resolveBankSlotTargetForCC), so
 * the same physical knob records into a DIFFERENT lane as focus changes.
 */
import { useMIDIStore } from '../stores/midi'
import { useAutomationStore } from '../stores/automation'
import { useTimelineStore } from '../stores/timeline'
import type { SlotTarget } from '../../shared/bankTypes'
import { recordPointWithMode } from './automation-record'
import { recordTransformField } from './transform-record'
import { resolveBankSlotTargetForCC } from '../components/performance/applyBankModulations'
import { snapshotMappingContext, defaultAssignmentSourcesFor } from './mappingSnapshot'
import { TRANSFORM_FIELD_META, TRANSFORM_FIELDS, type TransformField } from './transformLanes'

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

// warn-once dedup for record targets we resolve but cannot commit (a bound
// macro/mask/instrument with no lane to write). Module-level so it survives
// across frames — matches applyBankModulations.ts's _warnedNoopTargets pattern.
const _warnedNoRecordTarget = new Set<string>()

/**
 * Resolve a physical CC to the SlotTarget its move should record into, using
 * the SAME precedence the live overlay uses:
 *   1. bank binding (FOCUS-relative, resolveBankSlotTargetForCC) — wins, exactly
 *      as applyBankModulations lets a bank binding beat a colliding legacy map;
 *   2. legacy direct effect-knob mapping (ccMappings → effectParam);
 *   3. H3 direct CC->SlotTarget mapping (ccSlotMappings — the widened learn
 *      surface's macro/transform/mask/instrument bindings).
 * Returns null when the CC drives nothing at the current focus.
 */
function resolveCCTarget(cc: number): SlotTarget | null {
  const midi = useMIDIStore.getState()
  const context = snapshotMappingContext()
  const sources = defaultAssignmentSourcesFor(context)

  const bankTarget = resolveBankSlotTargetForCC(
    cc,
    midi.ccBankBindings,
    midi.bankAssignments,
    context,
    sources,
    midi.activeBankIndex, // H7 — record into the SAME paged lane the live overlay resolves
  )
  if (bankTarget) return bankTarget

  const legacy = midi.ccMappings.find((m) => m.cc === cc)
  if (legacy) return { kind: 'effectParam', effectId: legacy.effectId, paramKey: legacy.paramKey }

  const slotMapping = midi.ccSlotMappings.find((m) => m.cc === cc)
  if (slotMapping) return slotMapping.target

  return null
}

/**
 * Record an effect-param CC move — mirrors ParamPanel.handleKnobChange's
 * recording block EXACTLY (paramPath = `${effectId}.${paramKey}`, lane looked up
 * on the armed track, point written via recordPoint/setPoints). The incoming
 * `value` is the CC's normalized 0-1 reading (byte2/127) — which is already the
 * lane's normalized domain — so no ParamDef scaling is needed here (the overlay
 * scales 0-1 → param range at render time). No lane on the armed track = no-op,
 * same as a manual knob drag whose param isn't automated.
 */
function recordEffectParam(armedTrackId: string, paramPath: string, value: number): void {
  const autoStore = useAutomationStore.getState()
  const lane = autoStore.getLanesForTrack(armedTrackId).find((l) => l.paramPath === paramPath)
  if (!lane) return
  const time = useTimelineStore.getState().playheadTime
  const newPoints = recordPointWithMode(lane.points, time, clamp01(value), autoStore.recordMode)
  autoStore.setPoints(armedTrackId, lane.id, newPoints)
}

/**
 * Record a macro CC move into the macro's value lane IF one exists on the armed
 * track (paramPath === macroId), else a single dev warning + no-op. Macros do
 * not currently own automation lanes anywhere in the app, so today this is
 * effectively always the warn-once no-op branch — kept faithful to the packet's
 * "record the macro's value lane if one exists (else no-op+warn)".
 */
function recordMacro(armedTrackId: string, macroId: string, value: number): void {
  const autoStore = useAutomationStore.getState()
  const lane = autoStore.getLanesForTrack(armedTrackId).find((l) => l.paramPath === macroId)
  if (!lane) {
    const key = `macro:${macroId}`
    if (!_warnedNoRecordTarget.has(key)) {
      _warnedNoRecordTarget.add(key)
      // eslint-disable-next-line no-console
      console.warn(
        `[cc-record] macro '${macroId}' has no automation lane on the armed track — CC move not recorded.`,
      )
    }
    return
  }
  const time = useTimelineStore.getState().playheadTime
  const newPoints = recordPointWithMode(lane.points, time, clamp01(value), autoStore.recordMode)
  autoStore.setPoints(armedTrackId, lane.id, newPoints)
}

/**
 * Commit ONE hardware CC move as an automation point — the H4 record path.
 *
 * Gate (all must hold, else byte-identical-to-today no-op):
 *   - transport is PLAYING (`isPlaying` — UI-local composite in App.tsx, passed in)
 *   - automation mode is 'latch' or 'touch'
 *   - a track is armed
 *   - `value` is finite
 *   - the CC resolves to a target whose recorder finds a lane
 *
 * `isPlaying` is a parameter (not read from a store) for the same reason
 * recordTransformField takes it: it is `hasAudio ? audioStore.isPlaying :
 * isTimerPlaying`, composite UI state with no single store to read.
 */
export function recordCCMove(cc: number, value: number, isPlaying: boolean): void {
  if (!isPlaying) return
  if (!Number.isFinite(value)) return

  const autoStore = useAutomationStore.getState()
  if (autoStore.mode !== 'latch' && autoStore.mode !== 'touch') return
  const armedTrackId = autoStore.armedTrackId
  if (!armedTrackId) return

  const target = resolveCCTarget(cc)
  if (!target) return

  switch (target.kind) {
    case 'effectParam':
      recordEffectParam(armedTrackId, `${target.effectId}.${target.paramKey}`, value)
      break
    case 'transform': {
      // recordTransformField takes a DISPLAY-range value and re-normalizes it
      // against the SAME TRANSFORM_FIELD_META; the CC reading is normalized
      // 0-1, so denormalize into display range first — the round-trip lands the
      // lane point back at exactly the 0-1 CC value. Also re-uses A3's full gate
      // (clip-on-armed-track + lane-exists + playing).
      if (!TRANSFORM_FIELDS.includes(target.field as TransformField)) return
      const field = target.field as TransformField
      const meta = TRANSFORM_FIELD_META[field]
      const displayValue = meta.displayMin + clamp01(value) * (meta.displayMax - meta.displayMin)
      recordTransformField(target.clipId, field, displayValue, isPlaying)
      break
    }
    case 'macro':
      recordMacro(armedTrackId, target.macroId, value)
      break
    case 'mask':
    case 'instrument': {
      // Out of H4 record scope (no lane addressing exists for these yet). Warn
      // once so a user who armed one of these knows why nothing recorded.
      const key = `${target.kind}`
      if (!_warnedNoRecordTarget.has(key)) {
        _warnedNoRecordTarget.add(key)
        // eslint-disable-next-line no-console
        console.warn(
          `[cc-record] '${target.kind}' slot targets are not yet recordable (H4 records effectParam/transform/macro) — CC ${cc} not recorded.`,
        )
      }
      break
    }
  }
}

/**
 * Install the ccValues → record subscriber. Fires on every midi-store change but
 * cheaply bails unless the `ccValues` OBJECT REFERENCE changed (only
 * _writeCCValue replaces it), then records each CC whose value actually moved.
 * Returns the unsubscribe fn. `getIsPlaying` is a live getter (read at fire
 * time) so the subscriber can be installed once at mount yet see current
 * transport state.
 */
export function installCCRecordSubscriber(getIsPlaying: () => boolean): () => void {
  return useMIDIStore.subscribe((state, prev) => {
    if (state.ccValues === prev.ccValues) return
    const isPlaying = getIsPlaying()
    const cur = state.ccValues
    const old = prev.ccValues
    for (const key in cur) {
      const cc = Number(key)
      if (old[cc] !== cur[cc]) recordCCMove(cc, cur[cc], isPlaying)
    }
  })
}

/** Test-only: reset the warn-once dedup set between test cases. */
export function _resetCCRecordWarnState(): void {
  _warnedNoRecordTarget.clear()
}
