/**
 * PK.C1 (W1.5b, C2 mock ruling — artifact cf8ac3c1 "draw-omitted-overdub-truth",
 * RATIFIED-FOUNDATIONS.md D13): the automation Mode selector + Overdub toggle
 * moved from AutomationToolbar.tsx into the transport bar (App.tsx), attached
 * to the playback cluster. This locks:
 *   - full-word Read/Touch/Latch chips in that DOM order (owner: single
 *     letters were cryptic)
 *   - Draw is never offered here (owner ruling — stays a lane-level pencil),
 *     and when the store's mode is 'draw' none of the three chips light up
 *     (never crashes, never coerces the store value)
 *   - Overdub sits beside the mode selector, wired to the same store action
 *   - hover text (title) matches COMPONENT-SPEC §2½'s legend verbatim
 *   - the old transport-bar timecode is gone; a new one lives under the
 *     preview window with the same current/total format
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

describe('Transport bar — automation cluster (PK.C1)', () => {
  it('renders exactly 3 mode chips, full words, in Read/Touch/Latch order', async () => {
    const container = await renderShell()
    const cluster = container.querySelector('[data-testid="transport-automation-cluster"]')
    expect(cluster).toBeTruthy()
    const chips = cluster!.querySelectorAll('[data-testid^="automation-mode-"]')
    expect(chips).toHaveLength(3)
    expect(Array.from(chips).map((c) => c.textContent)).toEqual(['Read', 'Touch', 'Latch'])
    expect(container.querySelector('[data-testid="automation-mode-read"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="automation-mode-touch"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="automation-mode-latch"]')).toBeTruthy()
    // Draw is never offered as a transport chip.
    expect(container.querySelector('[data-testid="automation-mode-draw"]')).toBeNull()
  })

  it('default mode "read" is the only lit chip', async () => {
    const container = await renderShell()
    expect(useAutomationStore.getState().mode).toBe('read')
    const read = container.querySelector('[data-testid="automation-mode-read"]')!
    const touch = container.querySelector('[data-testid="automation-mode-touch"]')!
    const latch = container.querySelector('[data-testid="automation-mode-latch"]')!
    expect(read.className).toContain('app__transport-automation-btn--active')
    expect(touch.className).not.toContain('app__transport-automation-btn--active')
    expect(latch.className).not.toContain('app__transport-automation-btn--active')
  })

  it('clicking Touch/Latch sets the store mode and moves the lit chip', async () => {
    const container = await renderShell()
    const touch = container.querySelector('[data-testid="automation-mode-touch"]') as HTMLElement
    fireEvent.click(touch)
    expect(useAutomationStore.getState().mode).toBe('touch')
    expect(touch.className).toContain('app__transport-automation-btn--active')

    const latch = container.querySelector('[data-testid="automation-mode-latch"]') as HTMLElement
    fireEvent.click(latch)
    expect(useAutomationStore.getState().mode).toBe('latch')
    expect(latch.className).toContain('app__transport-automation-btn--active')
    expect(touch.className).not.toContain('app__transport-automation-btn--active')
  })

  it('when the store mode is "draw" (set via lane UI), no transport chip is lit — never crashes', async () => {
    const container = await renderShell()
    act(() => {
      useAutomationStore.setState({ mode: 'draw' })
    })
    const read = container.querySelector('[data-testid="automation-mode-read"]')!
    const touch = container.querySelector('[data-testid="automation-mode-touch"]')!
    const latch = container.querySelector('[data-testid="automation-mode-latch"]')!
    expect(read.className).not.toContain('app__transport-automation-btn--active')
    expect(touch.className).not.toContain('app__transport-automation-btn--active')
    expect(latch.className).not.toContain('app__transport-automation-btn--active')
    // The store value itself is untouched — the transport never coerces it.
    expect(useAutomationStore.getState().mode).toBe('draw')
  })

  it('renders the Overdub toggle beside the mode selector, wired to setRecordMode', async () => {
    const container = await renderShell()
    const btn = container.querySelector('[data-testid="overdub-toggle"]') as HTMLElement
    expect(btn).toBeTruthy()
    expect(btn.textContent).toBe('Overdub')
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(btn)
    expect(useAutomationStore.getState().recordMode).toBe('overdub')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.className).toContain('app__transport-automation-btn--active')

    fireEvent.click(btn)
    expect(useAutomationStore.getState().recordMode).toBe('replace')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('hover text matches COMPONENT-SPEC §2½\'s legend verbatim', async () => {
    const container = await renderShell()
    expect(container.querySelector('[data-testid="automation-mode-read"]')!.getAttribute('title'))
      .toBe('Playback only — knob moves are not recorded.')
    expect(container.querySelector('[data-testid="automation-mode-touch"]')!.getAttribute('title'))
      .toBe('Writes only while you hold the knob — release snaps back to the existing curve.')
    expect(container.querySelector('[data-testid="automation-mode-latch"]')!.getAttribute('title'))
      .toBe('Starts writing at first touch and keeps writing until you stop playback.')
    expect(container.querySelector('[data-testid="overdub-toggle"]')!.getAttribute('title'))
      .toBe('ON: new points weave into the existing curve without erasing it. OFF: recording replaces the curve where you write.')
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
