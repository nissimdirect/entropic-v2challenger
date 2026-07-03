/**
 * H5 (2026-07-02 master plan WS5) — controller-identity persistence.
 *
 * PROBLEM: H2 persists cc->bankSlot LEARN bindings (`ccBankBindings`) PER
 * PROJECT, keyed by nothing device-stable — only the transient Web MIDI
 * `activeDeviceId`, which changes across sessions/ports. So reconnecting the
 * same physical controller means re-learning every knob.
 *
 * FIX: persist the LEARN at the APP level (its own localStorage namespace, NOT
 * the per-project file), keyed by a stable-enough controller FINGERPRINT
 * derived from the Web MIDI input's `name` + `manufacturer`. On device connect
 * (useMIDI onstatechange), if a saved binding-set exists for that fingerprint,
 * it is auto-loaded → a known controller is "already mapped", no re-learn.
 *
 * Bank ASSIGNMENTS (what a slot resolves to for a focus context) stay
 * per-project (H2, unchanged). Only the hardware CC->slot LEARN is identity-scoped.
 *
 * TRUST BOUNDARY: the localStorage payload is UNTRUSTED (user-editable, or
 * written by an older/buggy build). Every load path re-validates each binding
 * (cc 0-127, slot row/col in range via isValidCCBankBinding), caps the per-
 * controller binding count (MAX_CC_BANK_BINDINGS), and caps the number of
 * stored controllers (MAX_STORED_CONTROLLERS, evict-oldest). Malformed entries
 * are DROPPED, never thrown — mirroring loadMIDIMappings in the store.
 */
import type { CCBankBinding } from './bankTypes';
import { isValidCCBankBinding, MAX_CC_BANK_BINDINGS } from './bankTypes';

/** localStorage namespace — app-level, NOT inside a project file. */
export const CONTROLLER_BINDINGS_STORAGE_KEY = 'creatrix-controller-bindings';

/**
 * Max distinct controllers whose bindings we retain at once. Evict-oldest on
 * overflow (insertion order via object key order). Guards an unbounded store
 * from an adversarial / churny device list.
 */
export const MAX_STORED_CONTROLLERS = 32;

/** Persisted shape: fingerprint -> that controller's cc->slot bindings. */
export type ControllerBindingStore = Record<string, CCBankBinding[]>;

/**
 * Derive a stable fingerprint from a controller's name + manufacturer.
 *
 * Sanitization (deterministic, pure): lowercase, trim, collapse internal
 * whitespace to single spaces, strip characters outside [a-z0-9 ._-]. The two
 * fields are joined with a '::' separator so "AB"/"C" and "A"/"BC" don't
 * collide. Empty/undefined fields sanitize to '' (a controller reporting
 * neither name nor manufacturer yields the stable fingerprint '::').
 *
 * The SAME (name, manufacturer) pair always yields the SAME fingerprint — this
 * is the property the identity persistence relies on.
 *
 * KNOWN LIMITATION: sanitizeField maps any non-string / unreported field to
 * '' (see below), so a nameless controller and a manufacturer-less one that
 * both report nothing sanitizable (e.g. non-Latin labels the [a-z0-9 ._-]
 * allowlist strips to empty) all collide on the single fingerprint '::'.
 * Their saved bindings share one slot — last-learned wins, not a crash or
 * corruption risk, just a known coarse-grained identity for that edge case.
 */
export function deriveControllerFingerprint(
  name: string | null | undefined,
  manufacturer: string | null | undefined,
): string {
  return `${sanitizeField(name)}::${sanitizeField(manufacturer)}`;
}

function sanitizeField(x: string | null | undefined): string {
  if (typeof x !== 'string') return '';
  return x
    .toLowerCase()
    .replace(/[^a-z0-9 ._-]/g, '') // strip anything outside the allowlist
    .replace(/\s+/g, ' ') // collapse whitespace runs
    .trim();
}

/**
 * Validate + cap a raw binding array from an untrusted source. Drops malformed
 * entries; caps to MAX_CC_BANK_BINDINGS (keeps the FIRST valid N, mirroring the
 * slice cap in loadMIDIMappings). De-dupes by cc (first write wins) so a single
 * physical CC never maps to two slots.
 */
export function sanitizeBindings(raw: unknown): CCBankBinding[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: CCBankBinding[] = [];
  for (const entry of raw) {
    if (out.length >= MAX_CC_BANK_BINDINGS) break;
    if (!isValidCCBankBinding(entry)) continue;
    if (seen.has(entry.cc)) continue;
    seen.add(entry.cc);
    // Rebuild the object (don't trust the shape beyond the validated fields).
    out.push({ cc: entry.cc, slot: { row: entry.slot.row, col: entry.slot.col } });
  }
  return out;
}

/**
 * Read + validate the whole controller-binding store from localStorage.
 * Returns an empty object on any parse/shape error (best-effort, never throws).
 * Caps the number of controllers to MAX_STORED_CONTROLLERS (keeps the first N
 * in key order). Fingerprint keys must be non-empty strings.
 */
export function loadControllerBindingStore(): ControllerBindingStore {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CONTROLLER_BINDINGS_STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const out: ControllerBindingStore = {};
  let count = 0;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (count >= MAX_STORED_CONTROLLERS) break;
    if (typeof key !== 'string' || key.length === 0) continue;
    // Trust boundary: a crafted localStorage payload with a "__proto__" (or
    // "constructor"/"prototype") key would reparent `out` via the bracket
    // assignment below (`out[key] = ...` triggers Object.prototype's
    // __proto__ accessor on a plain-literal object) — reject those keys
    // outright rather than treating them as a controller fingerprint.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const bindings = sanitizeBindings(value);
    // Retain even empty binding arrays? No — an empty set carries no info and
    // would waste a controller slot. Skip fingerprints with no valid bindings.
    if (bindings.length === 0) continue;
    out[key] = bindings;
    count++;
  }
  return out;
}

/**
 * Return the validated saved bindings for a single fingerprint, or [] if the
 * fingerprint is unknown / has no valid bindings. This is the auto-load lookup.
 */
export function getBindingsForFingerprint(fingerprint: string): CCBankBinding[] {
  if (typeof fingerprint !== 'string' || fingerprint.length === 0) return [];
  const store = loadControllerBindingStore();
  return store[fingerprint] ?? [];
}

/**
 * Persist a fingerprint's bindings (validated + capped) into the app-level
 * store. An empty/invalid binding set REMOVES the fingerprint's entry (so
 * clearing all learns for a controller forgets it rather than storing junk).
 * Enforces MAX_STORED_CONTROLLERS with evict-oldest. Best-effort — never throws.
 */
export function saveControllerBindings(fingerprint: string, bindings: unknown): void {
  if (typeof fingerprint !== 'string' || fingerprint.length === 0) return;

  const store = loadControllerBindingStore();
  const clean = sanitizeBindings(bindings);

  if (clean.length === 0) {
    if (!(fingerprint in store)) return; // nothing to remove
    delete store[fingerprint];
  } else {
    // Evict-oldest if adding a NEW fingerprint would exceed the cap.
    if (!(fingerprint in store) && Object.keys(store).length >= MAX_STORED_CONTROLLERS) {
      const oldestKey = Object.keys(store)[0];
      delete store[oldestKey];
    }
    store[fingerprint] = clean;
  }

  try {
    localStorage.setItem(CONTROLLER_BINDINGS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best-effort (quota / disabled storage).
  }
}
