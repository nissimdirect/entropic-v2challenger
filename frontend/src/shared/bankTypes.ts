/**
 * H2 (2026-07-02 master-tuneup WS5) — bank-relative hardware mapping model.
 *
 * Foundation: H1 (focusContext.ts) derives a `MappingContext` with a stable
 * `contextKey` from whatever the user is currently focused on (rack pad,
 * effect, clip, track, or nothing). H2 layers a 4-row x 8-column "bank" of
 * hardware slots on top of that: a physical controller's knob/fader grid is
 * ALWAYS bound to the same physical slot (e.g. "row 2, col 5"), but WHAT that
 * slot controls changes with focus — hardware banks are bank-RELATIVE, not
 * hardware-absolute. This is what "focus-follows" means for H2+.
 *
 * SEMANTIC MODEL (locked, see master plan WS5): ALL hardware CC control here
 * is a TRANSIENT MODULATION OVERLAY, applied per-frame in the render path —
 * never a store write. Committed writes (turning a live tweak into a
 * persisted automation lane / value) come only with recording, which is H4,
 * NOT H2. Nothing in this module or its resolver ever calls a project-store
 * setter for the resolved value.
 *
 * v1 scope: 'effectParam' and 'macro' targets are LIVE (resolved by
 * applyBankModulations.ts). 'transform' and 'mask' targets are storable and
 * survive persistence, but the v1 resolver treats them as a no-op with a
 * single dev-console warning — H4 wires the live transform/mask overlay.
 */

/** One physical slot in the 4x8 hardware bank grid. Row 3 = fader row. */
export interface BankSlotAddress {
  row: 0 | 1 | 2 | 3;
  col: number; // integer 0-7, validated at runtime (isValidBankSlotAddress)
}

export const BANK_ROWS = 4;
export const BANK_COLS = 8;

/** A physical CC number bound to a bank slot address (hardware-relative, not target-relative). */
export interface CCBankBinding {
  cc: number; // MIDI CC number, integer 0-127
  slot: BankSlotAddress;
}

/**
 * What a bank slot resolves to for the CURRENTLY FOCUSED context.
 * 'effectParam' and 'macro' are live in H2; 'transform' and 'mask' are
 * storable-but-inert until H4 wires their resolvers (see module doc).
 */
export type SlotTarget =
  | { kind: 'effectParam'; effectId: string; paramKey: string }
  | { kind: 'macro'; trackId: string; macroId: string }
  | { kind: 'transform'; clipId: string; field: string }
  | { kind: 'mask'; nodeId: string; param: string }
  // H3 (master plan WS5) — instrument device knob (Sampler/Granulator/
  // FrameBank), armed via the widened MIDI-learn surface. `trackId` scopes
  // the instrument; `paramKey` names the knob (e.g. 'speed', 'axis.t.grain',
  // 'position'). Like 'transform'/'mask' it is storable-but-inert in the H2
  // bank resolver (H4 wires the live overlay).
  | { kind: 'instrument'; trackId: string; paramKey: string };

/** The 4x8 grid of resolved targets for ONE mapping context (keyed by contextKey). */
export interface BankAssignment {
  contextKey: string;
  /** slots[row][col], always exactly BANK_ROWS rows of BANK_COLS entries. */
  slots: (SlotTarget | null)[][];
}

// --- Trust-boundary caps (mirrors the MAX_* pattern used across this codebase:
// RackMacro MAX_MACROS_PER_RACK, MIDIPersistData ccMappings 128-cap, etc.) ---

/** Max distinct CC->slot bindings held at once. Evict-oldest on overflow. */
export const MAX_CC_BANK_BINDINGS = 64;

/** Max distinct saved (non-default) bank assignments (one per contextKey). Evict-oldest on overflow. */
export const MAX_BANK_ASSIGNMENT_CONTEXTS = 128;

/**
 * H7 (2026-07-02 master-tuneup) — bank PAGING. A physical controller with a
 * hardware BANK L/R pair (e.g. Akai MIDImix) pages through multiple 4x8
 * grids for the SAME focused context, rather than being limited to the one
 * grid H2 modeled per contextKey. `activeBankIndex` (stores/midi.ts) is the
 * live page number, clamped to [0, MAX_BANK_PAGES - 1] — CLAMPED, NOT
 * WRAPPED: paging right at the last page (or left at page 0) is a no-op,
 * matching how most hardware bank-pagers behave at the rail ends and giving
 * the HUD a stable "you're at the end" signal instead of silently cycling
 * back to page 0.
 *
 * NOTE ON THE PHYSICAL MIDImix BANK L/R BUTTONS: per Akai's own support
 * article ("Why Aren't The Bank Buttons Sending Any MIDI Data?",
 * support.akaipro.com), those buttons do NOT transmit MIDI — they shift
 * what CC numbers the controller's OWN knobs/faders send, entirely inside
 * the hardware. There is no note/CC byte this app can listen for. Paging is
 * therefore a software-side control (BankPagingHUD's L/R buttons,
 * components/layout/BankPagingHUD.tsx) rather than something wired to a
 * physical-button MIDI message — the concept (page the active bank) is the
 * same either way, but the trigger is a UI click, not `handleMIDIMessage`.
 *
 * 8 pages mirrors BANK_COLS (a reasonable upper bound on how many banks a
 * user will realistically page through) — not a hardware spec, just a sane
 * trust-boundary cap like the other MAX_* constants in this file.
 */
