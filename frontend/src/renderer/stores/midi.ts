/**
 * MIDI store — device management, CC mapping, learn mode, message routing.
 * All MIDI processing is frontend-only (Web MIDI API in Electron renderer).
 *
 * B10 (P5b.25): CC intake is rate-limited per controlId (≤30 writes/sec, 33ms
 * floor) and echo-suppressed (SG-H3) so motorized fader feedback is ignored.
 * Distinct controlIds use independent throttle buckets.
 */
import { create } from 'zustand';
import type { CCMapping, MIDIDevice, LearnTarget, MIDIPersistData } from '../../shared/types';
import type { CCBankBinding, BankAssignment, BankSlotAddress, CCSlotMapping } from '../../shared/bankTypes';
import {
  isValidCCBankBinding,
  isValidBankAssignment,
  isValidCCSlotMapping,
  MAX_CC_BANK_BINDINGS,
  MAX_BANK_ASSIGNMENT_CONTEXTS,
  MAX_CC_SLOT_MAPPINGS,
  MAX_BANK_PAGES,
} from '../../shared/bankTypes';
import { usePerformanceStore } from './performance';
import { handlePadTrigger, releasePadWithCapture } from '../components/performance/padActions';
import { MIDICCRateLimiter } from '../../shared/midi-utils';
import {
  deriveControllerFingerprint,
  getBindingsForFingerprint,
  saveControllerBindings,
} from '../../shared/controllerIdentity';
import { getFactoryProfileForFingerprint } from '../utils/controllerProfiles';
import { useToastStore } from './toast';

// Module-level singleton limiter — survives store resets (state reset ≠ device
// reconnect; throttle context is cleared on resetMIDI via _resetCCLimiter()).
const _ccLimiter = new MIDICCRateLimiter();

// ── Trailing-edge flush state (B10, P5b.25) ──────────────────────────────────
// A throttled CC value is NOT dropped: it is coalesced as the pending latest
// value for its controlId and flushed when the throttle window elapses, so the
// final knob position always lands. Distinct controlIds flush independently.
interface PendingCC {
  value: number;                        // normalized 0-1, latest coalesced value
  timer: ReturnType<typeof setTimeout>; // scheduled trailing-edge flush
}
const _pendingCC = new Map<number, PendingCC>();

/** Apply a CC value to the store immediately (single source of write truth). */
function _writeCCValue(cc: number, normalized: number): void {
  useMIDIStore.setState((s) => ({
    ccValues: { ...s.ccValues, [cc]: normalized },
  }));
}

/** Cancel + clear any pending trailing-edge flush for a controlId. */
function _clearPending(cc: number): void {
  const p = _pendingCC.get(cc);
  if (p !== undefined) {
    clearTimeout(p.timer);
    _pendingCC.delete(cc);
  }
}

/** Reset rate-limiter + all pending flushes (called from resetMIDI). */
function _resetCCLimiter(): void {
  for (const p of _pendingCC.values()) clearTimeout(p.timer);
  _pendingCC.clear();
  _ccLimiter.reset();
}

/**
 * H5 — persist the current ccBankBindings under the active controller's
 * fingerprint. No-op when no controller identity is applied (nothing to key on).
 * Takes the store's `get` so it can read the freshest post-set state.
 */
function _persistBindingsForActiveController(get: () => MIDIState): void {
  const { activeControllerFingerprint, ccBankBindings } = get();
  if (!activeControllerFingerprint) return;
  saveControllerBindings(activeControllerFingerprint, ccBankBindings);
}

interface MIDIState {
  devices: MIDIDevice[];
  activeDeviceId: string | null;
  channelFilter: number | null; // 0-15 or null (all)
  ccMappings: CCMapping[];
  ccValues: Record<number, number>; // cc number → normalized value (0-1)
  learnTarget: LearnTarget | null;
  isSupported: boolean;

