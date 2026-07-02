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

  it('persists a learn under the active fingerprint (reconnect = already mapped)', () => {
    const midi = useMIDIStore.getState();
    // Connect an (unknown) controller -> establishes the active identity.
    midi.applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });
    // Learn a binding.
    useMIDIStore.getState().setCCBankBinding(20, { row: 3, col: 2 });

    const fp = deriveControllerFingerprint('MIDI Mix', 'AKAI');
    expect(getBindingsForFingerprint(fp)).toEqual([{ cc: 20, slot: { row: 3, col: 2 } }]);

    // Simulate a new session: reset in-memory store, reconnect same controller.
    useMIDIStore.getState().resetMIDI();
    expect(useMIDIStore.getState().ccBankBindings).toEqual([]);
    useMIDIStore.getState().applyControllerIdentity({ name: 'MIDI Mix', manufacturer: 'AKAI' });
    expect(useMIDIStore.getState().ccBankBindings).toEqual([{ cc: 20, slot: { row: 3, col: 2 } }]);
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
