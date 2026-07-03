/**
 * H5 — controller-identity persistence tests (master plan WS5).
 *
 * Covers: fingerprint derivation stability, save->reload round-trip for a
 * fingerprint, auto-apply on connecting a known controller, unknown fingerprint
 * yields empty, and rejection of malformed persisted bindings (trust boundary).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  deriveControllerFingerprint,
  saveControllerBindings,
  getBindingsForFingerprint,
  loadControllerBindingStore,
  sanitizeBindings,
  CONTROLLER_BINDINGS_STORAGE_KEY,
  MAX_STORED_CONTROLLERS,
} from '../../shared/controllerIdentity';
import { MAX_CC_BANK_BINDINGS } from '../../shared/bankTypes';
import type { CCBankBinding } from '../../shared/bankTypes';
import { useMIDIStore } from '../../renderer/stores/midi';

// Happy-dom may not ship a working localStorage — mock it (mirrors layout.test.ts).
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

const bindingsA: CCBankBinding[] = [
  { cc: 1, slot: { row: 0, col: 0 } },
  { cc: 74, slot: { row: 2, col: 5 } },
];

beforeEach(() => {
  localStorageMock.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  useMIDIStore.getState().resetMIDI();
});

describe('deriveControllerFingerprint', () => {
  it('is stable for the same name+manufacturer', () => {
    const a = deriveControllerFingerprint('Launch Control XL', 'Novation');
    const b = deriveControllerFingerprint('Launch Control XL', 'Novation');
    expect(a).toBe(b);
  });

  it('normalizes case/whitespace/punctuation so equivalent labels collide', () => {
    const a = deriveControllerFingerprint('Launch  Control XL', 'Novation');
    const b = deriveControllerFingerprint('  launch control xl ', 'NOVATION');
    expect(a).toBe(b);
  });

  it('distinguishes different controllers', () => {
    const a = deriveControllerFingerprint('Launch Control XL', 'Novation');
    const b = deriveControllerFingerprint('MIDI Mix', 'AKAI');
    expect(a).not.toBe(b);
  });

  it('does not collide when name/manufacturer boundary shifts', () => {
    // 'AB' + 'C' must not equal 'A' + 'BC' (the '::' separator guards this).
    expect(deriveControllerFingerprint('ab', 'c')).not.toBe(
      deriveControllerFingerprint('a', 'bc'),
    );
  });

  it('handles null/undefined fields to a stable value', () => {
    expect(deriveControllerFingerprint(null, undefined)).toBe('::');
    expect(deriveControllerFingerprint(undefined, null)).toBe(
      deriveControllerFingerprint(null, undefined),
    );
  });
});

describe('save -> reload round-trip', () => {
  it('restores bindings for a fingerprint', () => {
    const fp = deriveControllerFingerprint('Launch Control XL', 'Novation');
    saveControllerBindings(fp, bindingsA);
    expect(getBindingsForFingerprint(fp)).toEqual(bindingsA);
  });

  it('reloads across a fresh store read (persisted, not in-memory)', () => {
    const fp = deriveControllerFingerprint('MIDI Mix', 'AKAI');
    saveControllerBindings(fp, bindingsA);
    const store = loadControllerBindingStore();
    expect(store[fp]).toEqual(bindingsA);
  });

  it('clearing all bindings forgets the controller', () => {
    const fp = deriveControllerFingerprint('MIDI Mix', 'AKAI');
    saveControllerBindings(fp, bindingsA);
    saveControllerBindings(fp, []); // empty -> remove
    expect(getBindingsForFingerprint(fp)).toEqual([]);
    expect(fp in loadControllerBindingStore()).toBe(false);
  });

  it('caps stored controllers at MAX_STORED_CONTROLLERS (evict-oldest)', () => {
    for (let i = 0; i < MAX_STORED_CONTROLLERS + 5; i++) {
      saveControllerBindings(`fp-${i}::m`, [{ cc: 1, slot: { row: 0, col: 0 } }]);
    }
    const keys = Object.keys(loadControllerBindingStore());
    expect(keys.length).toBeLessThanOrEqual(MAX_STORED_CONTROLLERS);
    // Oldest evicted, newest retained.
    expect(keys).not.toContain('fp-0::m');
    expect(keys).toContain(`fp-${MAX_STORED_CONTROLLERS + 4}::m`);
  });
});

describe('unknown fingerprint', () => {
  it('returns empty for a fingerprint with no saved bindings', () => {
    expect(getBindingsForFingerprint('nope::nobody')).toEqual([]);
  });

  it('returns empty for an empty/invalid fingerprint string', () => {
    expect(getBindingsForFingerprint('')).toEqual([]);
  });
});

describe('malformed persisted data (trust boundary)', () => {
  it('rejects malformed bindings via sanitizeBindings', () => {
    const raw = [
      { cc: 1, slot: { row: 0, col: 0 } }, // valid
      { cc: 200, slot: { row: 0, col: 0 } }, // cc out of range
      { cc: 5, slot: { row: 9, col: 0 } }, // row out of range
      { cc: 6, slot: { row: 0, col: 99 } }, // col out of range
      { cc: 3.5, slot: { row: 0, col: 0 } }, // non-integer cc
      { cc: 'x', slot: { row: 0, col: 0 } }, // wrong type
      null,
      42,
      { cc: 1, slot: { row: 1, col: 1 } }, // duplicate cc (first wins)
    ];
    const clean = sanitizeBindings(raw);
    expect(clean).toEqual([{ cc: 1, slot: { row: 0, col: 0 } }]);
  });

  it('drops malformed entries when reading a stored controller', () => {
    const fp = 'ctrl::vendor';
    localStorage.setItem(
      CONTROLLER_BINDINGS_STORAGE_KEY,
      JSON.stringify({ [fp]: [{ cc: 1, slot: { row: 0, col: 0 } }, { cc: 999, slot: { row: 0, col: 0 } }] }),
    );
    expect(getBindingsForFingerprint(fp)).toEqual([{ cc: 1, slot: { row: 0, col: 0 } }]);
  });

  it('returns {} for non-JSON / non-object payloads', () => {
    localStorage.setItem(CONTROLLER_BINDINGS_STORAGE_KEY, 'not-json{');
    expect(loadControllerBindingStore()).toEqual({});
    localStorage.setItem(CONTROLLER_BINDINGS_STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(loadControllerBindingStore()).toEqual({});
  });

  it('rejects a __proto__/constructor/prototype key rather than reparenting the store (redteam-confirmed)', () => {
    const payload = {
      __proto__: { polluted: true },
      constructor: [{ cc: 1, slot: { row: 0, col: 0 } }],
      prototype: [{ cc: 1, slot: { row: 0, col: 0 } }],
      'legit::vendor': [{ cc: 1, slot: { row: 0, col: 0 } }],
    };
    // JSON.stringify/parse round-trip mirrors how this payload actually
    // arrives (localStorage stores strings) — a literal "__proto__" key in
    // the JSON source becomes a normal own property under JSON.parse.
    localStorage.setItem(CONTROLLER_BINDINGS_STORAGE_KEY, JSON.stringify(payload));

    const store = loadControllerBindingStore();
    expect(Object.keys(store)).toEqual(['legit::vendor']);
    expect(Object.getPrototypeOf(store)).toBe(Object.prototype); // not reparented
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // global Object.prototype untouched
  });

  it('caps a single controller binding array at MAX_CC_BANK_BINDINGS', () => {
    const many = Array.from({ length: MAX_CC_BANK_BINDINGS + 10 }, (_, i) => ({
      cc: i % 128,
      slot: { row: 0, col: 0 },
    }));
    // De-dupe by cc caps the distinct count anyway; force distinct ccs.
    const distinct = Array.from({ length: MAX_CC_BANK_BINDINGS + 10 }, (_, i) => ({
      cc: i, // 0..MAX+9 (all <128 since MAX is 64)
      slot: { row: 0, col: 0 },
    }));
    expect(sanitizeBindings(many).length).toBeLessThanOrEqual(MAX_CC_BANK_BINDINGS);
    expect(sanitizeBindings(distinct).length).toBe(MAX_CC_BANK_BINDINGS);
  });
});

describe('store integration: applyControllerIdentity', () => {
  it('auto-applies saved bindings when a known controller connects', () => {
    const fp = deriveControllerFingerprint('Launch Control XL', 'Novation');
    saveControllerBindings(fp, bindingsA);

    const midi = useMIDIStore.getState();
    expect(midi.ccBankBindings).toEqual([]); // fresh store

    midi.applyControllerIdentity({ name: 'Launch Control XL', manufacturer: 'Novation' });

    const after = useMIDIStore.getState();
    expect(after.activeControllerFingerprint).toBe(fp);
    // Order-independent: applyControllerProfile de-dupes via Map.
    expect(after.ccBankBindings).toHaveLength(bindingsA.length);
    expect(after.ccBankBindings).toEqual(expect.arrayContaining(bindingsA));
  });

  it('leaves bindings untouched for an unknown controller', () => {
    const midi = useMIDIStore.getState();
    midi.setCCBankBinding(10, { row: 1, col: 1 });
    const before = useMIDIStore.getState().ccBankBindings;

    useMIDIStore.getState().applyControllerIdentity({ name: 'Ghost Deck', manufacturer: 'Nobody' });

    const after = useMIDIStore.getState();
    expect(after.activeControllerFingerprint).toBe(
      deriveControllerFingerprint('Ghost Deck', 'Nobody'),
    );
    expect(after.ccBankBindings).toEqual(before); // not wiped
  });

  // NOTE: these two generic-identity-persistence tests intentionally use a
  // NON-MIDImix fixture ('Generic Pad'/'Generic Co') rather than 'MIDI
  // Mix'/'AKAI'. E18 wires an auto-apply-the-built-in-factory-profile
  // fallback for a MIDImix fingerprint with zero saved bindings (see the
  // dedicated 'E18 — factory profile auto-apply' describe block below), which
  // would otherwise make these two tests' "starts empty, only cc20 present"
  // assertions collide with that new behavior. The guard logic under test
  // here (persist-under-fingerprint, don't-blind-replace-an-unpersisted-learn)
  // is identical for any controller identity, so a non-colliding fixture name
  // preserves 100% of the original intent and assertions.
  it('persists a learn under the active fingerprint (reconnect = already mapped)', () => {
    const midi = useMIDIStore.getState();
    // Connect an (unknown) controller -> establishes the active identity.
    midi.applyControllerIdentity({ name: 'Generic Pad', manufacturer: 'Generic Co' });
    // Learn a binding.
    useMIDIStore.getState().setCCBankBinding(20, { row: 3, col: 2 });

    const fp = deriveControllerFingerprint('Generic Pad', 'Generic Co');
    expect(getBindingsForFingerprint(fp)).toEqual([{ cc: 20, slot: { row: 3, col: 2 } }]);

    // Simulate a new session: reset in-memory store, reconnect same controller.
    useMIDIStore.getState().resetMIDI();
    expect(useMIDIStore.getState().ccBankBindings).toEqual([]);
    useMIDIStore.getState().applyControllerIdentity({ name: 'Generic Pad', manufacturer: 'Generic Co' });
    expect(useMIDIStore.getState().ccBankBindings).toEqual([{ cc: 20, slot: { row: 3, col: 2 } }]);
  });

  it('does not blind-replace a fresh unpersisted learn made after project load (redteam-confirmed data-loss regression)', () => {
    const midi = useMIDIStore.getState();
    // Session 1: connect, learn cc20 -> persists under the fingerprint.
    midi.applyControllerIdentity({ name: 'Generic Pad', manufacturer: 'Generic Co' });
    useMIDIStore.getState().setCCBankBinding(20, { row: 3, col: 2 });
    const fp = deriveControllerFingerprint('Generic Pad', 'Generic Co');
    expect(getBindingsForFingerprint(fp)).toEqual([{ cc: 20, slot: { row: 3, col: 2 } }]);

    // Project open/new: resetMIDI() clears activeControllerFingerprint to null
    // WITHOUT re-deriving it (activeDeviceId is untouched, so nothing in
    // useMIDI's subscribe fires) -- the controller stays physically connected
    // throughout.
    useMIDIStore.getState().resetMIDI();
    expect(useMIDIStore.getState().activeControllerFingerprint).toBeNull();

    // User immediately learns a NEW binding while fingerprint is still null.
    // It lands in ccBankBindings but is NOT yet persisted (the null-fingerprint
    // no-op in _persistBindingsForActiveController).
    useMIDIStore.getState().setCCBankBinding(30, { row: 1, col: 1 });
    expect(useMIDIStore.getState().ccBankBindings).toEqual([{ cc: 30, slot: { row: 1, col: 1 } }]);
    expect(getBindingsForFingerprint(fp)).toEqual([{ cc: 20, slot: { row: 3, col: 2 } }]); // still the stale session-1 save

    // A hardware statechange (hot-plug churn, sleep/wake) re-derives identity
    // for the SAME still-connected controller. Before the fix, this called
    // applyControllerProfile(saved) unconditionally and blind-replaced
    // ccBankBindings with the stale [cc20] set, discarding cc30.
    useMIDIStore.getState().applyControllerIdentity({ name: 'Generic Pad', manufacturer: 'Generic Co' });

    expect(useMIDIStore.getState().ccBankBindings).toEqual([{ cc: 30, slot: { row: 1, col: 1 } }]);
  });

  it('is a no-op when re-applying the same identity (idempotent)', () => {
    const fp = deriveControllerFingerprint('MIDI Mix', 'AKAI');
    saveControllerBindings(fp, bindingsA);
    const midi = useMIDIStore.getState();
    midi.applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });
    // A subsequent in-session learn that is NOT yet in the saved set...
    useMIDIStore.getState().setCCBankBinding(99, { row: 0, col: 7 });
    const withLearn = useMIDIStore.getState().ccBankBindings;
    // Re-applying the same identity must NOT clobber the in-progress learn.
    useMIDIStore.getState().applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });
    expect(useMIDIStore.getState().ccBankBindings).toEqual(withLearn);
  });

  it('releases identity when null device is passed', () => {
    const midi = useMIDIStore.getState();
    midi.applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });
    expect(useMIDIStore.getState().activeControllerFingerprint).not.toBeNull();
    useMIDIStore.getState().applyControllerIdentity(null);
    expect(useMIDIStore.getState().activeControllerFingerprint).toBeNull();
  });
});

// ── E18 — MIDIMIX_FACTORY_PROFILE auto-apply wiring ─────────────────────────
// The profile + applyControllerProfile action existed with zero call sites
// (P0-gap). This covers the two wiring paths: auto-apply on connect (guarded
// identically to the saved-profile auto-load) and the manual override.
describe('E18 — MIDImix factory-profile auto-apply on connect', () => {
  it('connecting a MIDImix with EMPTY bindings and no saved learn auto-applies the factory profile', () => {
    const midi = useMIDIStore.getState();
    expect(midi.ccBankBindings).toEqual([]); // fresh store, nothing saved for this fp either

    midi.applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });

    const after = useMIDIStore.getState();
    expect(after.ccBankBindings).toHaveLength(32); // full MIDIMIX_FACTORY_PROFILE
    expect(after.ccBankBindings).toEqual(expect.arrayContaining([{ cc: 20, slot: { row: 0, col: 1 } }]));
  });

  it('connecting a MIDImix with EXISTING (non-empty) bindings does NOT apply the factory profile (guard holds)', () => {
    const midi = useMIDIStore.getState();
    // Simulate a project that already has its own bank bindings loaded
    // (e.g. from a project file) BEFORE the controller identity resolves —
    // mirrors the exact data-loss guard applyControllerIdentity already uses
    // for the saved-profile branch.
    midi.setCCBankBinding(5, { row: 0, col: 0 });
    const before = useMIDIStore.getState().ccBankBindings;
    expect(before).toEqual([{ cc: 5, slot: { row: 0, col: 0 } }]);

    useMIDIStore.getState().applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });

    // Guard holds: existing binding is untouched, factory profile NOT applied.
    expect(useMIDIStore.getState().ccBankBindings).toEqual(before);
    expect(useMIDIStore.getState().ccBankBindings).toHaveLength(1);
  });

  it('a MIDImix with a SAVED (previously-learned) binding set loads the saved set, not the factory profile', () => {
    const fp = deriveControllerFingerprint('MIDI Mix', 'AKAI');
    saveControllerBindings(fp, bindingsA); // 2 hand-learned bindings, not the 32-binding factory set

    useMIDIStore.getState().applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });

    const after = useMIDIStore.getState();
    expect(after.ccBankBindings).toHaveLength(bindingsA.length);
    expect(after.ccBankBindings).toEqual(expect.arrayContaining(bindingsA));
  });

  it('an unknown (non-MIDImix) controller with empty bindings does NOT get any factory profile applied', () => {
    useMIDIStore.getState().applyControllerIdentity({ name: 'Some Other Controller', manufacturer: 'Nobody' });
    expect(useMIDIStore.getState().ccBankBindings).toEqual([]);
  });
});