  // H2 — bank-relative hardware mapping (master-tuneup WS5). See bankTypes.ts
  // module doc for the semantic model (transient overlay, never a store write
  // for the RESOLVED value — these two fields are the model/config only).
  ccBankBindings: CCBankBinding[];
  bankAssignments: Record<string, BankAssignment>;

  // H7 — bank PAGING (bankTypes.ts MAX_BANK_PAGES doc). Which page of the
  // bank-assignment grid is active for EVERY context (global, not
  // per-contextKey — mirrors how a physical BANK L/R pair shifts the whole
  // controller at once). 0-indexed, clamped to [0, MAX_BANK_PAGES - 1] by
  // bankPageLeft/bankPageRight/setActiveBankIndex — never wraps. Session-only
  // (NOT persisted via getMIDIPersistData/loadMIDIMappings): it is a live
  // paging position, not saved project state, so every project load starts
  // back at page 0.
  activeBankIndex: number;

  // H5 — controller-identity persistence (master plan WS5). The fingerprint of
  // the currently active controller (name+manufacturer, sanitized — see
  // controllerIdentity.ts). Learns are persisted at APP level keyed by this
  // fingerprint; on device connect, a known fingerprint auto-loads its saved
  // ccBankBindings. null when no controller identity has been applied yet.
  activeControllerFingerprint: string | null;

  // H3 — direct CC->SlotTarget mappings from the widened MIDI-learn surface
  // (macro/transform/mask/instrument). Absolute (not focus-relative); the
  // legacy effect-knob learn still writes ccMappings, so this list holds the
  // NEW target kinds only. See bankTypes.ts CCSlotMapping doc.
  ccSlotMappings: CCSlotMapping[];

  // Actions
  setDevices: (devices: MIDIDevice[]) => void;
  setActiveDevice: (id: string | null) => void;
  setChannelFilter: (channel: number | null) => void;
  addCCMapping: (mapping: CCMapping) => void;
  removeCCMapping: (index: number) => void;
  clearCCMappings: () => void;
  setLearnTarget: (target: LearnTarget | null) => void;
  // H2 bank actions
  setCCBankBinding: (cc: number, slot: BankSlotAddress) => void;
  removeCCBankBinding: (cc: number) => void;
  clearCCBankBindings: () => void;
  setBankAssignment: (contextKey: string, assignment: BankAssignment) => void;
  clearBankAssignment: (contextKey: string) => void;
  // H7 bank paging — clamped (no wrap) at [0, MAX_BANK_PAGES - 1]
  bankPageLeft: () => void;
  bankPageRight: () => void;
  setActiveBankIndex: (index: number) => void;
  // H5 controller-identity: apply the saved binding-set for a connected device
  // (or clear identity when device is null). See action impl for semantics.
  applyControllerIdentity: (device: { name: string; manufacturer: string } | null) => void;
  // H3 direct CC->SlotTarget mapping CRUD
  addCCSlotMapping: (mapping: CCSlotMapping) => void;
  removeCCSlotMapping: (cc: number) => void;
  clearCCSlotMappings: () => void;
  applyControllerProfile: (bindings: CCBankBinding[]) => void;
  setIsSupported: (supported: boolean) => void;
  handleMIDIMessage: (data: Uint8Array, frameIndex: number) => void;
  resetMIDI: () => void;
  getMIDIPersistData: () => MIDIPersistData;
  loadMIDIMappings: (data: MIDIPersistData) => void;
}