export const MAX_BANK_PAGES = 8;

/**
 * Effective bankAssignments lookup key for a given (contextKey, bankIndex)
 * pair. Page 0 maps to the BARE contextKey — unchanged from pre-H7 behavior,
 * so projects/tests saved before bank paging existed keep resolving exactly
 * as they did (H2/H5 wrote bankAssignments keyed by bare contextKey only).
 * Pages 1+ get a suffix so they occupy distinct slots in the same
 * `Record<string, BankAssignment>` map — no new store field needed.
 * 'none' (nothing focused) is left untouched: callers already short-circuit
 * before resolving an assignment when context.kind === 'none'.
 */
export function pagedContextKey(contextKey: string, bankIndex: number): string {
  if (contextKey === 'none' || bankIndex === 0) return contextKey;
  return `${contextKey}::bank${bankIndex}`;
}

const SLOT_TARGET_KINDS = new Set(['effectParam', 'macro', 'transform', 'mask', 'instrument']);

/** Coerce-check: integer in [min, max]. */
function isIntInRange(x: unknown, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

export function isValidBankSlotAddress(x: unknown): x is BankSlotAddress {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return isIntInRange(s.row, 0, BANK_ROWS - 1) && isIntInRange(s.col, 0, BANK_COLS - 1);
}

export function isValidCCBankBinding(x: unknown): x is CCBankBinding {
  if (typeof x !== 'object' || x === null) return false;
  const b = x as Record<string, unknown>;
  return isIntInRange(b.cc, 0, 127) && isValidBankSlotAddress(b.slot);
}

export function isValidSlotTarget(x: unknown): x is SlotTarget {
  if (typeof x !== 'object' || x === null) return false;
  const t = x as Record<string, unknown>;
  if (typeof t.kind !== 'string' || !SLOT_TARGET_KINDS.has(t.kind)) return false;
  switch (t.kind) {
    case 'effectParam':
      return isNonEmptyString(t.effectId) && isNonEmptyString(t.paramKey);
    case 'macro':
      return isNonEmptyString(t.trackId) && isNonEmptyString(t.macroId);
    case 'transform':
      return isNonEmptyString(t.clipId) && isNonEmptyString(t.field);
    case 'mask':
      return isNonEmptyString(t.nodeId) && isNonEmptyString(t.param);
    case 'instrument':
      return isNonEmptyString(t.trackId) && isNonEmptyString(t.paramKey);
    default:
      return false;
  }
}

/**
 * H3 (master plan WS5) — a DIRECT (context-free) binding of a physical CC to a
 * concrete SlotTarget. This is the analog of the legacy CCMapping (cc ->
 * effectId/paramKey), generalized to the full SlotTarget surface (macro /
 * transform / mask / instrument) so the widened MIDI-learn surface can bind a
 * knob straight to a physical CC. Unlike CCBankBinding (cc -> bank slot,
 * FOCUS-relative), a CCSlotMapping is absolute: the same CC always drives the
 * same target regardless of focus.
 *
 * effect-knob learn keeps using the legacy CCMapping path unchanged — this list
 * carries ONLY the new kinds. Per the H2 semantic model, transform / mask /
 * instrument targets are storable-but-inert until H4 wires the live overlay;
 * macro / effectParam are resolvable.
 */
export interface CCSlotMapping {
  cc: number; // MIDI CC number, integer 0-127
  target: SlotTarget;
}

/** Max distinct direct CC->SlotTarget mappings held at once (mirrors the 128-CC
 *  cap on the legacy ccMappings list). Evict-oldest on overflow. */
export const MAX_CC_SLOT_MAPPINGS = 128;

export function isValidCCSlotMapping(x: unknown): x is CCSlotMapping {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  return isIntInRange(m.cc, 0, 127) && isValidSlotTarget(m.target);
}

/** Shape-validate a whole BankAssignment (exact BANK_ROWS x BANK_COLS grid, null-or-valid entries). */
export function isValidBankAssignment(x: unknown): x is BankAssignment {
  if (typeof x !== 'object' || x === null) return false;
  const a = x as Record<string, unknown>;
  if (typeof a.contextKey !== 'string' || a.contextKey.length === 0) return false;
  if (!Array.isArray(a.slots) || a.slots.length !== BANK_ROWS) return false;
  for (const row of a.slots) {
    if (!Array.isArray(row) || row.length !== BANK_COLS) return false;
    for (const entry of row) {
      if (entry !== null && !isValidSlotTarget(entry)) return false;
    }
  }
  return true;
}
