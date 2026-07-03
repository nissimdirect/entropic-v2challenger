/**
 * H7 (2026-07-02 master-tuneup WS5) — bank-paging HUD. Statusbar control that
 * pages `activeBankIndex` (stores/midi.ts) via the store's `bankPageLeft` /
 * `bankPageRight` actions and shows the current page as "Bank N/MAX".
 *
 * WHY THIS IS A CLICKABLE UI CONTROL AND NOT A LISTENER FOR THE PHYSICAL
 * MIDImix BANK L/R BUTTONS: per Akai's own support article ("Why Aren't The
 * Bank Buttons Sending Any MIDI Data?", support.akaipro.com), those buttons
 * do NOT transmit MIDI — they silently shift what CC numbers the
 * controller's OWN knobs/faders send, entirely inside the hardware. There is
 * no note/CC byte `handleMIDIMessage` (stores/midi.ts) could ever see for
 * them. So the L/R paging control lives here instead, as a normal clickable
 * pair — same "page the active bank" concept H2's bankAssignments model
 * needs, just triggered by a UI click rather than a MIDI message. See
 * bankTypes.ts MAX_BANK_PAGES doc for the full paging model.
 *
 * Hidden entirely when no ccBankBindings exist — mirrors MappingContextChip's
 * "nothing to show" pattern (kind === 'none' → null) so an unconfigured
 * controller doesn't add statusbar clutter for a feature that isn't in use.
 */
import { useMIDIStore } from '../../stores/midi'
import { MAX_BANK_PAGES } from '../../../shared/bankTypes'

export default function BankPagingHUD() {
  const ccBankBindings = useMIDIStore((s) => s.ccBankBindings)
  const activeBankIndex = useMIDIStore((s) => s.activeBankIndex)
  const bankPageLeft = useMIDIStore((s) => s.bankPageLeft)
  const bankPageRight = useMIDIStore((s) => s.bankPageRight)

  if (ccBankBindings.length === 0) return null

  const atStart = activeBankIndex === 0
  const atEnd = activeBankIndex === MAX_BANK_PAGES - 1

  return (
    <span
      className="status-bar__bank-hud"
      title="Active hardware bank page — pages the bankAssignments grid for the focused context"
      data-testid="statusbar-bank-hud"
      data-bank-index={activeBankIndex}
    >
      <button
        type="button"
        className="status-bar__bank-hud-btn"
        data-testid="statusbar-bank-hud-left"
        aria-label="Page bank left"
        disabled={atStart}
        onClick={bankPageLeft}
      >
        ◀
      </button>
      <span className="status-bar__bank-hud-label">
        Bank {activeBankIndex + 1}/{MAX_BANK_PAGES}
      </span>
      <button
        type="button"
        className="status-bar__bank-hud-btn"
        data-testid="statusbar-bank-hud-right"
        aria-label="Page bank right"
        disabled={atEnd}
        onClick={bankPageRight}
      >
        ▶
      </button>
    </span>
  )
}