export const useMIDIStore = create<MIDIState>((set, get) => ({
  devices: [],
  activeDeviceId: null,
  channelFilter: null,
  ccMappings: [],
  ccValues: {},
  learnTarget: null,
  isSupported: false,
  ccBankBindings: [],
  bankAssignments: {},
  activeBankIndex: 0,
  ccSlotMappings: [],
  activeControllerFingerprint: null,

  setDevices: (devices) => set({ devices }),
  setActiveDevice: (id) => set({ activeDeviceId: id }),
  setChannelFilter: (channel) => set({ channelFilter: channel }),

  addCCMapping: (mapping) => {
    const { ccMappings } = get();
    // Remove existing mapping for same CC (one CC → one param)
    const filtered = ccMappings.filter((m) => m.cc !== mapping.cc);
    set({ ccMappings: [...filtered, mapping] });
  },

  removeCCMapping: (index) => {
    const { ccMappings } = get();
    if (index < 0 || index >= ccMappings.length) return;
    set({ ccMappings: ccMappings.filter((_, i) => i !== index) });
  },

  clearCCMappings: () => {
    // Bug #16 fix: cancel any pending trailing-edge flush timers before clearing
    // ccValues. Without this, a deferred setTimeout flush scheduled mid-CC-burst
    // would fire AFTER the clear and resurrect a stale CC value into ccValues.
    // Mirror the timer-cancel pattern used in resetMIDI (which calls _resetCCLimiter).
    _resetCCLimiter();
    set({ ccMappings: [], ccValues: {} });
  },

  setLearnTarget: (target) => set({ learnTarget: target }),
  setIsSupported: (supported) => set({ isSupported: supported }),

  // H2 — bank binding CRUD. Mirrors addCCMapping's "one CC → one target"
  // overwrite semantics, plus the MAX_CC_BANK_BINDINGS evict-oldest cap
  // (bindings are a small, ordered array — FIFO shift is O(n) but n<=64).
  setCCBankBinding: (cc, slot) => {
    if (!Number.isInteger(cc) || cc < 0 || cc > 127) return;
    if (!Number.isInteger(slot.row) || slot.row < 0 || slot.row > 3) return;
    if (!Number.isInteger(slot.col) || slot.col < 0 || slot.col > 7) return;
    const { ccBankBindings } = get();
    let next = ccBankBindings.filter((b) => b.cc !== cc);
    if (next.length >= MAX_CC_BANK_BINDINGS) {
      next = next.slice(next.length - MAX_CC_BANK_BINDINGS + 1); // evict oldest
    }
    next = [...next, { cc, slot: { row: slot.row, col: slot.col } }];
    set({ ccBankBindings: next });
    // H5 — persist the LEARN at app level keyed by the active controller.
    _persistBindingsForActiveController(get);
  },

  removeCCBankBinding: (cc) => {
    set((s) => ({ ccBankBindings: s.ccBankBindings.filter((b) => b.cc !== cc) }));
    _persistBindingsForActiveController(get); // H5 — keep saved set in sync
  },

  clearCCBankBindings: () => {
    set({ ccBankBindings: [] });
    _persistBindingsForActiveController(get); // H5 — empty set forgets the controller
  },

  setBankAssignment: (contextKey, assignment) => {
    if (typeof contextKey !== 'string' || contextKey.length === 0) return;
    if (!isValidBankAssignment(assignment)) return;
    const { bankAssignments } = get();
    let next = bankAssignments;
    if (!(contextKey in bankAssignments) && Object.keys(bankAssignments).length >= MAX_BANK_ASSIGNMENT_CONTEXTS) {
      // Evict-oldest: string-keyed object preserves insertion order in JS,
      // so the first key is genuinely the oldest surviving entry.
      const oldestKey = Object.keys(bankAssignments)[0];
      next = { ...bankAssignments };
      delete next[oldestKey];
    }
    set({ bankAssignments: { ...next, [contextKey]: assignment } });
  },

  clearBankAssignment: (contextKey) => {
    set((s) => {
      if (!(contextKey in s.bankAssignments)) return s;
      const next = { ...s.bankAssignments };
      delete next[contextKey];
      return { bankAssignments: next };
    });
  },

  // H7 — bank paging. CLAMPED, not wrapped (see bankTypes.ts MAX_BANK_PAGES
  // doc): paging past either end is a no-op, so a HUD driven off
  // activeBankIndex gets a stable "at the rail" value instead of silently
  // jumping back to page 0.
  bankPageLeft: () => {
    set((s) => ({ activeBankIndex: Math.max(0, s.activeBankIndex - 1) }));
  },

  bankPageRight: () => {
    set((s) => ({ activeBankIndex: Math.min(MAX_BANK_PAGES - 1, s.activeBankIndex + 1) }));
  },

  setActiveBankIndex: (index) => {
    if (!Number.isInteger(index)) return;
    set({ activeBankIndex: Math.max(0, Math.min(MAX_BANK_PAGES - 1, index)) });
  },

  // H5 — controller-identity auto-load. Called from useMIDI on device connect /
  // active-device change with the active input's {name, manufacturer} (or null
  // when no device is active). Derives the stable fingerprint and, if it DIFFERS
  // from the currently applied identity, adopts it: a known fingerprint's saved
  // bindings are applied (auto-load, "already mapped"); an unknown fingerprint
  // with no built-in factory profile leaves the current bindings untouched
  // (getBindingsForFingerprint → []), so a fresh controller inherits nothing
  // and starts a clean LEARN that then persists under its own fingerprint. A
  // fingerprint with NO saved learn but a KNOWN built-in factory profile
  // (E18 — e.g. Akai MIDImix) auto-applies that factory map instead — see
  // getFactoryProfileForFingerprint below.
  //
  // The fingerprint-change guard makes this idempotent across the frequent
  // onstatechange bursts: once applied, in-session learns keep the store == the
  // saved set (every binding CRUD persists), so re-applying the same identity
  // is a no-op and never clobbers an in-progress learn.
  applyControllerIdentity: (device) => {
    const fingerprint = device
      ? deriveControllerFingerprint(device.name, device.manufacturer)
      : null;
    if (fingerprint === get().activeControllerFingerprint) return;
    set({ activeControllerFingerprint: fingerprint });
    if (fingerprint) {
      // Data-loss guard (redteam-confirmed): resetMIDI() (project open/new)
      // clears activeControllerFingerprint to null WITHOUT clearing
      // ccBankBindings from the newly-loaded project — and a learn made while
      // fingerprint is null lands in ccBankBindings too, just unpersisted (see
      // _persistBindingsForActiveController's null-fingerprint no-op above).
      // Either way, a NON-EMPTY ccBankBindings here means something the user
      // already has — the project's own saved bindings, or an in-session
      // learn — that must never be silently blown away by a stale app-level
      // "known controller" profile. The saved-profile auto-load is only a
      // convenience for an EMPTY session; once bindings exist, skip it.
      if (get().ccBankBindings.length > 0) return;
      const saved = getBindingsForFingerprint(fingerprint); // validated + capped
      if (saved.length > 0) {
        // applyControllerProfile re-validates, de-dupes by cc, and caps —
        // second trust-boundary pass on the persisted payload.
        get().applyControllerProfile(saved);
        return;
      }
      // E18 — no per-app saved learn for this controller yet. If the
      // fingerprint matches a KNOWN built-in factory profile (e.g. Akai
      // MIDImix), auto-apply that factory CC map as a convenience default so
      // the bank isn't silently unmapped on first connect. Reuses the exact
      // same guard as the saved-profile branch above (the ccBankBindings.length
      // > 0 check already returned early) — this never clobbers an existing
      // project's bindings or an in-progress learn, only fills a genuinely
      // empty bank.
      const factory = getFactoryProfileForFingerprint(fingerprint);
      if (factory) {
        get().applyControllerProfile(factory);
        useToastStore.getState().addToast({
          level: 'info',
          message: 'MIDImix factory mapping loaded',
          source: 'midi-controller-profile',
        });
      }
    }
  },

  // H3 — direct CC->SlotTarget mapping CRUD. Mirrors addCCMapping's
  // "one CC → one target" overwrite semantics plus a MAX_CC_SLOT_MAPPINGS
  // evict-oldest cap. Invalid shapes (bad cc / malformed target) are DROPPED
  // (trust boundary: this is the learn-consume write path).
  addCCSlotMapping: (mapping) => {
    if (!isValidCCSlotMapping(mapping)) return;
    const { ccSlotMappings } = get();
    let next = ccSlotMappings.filter((m) => m.cc !== mapping.cc);
    if (next.length >= MAX_CC_SLOT_MAPPINGS) {
      next = next.slice(next.length - MAX_CC_SLOT_MAPPINGS + 1); // evict oldest
    }
    set({ ccSlotMappings: [...next, { cc: mapping.cc, target: mapping.target }] });
  },

  removeCCSlotMapping: (cc) => {
    set((s) => ({ ccSlotMappings: s.ccSlotMappings.filter((m) => m.cc !== cc) }));
  },

  clearCCSlotMappings: () => set({ ccSlotMappings: [] }),

  // Bulk-set convenience for a built-in controller profile (e.g. MIDImix
  // factory map, controllerProfiles.ts). Validates + truncates to the same
  // cap as setCCBankBinding; replaces (does not merge with) existing bindings.
  applyControllerProfile: (bindings) => {
    const valid = bindings.filter(isValidCCBankBinding).slice(0, MAX_CC_BANK_BINDINGS);
    // De-dupe by cc (last write wins), mirroring one-CC-one-target.
    const byCc = new Map<number, CCBankBinding>();
    for (const b of valid) byCc.set(b.cc, b);
    set({ ccBankBindings: Array.from(byCc.values()) });
  },

  handleMIDIMessage: (data, frameIndex) => {
    if (data.length < 2) return;

    const statusByte = data[0] & 0xf0;
    const channel = data[0] & 0x0f;

    // Only handle note-on, note-off, CC — ignore SysEx, timing, active sensing, etc.
    if (statusByte !== 0x80 && statusByte !== 0x90 && statusByte !== 0xb0) return;

    // Channel filter
    const { channelFilter, learnTarget } = get();
    if (channelFilter !== null && channel !== channelFilter) return;

    const byte1 = data[1]; // note or CC number
    const byte2 = data.length > 2 ? data[2] : 0; // velocity or CC value

    // Learn mode: consume message for learning
    if (learnTarget) {
      if (learnTarget.type === 'pad') {
        if (statusByte === 0x90 && byte2 > 0) {
          // Note-on → assign midiNote to pad (with steal)
          const perfStore = usePerformanceStore.getState();
          const pads = perfStore.drumRack.pads;

          // Steal: clear midiNote from any pad that has this note
          for (const pad of pads) {
            if (pad.midiNote === byte1 && pad.id !== learnTarget.padId) {
              perfStore.updatePad(pad.id, { midiNote: null });
            }
          }

          perfStore.updatePad(learnTarget.padId, { midiNote: byte1 });
          set({ learnTarget: null });
        }
      } else if (learnTarget.type === 'cc') {
        if (statusByte === 0xb0) {
          // CC → create legacy effect-knob mapping (unchanged by H3)
          get().addCCMapping({
            cc: byte1,
            effectId: learnTarget.effectId,
            paramKey: learnTarget.paramKey,
          });
          set({ learnTarget: null });
        }
      } else if (learnTarget.type === 'slot') {
        // H3 — widened learn surface. First CC after arming binds a direct
        // CC->SlotTarget mapping for the armed macro/transform/mask/instrument
        // target. byte1 (the CC number) is already a valid 0-127 MIDI byte;
        // addCCSlotMapping re-validates at the trust boundary.
        if (statusByte === 0xb0) {
          get().addCCSlotMapping({ cc: byte1, target: learnTarget.target });
          set({ learnTarget: null });
        }
      }
      return; // Learn consumed the message
    }

    // Normal message routing
    const perfStore = usePerformanceStore.getState();

    if (statusByte === 0x90 && byte2 > 0) {
      // Note-on: find pad by midiNote
      const pad = perfStore.drumRack.pads.find((p) => p.midiNote === byte1);
      if (!pad) return;
      // H6: byte2 IS the note-on velocity (0-127) here — plumb it through
      // instead of discarding it, so velocity-sensitive pads (nanoPAD2,
      // Launchpad) reach the performance layer as trigger intensity
      // (handlePadTrigger → triggerPad → PadRuntimeState.velocity → scales
      // computeADSR's envelope peak → applyPadModulations) and, when a
      // trackId is present, as the TriggerEvent.velocity field.
      handlePadTrigger(pad, perfStore, frameIndex, 'midi', byte2);
    } else if (statusByte === 0x80 || (statusByte === 0x90 && byte2 === 0)) {
      // Note-off: release pad for gate/one-shot
      const pad = perfStore.drumRack.pads.find((p) => p.midiNote === byte1);
      if (!pad) return;
      if (pad.mode === 'gate' || pad.mode === 'one-shot') {
        releasePadWithCapture(pad, perfStore, frameIndex, 'midi');
      }
    } else if (statusByte === 0xb0) {
      // CC: TRAILING-EDGE rate-limited + echo-suppressed intake (B10, P5b.25).
      // Trust boundary: byte1 and byte2 are already guarded as valid MIDI bytes
      // (0-127) by the status-byte check and the message-length guard above.
      // Chain: handleMIDIMessage → _ccLimiter.classify (33ms/controlId) →
      //        write-now | coalesce+schedule-flush → set({ ccValues }) →
      //        downstream selectors / applyCCModulations
      //
      // A throttled value is NEVER dropped: it is coalesced as the pending
      // latest value and a flush is scheduled for when the window elapses, so
      // the final knob position always lands (fixes leading-edge value loss).
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const cc = byte1;
      const normalized = byte2 / 127;
      const decision = _ccLimiter.classify(cc, byte2, now);

      if (decision === 'write') {
        // Window open: write immediately. Drop any stale pending flush — this
        // fresh write supersedes it and restarts the throttle window.
        _clearPending(cc);
        _writeCCValue(cc, normalized);
      } else if (decision === 'defer') {
        // Within window: coalesce as the latest value and (re)schedule the
        // trailing-edge flush for when the window next opens.
        const dueAt = _ccLimiter.nextWriteTime(cc, now);
        const delay = Math.max(0, dueAt - now);
        _clearPending(cc); // replace any earlier pending flush with the latest value
        const timer = setTimeout(() => {
          const pending = _pendingCC.get(cc);
          _pendingCC.delete(cc);
          if (pending === undefined) return;
          // Restart the window from the flush time so the rate cap holds.
          const flushNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
          _ccLimiter.markFlushed(cc, flushNow);
          _writeCCValue(cc, pending.value);
        }, delay);
        _pendingCC.set(cc, { value: normalized, timer });
      }
      // decision === 'suppress' (echo, SG-H3): ignore entirely.
    }
  },

  resetMIDI: () => {
    _resetCCLimiter(); // clear throttle + echo + pending-flush state on MIDI reset
    set({
      ccMappings: [],
      ccValues: {},
      learnTarget: null,
      channelFilter: null,
      ccBankBindings: [],
      bankAssignments: {},
      activeBankIndex: 0,
      ccSlotMappings: [],
      // H5 — clear the applied identity so the next device connect re-derives
      // and re-applies its app-level saved bindings. This does NOT touch the
      // app-level localStorage store (that persists across projects/sessions).
      activeControllerFingerprint: null,
    });
  },

  getMIDIPersistData: (): MIDIPersistData => {
    const { ccMappings, channelFilter, ccBankBindings, bankAssignments, ccSlotMappings } = get();
    const perfStore = usePerformanceStore.getState();

    const padMidiNotes: Record<string, number | null> = {};
    for (const pad of perfStore.drumRack.pads) {
      if (pad.midiNote !== null) {
        padMidiNotes[pad.id] = pad.midiNote;
      }
    }

    return {
      padMidiNotes,
      ccMappings,
      channelFilter,
      ccBankBindings,
      bankAssignments,
      ccSlotMappings,
    };
  },

  loadMIDIMappings: (data: MIDIPersistData) => {
    const perfStore = usePerformanceStore.getState();

    // Restore pad midiNotes (bypass undo — this is a load operation, not a user edit)
    if (data.padMidiNotes && typeof data.padMidiNotes === 'object') {
      const { drumRack } = perfStore;
      const pads = [...drumRack.pads];
      let changed = false;

      for (const [padId, midiNote] of Object.entries(data.padMidiNotes)) {
        if (typeof padId !== 'string') continue;
        // Validate midiNote: must be integer 0-127 or null
        if (midiNote !== null && (typeof midiNote !== 'number' || !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127)) continue;

        const idx = pads.findIndex((p) => p.id === padId);
        if (idx === -1) continue;
        pads[idx] = { ...pads[idx], midiNote: midiNote ?? null };
        changed = true;
      }

      if (changed) {
        usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });
      }
    }

    // Validate ccMappings: each must have integer cc 0-127, string effectId, string paramKey
    const validMappings = Array.isArray(data.ccMappings)
      ? data.ccMappings.filter((m): m is CCMapping =>
          typeof m === 'object' && m !== null &&
          typeof m.cc === 'number' && Number.isInteger(m.cc) && m.cc >= 0 && m.cc <= 127 &&
          typeof m.effectId === 'string' &&
          typeof m.paramKey === 'string'
        ).slice(0, 128) // max 128 CC numbers
      : [];

    // Validate channelFilter: must be integer 0-15 or null
    const validChannel = (typeof data.channelFilter === 'number' && Number.isInteger(data.channelFilter) && data.channelFilter >= 0 && data.channelFilter <= 15)
      ? data.channelFilter
      : null;

    // H2 — validate ccBankBindings: each must have integer cc 0-127 and a
    // valid BankSlotAddress (row 0-3, col 0-7). Cap mirrors setCCBankBinding.
    const validBankBindings = Array.isArray(data.ccBankBindings)
      ? data.ccBankBindings.filter(isValidCCBankBinding).slice(0, MAX_CC_BANK_BINDINGS)
      : [];

    // H2 — validate bankAssignments: object of contextKey -> BankAssignment,
    // each shape-checked (exact 4x8 grid, allowlisted slot-target kinds).
    // Malformed entries are DROPPED, never throw (trust boundary, mirrors the
    // rest of this function). Cap mirrors setBankAssignment.
    const validBankAssignments: Record<string, BankAssignment> = {};
    if (data.bankAssignments && typeof data.bankAssignments === 'object' && !Array.isArray(data.bankAssignments)) {
      let count = 0;
      for (const [key, value] of Object.entries(data.bankAssignments)) {
        if (count >= MAX_BANK_ASSIGNMENT_CONTEXTS) break;
        if (typeof key !== 'string' || key.length === 0) continue;
        if (!isValidBankAssignment(value)) continue;
        validBankAssignments[key] = value;
        count++;
      }
    }

    // H3 — validate ccSlotMappings: each must have integer cc 0-127 and a
    // valid SlotTarget (allowlisted kind + non-empty id fields). Malformed
    // entries are DROPPED (trust boundary, mirrors ccMappings above). Absent
    // on pre-H3 projects → []. Cap mirrors addCCSlotMapping.
    const validSlotMappings = Array.isArray(data.ccSlotMappings)
      ? data.ccSlotMappings.filter(isValidCCSlotMapping).slice(0, MAX_CC_SLOT_MAPPINGS)
      : [];

    set({
      ccMappings: validMappings,
      channelFilter: validChannel,
      ccValues: {},
      ccBankBindings: validBankBindings,
      bankAssignments: validBankAssignments,
      ccSlotMappings: validSlotMappings,
    });
  },
}));
