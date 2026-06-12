/**
 * P5a.1 — Pure voice FSM for instrument playback.
 *
 * This module is PURE: no side effects, no mutable module state.
 * Every function is referentially transparent given the same inputs.
 *
 * State machine transitions (canonical table from phase-5a.md):
 *   T1: idle   + trigger, voices < cap → attack  (append new voice)
 *   T2: idle   + trigger, voices == cap → attack  (steal oldest, then T1)
 *   T3: attack + elapsed ≥ attack+decay frames → sustain
 *   T4: attack + release event → release  (ramps from CURRENT envelope value)
 *   T5: sustain + release event → release (ramps sustainLevel→0)
 *   T6: release + elapsed ≥ release frames → idle (voice removed)
 *   T7: attack/sustain/release + stolen → idle (immediate, no release tail)
 *   T8: attack/sustain/release + choke sibling → idle (atomic, same frameIndex)
 *   T9: attack/sustain/release + panic → idle (all voices, all instruments)
 *
 * Illegal transitions (dropped silently):
 *   idle→sustain, idle→release (release for unknown voice = no-op),
 *   release→attack, release→sustain (retrigger during release = NEW voice via T1/T2),
 *   sustain→attack.
 */

import type { ADSREnvelope } from '../../../shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single pad trigger or release event, replayed deterministically.
 *
 * CONTRACT:
 * - NO performance.now() timestamp in the replay-meaningful fields.
 * - NO embedded modRoutes/mappings snapshot (INSTRUMENTS.md §10 P1-2).
 * - `frameIndex` + `eventIndex` form the deterministic replay key.
 * - `kind: 'panic'` idles all voices across all instruments.
 * - `kind: 'choke'` uses `chokeGroup` to atomically idle group siblings.
 */
export interface TriggerEvent {
  /** Frame in the video timeline when this event occurred. Must be ≥ 0 integer. */
  frameIndex: number
  /** Monotonically increasing counter per capture buffer. Used for steal tie-breaking. */
  eventIndex: number
  /** MIDI note number (0–127). */
  note: number
  /** Velocity (0–127). */
  velocity: number
  /** Event semantics. */
  kind: 'trigger' | 'release' | 'choke' | 'panic'
  /** Which instrument this event targets. Used for choke group resolution. */
  instrumentId: string
  /** For choke events: the group number that should be silenced. */
  chokeGroup?: number
}

/**
 * A live (active) voice — never stored while idle.
 * idle = non-membership in the voices array.
 */
