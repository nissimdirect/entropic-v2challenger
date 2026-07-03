/**
 * H-UI (2026-07-02 master-tuneup WS5) — MIDI-Map-mode UI state.
 *
 * The hardware-mapping ENGINE (H1–H5) already lives in stores/midi.ts
 * (ccBankBindings / bankAssignments / controller identity). This store holds
 * ONLY the transient VIEW state for the Ableton-style "MIDI Map mode" overlay:
 * whether the overlay is open and which physical bank slot the user has picked
 * to (re)assign. It writes nothing to the engine's persistence/identity layer —
 * assignment edits go through the existing midi-store actions
 * (setBankAssignment). Deliberately kept OUT of stores/midi.ts so the overlay's
 * ephemeral UI toggle never touches the persisted MIDI model (and to keep this
 * lane's diff off the hot midi.ts file that H6/H7 also edit).
 */
import { create } from 'zustand'
import type { BankSlotAddress } from '../../shared/bankTypes'
import { BANK_ROWS, BANK_COLS } from '../../shared/bankTypes'

export interface MIDIMapModeState {
  /** Is the MIDI-Map overlay open? */
  mapMode: boolean
  /** The physical bank slot the user picked to reassign, or null (none picked). */
  selectedSlot: BankSlotAddress | null

  setMapMode: (on: boolean) => void
  toggleMapMode: () => void
  /** Pick a slot to reassign; passing null (or the already-selected slot) clears it. */
  setSelectedSlot: (slot: BankSlotAddress | null) => void
}

/** True only for a valid in-grid slot address (row 0-3, col 0-7). */
function isInGridSlot(slot: BankSlotAddress | null): slot is BankSlotAddress {
  return (
    slot !== null &&
    Number.isInteger(slot.row) && slot.row >= 0 && slot.row < BANK_ROWS &&
    Number.isInteger(slot.col) && slot.col >= 0 && slot.col < BANK_COLS
  )
}

export const useMIDIMapModeStore = create<MIDIMapModeState>((set, get) => ({
  mapMode: false,
  selectedSlot: null,

  // Closing the overlay always clears the picked slot so re-opening starts clean.
  setMapMode: (on) => set(on ? { mapMode: true } : { mapMode: false, selectedSlot: null }),
  toggleMapMode: () =>
    set((s) => (s.mapMode ? { mapMode: false, selectedSlot: null } : { mapMode: true })),

  setSelectedSlot: (slot) => {
    if (slot === null || !isInGridSlot(slot)) {
      set({ selectedSlot: null })
      return
    }
    // Clicking the already-selected slot toggles it back off.
    const cur = get().selectedSlot
    if (cur && cur.row === slot.row && cur.col === slot.col) {
      set({ selectedSlot: null })
      return
    }
    set({ selectedSlot: { row: slot.row, col: slot.col } })
  },
}))
