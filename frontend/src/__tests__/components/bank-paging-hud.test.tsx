/**
 * H7 (2026-07-02 master-tuneup WS5) — BankPagingHUD tests.
 *
 * The HUD is the VISIBLE consumer of stores/midi.ts's activeBankIndex
 * paging actions (anti-dead-flag — pairs with bank-paging.test.ts's
 * store/resolver coverage). Covers hidden-when-unused, label rendering, and
 * that clicking L/R actually calls the store actions and re-renders with
 * the new page (clamped at the rails).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'

// Mock window.entropic before store imports (Electron preload dependency).
;(globalThis as any).window = {
  entropic: {
    onEngineStatus: () => {},
    sendCommand: async () => ({ ok: true }),
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => {},
  },
}

import { useMIDIStore } from '../../renderer/stores/midi'
import BankPagingHUD from '../../renderer/components/layout/BankPagingHUD'
import { MAX_BANK_PAGES } from '../../shared/bankTypes'

function resetStores() {
  useMIDIStore.getState().resetMIDI()
}

beforeEach(() => {
  resetStores()
  cleanup()
})

describe('BankPagingHUD — hidden when unused', () => {
  it('renders nothing when there are no ccBankBindings', () => {
    const { queryByTestId } = render(<BankPagingHUD />)
    expect(queryByTestId('statusbar-bank-hud')).toBeNull()
  })
})

describe('BankPagingHUD — visible with bank bindings', () => {
  beforeEach(() => {
    useMIDIStore.getState().setCCBankBinding(40, { row: 0, col: 0 })
  })

  it('shows "Bank 1/N" at page 0 with left disabled, right enabled', () => {
    const { getByTestId } = render(<BankPagingHUD />)
    const hud = getByTestId('statusbar-bank-hud')
    expect(hud.getAttribute('data-bank-index')).toBe('0')
    expect(hud.textContent).toContain(`Bank 1/${MAX_BANK_PAGES}`)
    expect(getByTestId('statusbar-bank-hud-left')).toBeDisabled()
    expect(getByTestId('statusbar-bank-hud-right')).not.toBeDisabled()
  })

  it('clicking right pages forward and updates the label', () => {
    const { getByTestId } = render(<BankPagingHUD />)
    fireEvent.click(getByTestId('statusbar-bank-hud-right'))
    expect(useMIDIStore.getState().activeBankIndex).toBe(1)
    expect(getByTestId('statusbar-bank-hud').textContent).toContain(`Bank 2/${MAX_BANK_PAGES}`)
  })

  it('clicking right repeatedly clamps at the last page and disables the right button', () => {
    const { getByTestId } = render(<BankPagingHUD />)
    const rightBtn = getByTestId('statusbar-bank-hud-right')
    for (let i = 0; i < MAX_BANK_PAGES + 3; i++) fireEvent.click(rightBtn)
    expect(useMIDIStore.getState().activeBankIndex).toBe(MAX_BANK_PAGES - 1)
    expect(getByTestId('statusbar-bank-hud').textContent).toContain(`Bank ${MAX_BANK_PAGES}/${MAX_BANK_PAGES}`)
    expect(getByTestId('statusbar-bank-hud-right')).toBeDisabled()
  })

  it('clicking left at page 0 is a no-op (clamped, not wrapped)', () => {
    const { getByTestId } = render(<BankPagingHUD />)
    fireEvent.click(getByTestId('statusbar-bank-hud-left'))
    expect(useMIDIStore.getState().activeBankIndex).toBe(0)
    expect(getByTestId('statusbar-bank-hud').textContent).toContain(`Bank 1/${MAX_BANK_PAGES}`)
  })
})
