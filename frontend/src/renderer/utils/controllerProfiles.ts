/**
 * H2 (2026-07-02 master-tuneup WS5) — built-in hardware controller profiles.
 * A profile is just a bulk CCBankBinding[] applied via
 * useMIDIStore.getState().applyControllerProfile(profile) — one action,
 * replaces the current ccBankBindings.
 */
import type { CCBankBinding } from '../../shared/bankTypes'
import { deriveControllerFingerprint } from '../../shared/controllerIdentity'

/**
 * Akai MIDImix — factory-default CC map, mapped onto the 4x8 hardware bank
 * (rows 0-2 = the 3 knob rows per channel strip, row 3 = the 8 channel
 * faders). Columns 0-7 = channel strips 1-8 left to right.
 *
 * SOURCE / VERIFICATION CAVEAT (H2 packet requires this be stated explicitly):
 * the official Akai MIDImix User Guide (fetched from
 * cdn.inmusicbrands.com/akai/attachments/MIDIMIX/MIDImix-UserGuide-v1.0.pdf,
 * 2026-07-02) confirms the physical control layout — 24 knobs arranged 3 per
 * channel, 8 channel faders + 1 master fader, 16 buttons (mute/solo/rec-arm/
 * bank L-R) that default to NOTE messages, not CC — but its text does NOT
 * publish the exact per-control factory CC numbers; the PDF's control
 * diagram is image-only. The CC table below is the map that is WIDELY AND
 * CONSISTENTLY replicated across independent open-source MIDI-mapping
 * projects for the MIDImix's out-of-box "MIDI" personality (channels 1-4 use
 * a contiguous CC block 16-31, channels 5-8 resume at CC46 rather than
 * continuing contiguously to 32-45) — but it was NOT independently
 * re-verified against Akai's firmware/hardware in this session (no unit
 * available to test against, and the official PDF doesn't publish the table).
 *
 * If a physical unit's factory CCs differ (firmware revision, or a unit
 * previously customized with the Akai MIDImix Editor), this profile will
 * bind the WRONG physical knob to each bank slot. Recovery is cheap and
 * already shipped: the existing CC-Learn flow (stores/midi.ts
 * `learnTarget: {type:'cc', ...}`) re-maps one CC at a time by ear — this
 * profile is a bulk-set convenience default, not a hard dependency of the
 * bank system, and every binding it produces can be individually overwritten
 * via setCCBankBinding exactly like a hand-learned one.
 *
 * Mute / Solo / Rec-Arm buttons: NOT included (default to NOTE, not CC; also
 * out of scope for the 4x8 knob/fader bank model). BANK L/R buttons: also
 * not wired here — noted for H7 (physical bank-switch), not H2.
 */
export const MIDIMIX_FACTORY_PROFILE: CCBankBinding[] = (() => {
  const knobRowCcs: [number, number[]][] = [
    [0, [16, 20, 24, 28, 46, 50, 54, 58]], // row 0 — top knob per channel
    [1, [17, 21, 25, 29, 47, 51, 55, 59]], // row 1 — middle knob per channel
    [2, [18, 22, 26, 30, 48, 52, 56, 60]], // row 2 — bottom knob per channel
  ]
  const faderRow: [number, number[]] = [3, [19, 23, 27, 31, 49, 53, 57, 61]] // row 3 — channel faders

  const bindings: CCBankBinding[] = []
  for (const [row, ccs] of [...knobRowCcs, faderRow]) {
    ccs.forEach((cc, col) => {
      bindings.push({ cc, slot: { row: row as 0 | 1 | 2 | 3, col } })
    })
  }
  return bindings
})()

/**
 * E18 — fingerprint of the Akai MIDImix as Web MIDI reports it (input.name =
 * "MIDI Mix", input.manufacturer = "AKAI"; deriveControllerFingerprint's
 * sanitization makes this stable across case/whitespace variance). This is
 * the single source of truth for "does a connected controller match the
 * built-in MIDImix factory profile" — used both for the auto-apply-on-connect
 * path (stores/midi.ts applyControllerIdentity) and the manual "Load factory
 * mapping" affordance (MIDIMapOverlay.tsx).
 */
export const MIDIMIX_FINGERPRINT = deriveControllerFingerprint('MIDI Mix', 'AKAI')

/**
 * Look up the built-in factory profile for a controller fingerprint, or null
 * if none is known. Single lookup point so future built-in profiles can be
 * added here without touching call sites.
 */
export function getFactoryProfileForFingerprint(fingerprint: string | null): CCBankBinding[] | null {
  if (fingerprint === MIDIMIX_FINGERPRINT) return MIDIMIX_FACTORY_PROFILE
  return null
}
