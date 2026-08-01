/**
 * D13.1 (W1.5b, C2 ROUND-2 owner ruling, live walk-through 2026-08-01,
 * RATIFIED-FOUNDATIONS.md D13.1): the transport bar's automation Mode
 * selector is now ONE dropdown (was a fused 3-chip segmented control,
 * D13/PK.C1) and the Overdub toggle is now a cycling 3-state glyph — Replace
 * / Overdub / Add (was a boolean text chip). This locks:
 *   - ONE `automation-mode-select` dropdown, Read/Touch/Latch options in
 *     that order (owner: "since they're mutually exclusive I think that it
 *     should be a drop down")
 *   - Draw is never an option (owner ruling carried over from D13 — stays a
 *     lane-level pencil); when the store's mode is 'draw' the dropdown's
 *     CLOSED display falls back to a blank state (never crashes, never
 *     coerces the store value to a real mode)
 *   - ONE `write-mode-toggle` glyph beside the mode selector, cycling
 *     Replace -> Overdub -> Add -> Replace on click (owner: "like a record
 *     button but hollowed out... adjacent to the arm glyph")
 *   - hover text (title) + aria-label match D13.1's legend verbatim
 *   - the retired testids (automation-mode-{read|touch|latch}, overdub-
 *     toggle) are gone
 *   - the old transport-bar timecode is still gone; the preview-window one
 *     from D13/PK.C1 is untouched by this round
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import { useAutomationStore } from '../../renderer/stores/automation'

beforeEach(() => {
  setupMockEntropic({ onMenuAction: () => () => {} })
  // The automation store is a module-level singleton — reset it so mode/
  // recordMode from one test never leaks into the next.
  useAutomationStore.getState().resetAutomation()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

async function renderShell() {
  const { container } = render(<App />)
  await waitFor(() => {
    expect(container.querySelector('.app--creatrix')).toBeTruthy()
  })
  return container
}

describe('Transport bar — automation cluster (D13.1)', () => {
  it('renders exactly one mode dropdown with Read/Touch/Latch options, in that order', async () => {
    const container = await renderShell()
    const cluster = container.querySelector('[data-testid="transport-automation-cluster"]')
    expect(cluster).toBeTruthy()
    const select = cluster!.querySelector('[data-testid="automation-mode-select"]') as HTMLSelectElement
    expect(select).toBeTruthy()
    expect(select.tagName).toBe('SELECT')
    // The blank placeholder option (value="") plus the 3 real modes.
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toEqual(['', 'read', 'touch', 'latch'])
    const optionLabels = Array.from(select.options).filter((o) => o.value !== '').map((o) => o.textContent)
    expect(optionLabels).toEqual(['Read', 'Touch', 'Latch'])
    // Draw is never offered as a selectable option.
    expect(optionValues).not.toContain('draw')
  })

  it('default mode "read" is the dropdown\'s selected value', async () => {
    const container = await renderShell()
    expect(useAutomationStore.getState().mode).toBe('read')
    const select = container.querySelector('[data-testid="automation-mode-select"]') as HTMLSelectElement
    expect(select.value).toBe('read')
  })

  it('changing the dropdown sets the store mode', async () => {
    const container = await renderShell()
    const select = container.querySelector('[data-testid="automation-mode-select"]') as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'touch' } })
    expect(useAutomationStore.getState().mode).toBe('touch')
    expect(select.value).toBe('touch')

    fireEvent.change(select, { target: { value: 'latch' } })
    expect(useAutomationStore.getState().mode).toBe('latch')
    expect(select.value).toBe('latch')
  })

  it('when the store mode is "draw" (set via lane UI), the dropdown shows a blank value — never crashes, never coerces', async () => {
    const container = await renderShell()
    act(() => {
      useAutomationStore.setState({ mode: 'draw' })
    })
    const select = container.querySelector('[data-testid="automation-mode-select"]') as HTMLSelectElement
    expect(select.value).toBe('')
    // The store value itself is untouched — the dropdown never coerces it.
    expect(useAutomationStore.getState().mode).toBe('draw')
  })

  it('renders the write-mode glyph beside the mode selector, cycling Replace -> Overdub -> Add -> Replace', async () => {
    const container = await renderShell()
    const btn = container.querySelector('[data-testid="write-mode-toggle"]') as HTMLElement
    expect(btn).toBeTruthy()
    expect(useAutomationStore.getState().recordMode).toBe('replace')
    expect(btn.getAttribute('aria-label')).toBe('Write mode: Replace')

    fireEvent.click(btn)
    expect(useAutomationStore.getState().recordMode).toBe('overdub')
    expect(btn.getAttribute('aria-label')).toBe('Write mode: Overdub')

    fireEvent.click(btn)
    expect(useAutomationStore.getState().recordMode).toBe('add_lane')
    expect(btn.getAttribute('aria-label')).toBe('Write mode: Add')

    fireEvent.click(btn)
    expect(useAutomationStore.getState().recordMode).toBe('replace')
    expect(btn.getAttribute('aria-label')).toBe('Write mode: Replace')
  })

  it('the retired D13/PK.C1 testids are gone', async () => {
    const container = await renderShell()
    expect(container.querySelector('[data-testid="automation-mode-read"]')).toBeNull()
    expect(container.querySelector('[data-testid="automation-mode-touch"]')).toBeNull()
    expect(container.querySelector('[data-testid="automation-mode-latch"]')).toBeNull()
    expect(container.querySelector('[data-testid="overdub-toggle"]')).toBeNull()
  })

  it('hover text matches D13.1\'s legend verbatim, per mode and per write-mode state', async () => {
    const container = await renderShell()
    const select = container.querySelector('[data-testid="automation-mode-select"]') as HTMLSelectElement
    expect(select.getAttribute('title')).toBe('Playback only — knob moves are not recorded.')

    fireEvent.change(select, { target: { value: 'touch' } })
    expect(select.getAttribute('title')).toBe('Writes only while you hold the knob — release snaps back to the existing curve.')

    fireEvent.change(select, { target: { value: 'latch' } })
    expect(select.getAttribute('title')).toBe('Starts writing at first touch and keeps writing until you stop playback.')

    const writeBtn = container.querySelector('[data-testid="write-mode-toggle"]') as HTMLElement
    expect(writeBtn.getAttribute('title')).toBe('Recording replaces the curve where you write')

    fireEvent.click(writeBtn)
    expect(writeBtn.getAttribute('title')).toBe('New points weave into the existing curve without erasing it')

    fireEvent.click(writeBtn)
    expect(writeBtn.getAttribute('title')).toBe('Each recording pass goes to a NEW lane stacked on top (Add blend)')
  })

  it('play/stop/loop testids are preserved in the bar (W1-11 migration-by-testid)', async () => {
    const container = await renderShell()
    expect(container.querySelector('[data-testid="transport-play"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="transport-stop"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="transport-loop"]')).toBeTruthy()
  })
})

describe('Timecode — relocated under the preview window (PK.C1)', () => {
  it('the transport bar no longer contains a timecode element', async () => {
    const container = await renderShell()
    const bar = container.querySelector('.app__transport-bar')!
    expect(bar.querySelector('.app__transport-timecode')).toBeNull()
  })

  it('a preview-timecode element exists under the preview, same current/total format', async () => {
    const container = await renderShell()
    const tc = container.querySelector('[data-testid="preview-timecode"]')
    expect(tc).toBeTruthy()
    expect(tc!.textContent).toMatch(/^\d+:\d{2}\.\d\s\/\s\d+:\d{2}\.\d$/)
  })
})