export interface Voice {
  /** Deterministic ID: `voice:{instrumentId}:{triggerFrame}:{eventIndex}` */
  voiceId: string
  instrumentId: string
  note: number
  velocity: number
  /** Frame at which this voice was triggered. Primary steal key. */
  triggerFrame: number
  /** Event index of the triggering event. Secondary steal key (total ordering). */
  eventIndex: number
  /** Current FSM state. idle is never stored. */
  phase: 'attack' | 'sustain' | 'release'
  /**
   * Playhead position into the sampler footage (in frames from start).
   * Computed by computeSamplerVoice — voiceFSM only tracks lifecycle.
   */
  footagePos: number
  /**
   * Frame at which this voice entered the release phase.
   * Used to compute elapsed release time.
   */
  releaseFrame: number
  /**
   * Envelope value (0–1) at the moment of release-phase entry.
   * Used by T4: release ramps from CURRENT value (not sustainLevel).
   */
  releaseStartValue: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a number to [min, max] and guard against NaN/Infinity.
 * Returns the clamped value, or fallback if input is non-finite.
 */
function clampFinite(v: number, min: number, max: number, fallback: number = min): number {
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

/**
 * Validate a TriggerEvent for replay safety.
 * Returns true if the event is well-formed; false if it should be dropped silently.
 */
function isValidEvent(e: TriggerEvent): boolean {
  return (
    Number.isInteger(e.frameIndex) &&
    e.frameIndex >= 0 &&
    Number.isInteger(e.eventIndex) &&
    e.eventIndex >= 0 &&
    Number.isFinite(e.note) &&
    e.note >= 0 &&
    e.note <= 127 &&
    Number.isFinite(e.velocity) &&
    e.velocity >= 0 &&
    e.velocity <= 127
  )
}

/**
 * Compute the ADSR envelope value (0–1) for a voice at a given frameIndex.
 *
 * Attack phase:   0 → 1 over `attack` frames.
 * Decay segment:  1 → sustainLevel over `decay` frames (within attack→sustain span).
 * Sustain phase:  constant sustainLevel.
 * Release phase:  releaseStartValue → 0 over `release` frames.
 *
 * The `decay` segment is evaluated INSIDE the attack→sustain transition — decay
 * is an envelope segment, NOT an FSM state (per phase-5a.md: "ADSRPhase.decay stays
 * untouched for PadRuntimeState").
 */
export function envelopeValue(voice: Voice, frameIndex: number, adsr: ADSREnvelope): number {
  const elapsed = frameIndex - voice.triggerFrame

  if (voice.phase === 'attack') {
    // Elapsed within attack frames: 0→1 ramp
    if (adsr.attack > 0 && elapsed < adsr.attack) {
      return clampFinite(elapsed / adsr.attack, 0, 1)
    }
    // Elapsed within decay frames: 1→sustainLevel ramp
    const decayElapsed = elapsed - adsr.attack
    if (adsr.decay > 0 && decayElapsed < adsr.decay) {
      return clampFinite(1 - (decayElapsed / adsr.decay) * (1 - adsr.sustain), 0, 1)
    }
    // Should have transitioned to sustain already — return sustain level
    return clampFinite(adsr.sustain, 0, 1)
  }

  if (voice.phase === 'sustain') {
    return clampFinite(adsr.sustain, 0, 1)
  }

  if (voice.phase === 'release') {
    // T4: ramps from releaseStartValue (current value at moment of release), not sustainLevel
    const releaseElapsed = frameIndex - voice.releaseFrame
    if (adsr.release > 0 && releaseElapsed < adsr.release) {
      return clampFinite(
        voice.releaseStartValue * (1 - releaseElapsed / adsr.release),
        0,
        1,
      )
    }
    return 0
  }

  return 0
}

// ---------------------------------------------------------------------------
// Choke group helpers
// ---------------------------------------------------------------------------

/**
 * Apply choke group logic to voices:
 * When a new trigger arrives with a chokeGroup, all existing voices in the same
 * group for the same instrument are atomically idled (T8). This happens at
 * the same frameIndex as the trigger event.
 *
 * Returns a new array with the group siblings removed.
 */
export function applyChoke(
  voices: Voice[],
  chokeGroup: number,
  instrumentId: string,
): Voice[] {
  // Atomic: all group siblings removed at the same frameIndex (T8 — immediate, no release tail)
  return voices.filter(
    (v) =>
      !(
        v.instrumentId === instrumentId &&
        // Voices are associated with a choke group via the triggering event — we
        // track group membership on the voice so choke works without re-scanning events.
        (v as VoiceInternal)._chokeGroup === chokeGroup
      ),
  )
}

// Internal extension of Voice with choke group tag (not exported)
interface VoiceInternal extends Voice {
  _chokeGroup: number | null
}

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

/**
 * Options for evaluateVoices.
 */
export interface EvaluateVoicesOpts {
  /** Maximum simultaneous voices. Steal oldest when at cap. Default: 4. */
  voiceCap: number
  /** ADSR envelope for the instrument. */
  adsr: ADSREnvelope
}

/**
 * Evaluate the voice FSM by replaying all events up to and including `frameIndex`.
 *
 * This is a PURE function — it returns a new array of active voices with no
 * mutable side effects. Calling it twice with the same arguments returns
 * deep-equal results.
 *
 * Algorithm:
 * 1. Filter events to those with frameIndex ≤ the query frameIndex (in order).
 * 2. Replay each event, applying FSM transitions.
 * 3. For each frame advance, check attack→sustain and release→idle transitions.
 * 4. Return the surviving voices sorted by ascending triggerFrame (newest = last = on top).
 *
 * Note: `idle` is non-membership — a voice in the array is always attack/sustain/release.
 */
export function evaluateVoices(
  events: TriggerEvent[],
  frameIndex: number,
  opts: EvaluateVoicesOpts,
): Voice[] {
  const { voiceCap, adsr } = opts
  const cap = Math.max(1, voiceCap)

  // Working array of internal voices (augmented with _chokeGroup)
  let voices: VoiceInternal[] = []

  // Process events in order, only those ≤ frameIndex
  const relevant = events
    .filter((e) => {
      if (!isValidEvent(e)) return false
      return e.frameIndex <= frameIndex
    })
    .sort((a, b) => a.frameIndex - b.frameIndex || a.eventIndex - b.eventIndex)

  for (const event of relevant) {
    const evFrame = event.frameIndex

    // --- Advance phase transitions up to evFrame BEFORE applying this event ---
    voices = advancePhases(voices, evFrame, adsr)

    if (event.kind === 'panic') {
      // T9: all voices of all instruments → idle (removed)
      voices = []
      continue
    }

    if (event.kind === 'choke') {
      // T8: atomic choke — remove all voices in the choke group for this instrument
      const group = event.chokeGroup
      if (group != null) {
        voices = voices.filter(
          (v) =>
            !(v.instrumentId === event.instrumentId && v._chokeGroup === group),
        )
      }
      continue
    }

    if (event.kind === 'trigger') {
      // Check if any voice for this (instrumentId, note) is in release — if so, it is
      // NOT resurrected; a new voice is allocated via T1/T2 (release→attack is ILLEGAL).

      if (voices.length >= cap) {
        // T2: steal victim = lowest triggerFrame, tie-break lowest eventIndex
        let victimIdx = 0
        for (let i = 1; i < voices.length; i++) {
          const v = voices[i]
          const best = voices[victimIdx]
          if (
            v.triggerFrame < best.triggerFrame ||
            (v.triggerFrame === best.triggerFrame && v.eventIndex < best.eventIndex)
          ) {
            victimIdx = i
          }
        }
        // T7 steal: immediate removal, no release tail
        voices.splice(victimIdx, 1)
      }

      // T1: append new voice in attack phase
      const voiceId = `voice:${event.instrumentId}:${evFrame}:${event.eventIndex}`
      const newVoice: VoiceInternal = {
        voiceId,
        instrumentId: event.instrumentId,
        note: event.note,
        velocity: event.velocity,
        triggerFrame: evFrame,
        eventIndex: event.eventIndex,
        phase: 'attack',
        footagePos: 0,
        releaseFrame: 0,
        releaseStartValue: 0,
        _chokeGroup: null, // populated below if choke info is available
      }
      // Note: chokeGroup is on TriggerEvent; carry it to voice for T8 choke resolution.
      // The event that triggers a pad may carry chokeGroup of the pad.
      if (event.chokeGroup != null) {
        newVoice._chokeGroup = event.chokeGroup
      }
      voices.push(newVoice)
      continue
    }

    if (event.kind === 'release') {
      // Find the voice(s) that match this instrument+note
      // A release for an unknown/idle voiceId = no-op (illegal transition dropped, T4/T5)
      let found = false
      for (const voice of voices) {
        if (voice.instrumentId === event.instrumentId && voice.note === event.note) {
          if (voice.phase === 'attack' || voice.phase === 'sustain') {
            // T4 (attack→release) or T5 (sustain→release)
            voice.releaseFrame = evFrame
            voice.releaseStartValue = envelopeValue(voice, evFrame, adsr)
            voice.phase = 'release'
            found = true
          }
          // If phase is 'release' already: release→attack/sustain = ILLEGAL, drop silently.
        }
      }
      // found===false means no matching active voice: no-op (idle→release, illegal)
      void found
      continue
    }
  }

  // Final phase advancement up to the query frameIndex
  voices = advancePhases(voices, frameIndex, adsr)

  // Sort by ascending triggerFrame (newest = last in array = composited on top)
  // Tie-break by ascending eventIndex (deterministic total order)
  voices.sort((a, b) => a.triggerFrame - b.triggerFrame || a.eventIndex - b.eventIndex)

  // Strip internal _chokeGroup from returned voices (exported type is Voice, not VoiceInternal)
  return voices.map(({ _chokeGroup: _cg, ...v }) => v as Voice)
}

// ---------------------------------------------------------------------------
// Phase advancement helper
// ---------------------------------------------------------------------------

/**
 * Advance phase transitions for all voices up to `upToFrame`.
 *
 * Mutates the voices array IN PLACE for performance (internal only; the outer
 * evaluateVoices function never exposes this intermediate state externally).
 */
function advancePhases(voices: VoiceInternal[], upToFrame: number, adsr: ADSREnvelope): VoiceInternal[] {
  const surviving: VoiceInternal[] = []

  for (const voice of voices) {
    if (voice.phase === 'attack') {
      const elapsed = upToFrame - voice.triggerFrame
      // T3: attack → sustain when elapsed ≥ attack + decay frames
      if (elapsed >= adsr.attack + adsr.decay) {
        voice.phase = 'sustain'
      }
      surviving.push(voice)
      continue
    }

    if (voice.phase === 'sustain') {
      // Stays sustain until a release event (T5). No automatic transition.
      surviving.push(voice)
      continue
    }

    if (voice.phase === 'release') {
      const releaseElapsed = upToFrame - voice.releaseFrame
      // T6: release → idle when elapsed ≥ release frames
      if (adsr.release <= 0 || releaseElapsed >= adsr.release) {
        // Voice removed — idle = non-membership
        continue
      }
      surviving.push(voice)
      continue
    }
  }

  return surviving
}
