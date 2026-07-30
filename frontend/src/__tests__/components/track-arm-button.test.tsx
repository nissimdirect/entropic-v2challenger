/**
 * Track Arm button label tests — F-0516-10, superseded by PK.H2 R-collision
 * resolution (openspec/changes/ui-foundation/proposal.md, CONVENTION-GROUNDED
 * MANIFEST v4, "R = Read-mode (AutomationToolbar.tsx) AND arm-recording
 * (Track.tsx:438) — record-arm becomes the filled dot, resolving it").
 *
 * F-0516-10's real requirement was semantic, not glyph-literal: the arm
 * button must not read as "Automation" (that's what the 'a' shortcut and the
 * automation Read-mode "R" already mean) — it locked the text "R" as the fix
 * available at the time. The manifest identified that literal "R" now
 * COLLIDES with automation Read-mode's own "R", so PK.H2 replaces the text
 * glyph with a filled/outline record dot (Pro Tools/Logic convention) while
 * keeping the aria-label/title wording that actually carries F-0516-10's
 * intent — this file's assertions moved from textContent to those.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// Mock entropic + zustand stores BEFORE importing Track.
const mockEntropic = {
  sendCommand: () => Promise.resolve({ ok: true }),
  onEngineStatus: () => () => {},
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { TrackHeader } from '../../renderer/components/timeline/Track'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useAutomationStore } from '../../renderer/stores/automation'

beforeEach(() => {
  useTimelineStore.getState().reset()
  useAutomationStore.getState().resetAutomation()
})

afterEach(() => {
  cleanup()
})

function trackForArmTests() {
  useTimelineStore.getState().addTrack('Track 1', '#ff0000')
  const t = useTimelineStore.getState().tracks[0]
  return t
}

describe('Track Arm button — F-0516-10 / PK.H2 R-collision resolution', () => {
  it('arm button renders the record-dot glyph, never bare "R" or "A" text (R-collision + F-0516-10 regression guards)', () => {
    const t = trackForArmTests()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const armBtn = container.querySelector('.track-header__auto-btn') as HTMLElement
    expect(armBtn).toBeTruthy()
    // No bare-letter regression either direction: "A" is the old mislabel
    // (F-0516-10); "R" is now automation Read-mode's glyph exclusively
    // (AutomationToolbar.tsx) — the arm button must never render either as
    // its own text content, only the record-dot icon.
    expect(armBtn.textContent).not.toBe('A')
    expect(armBtn.textContent).not.toBe('R')
    expect(armBtn.querySelector('svg')).toBeTruthy()
  })

  it('arm button has aria-label describing the action (accessibility)', () => {
    const t = trackForArmTests()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const armBtn = container.querySelector('.track-header__auto-btn') as HTMLElement
    const aria = armBtn.getAttribute('aria-label') ?? ''
    expect(aria.toLowerCase()).toContain('automation')
    // When unarmed: "Arm for automation recording"
    expect(aria.toLowerCase()).toMatch(/^arm /)
  })

  it('aria-label flips when track becomes armed', () => {
    const t = trackForArmTests()
    useAutomationStore.setState({ armedTrackId: t.id })
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const armBtn = container.querySelector('.track-header__auto-btn') as HTMLElement
    expect(armBtn.getAttribute('aria-label')).toMatch(/^Disarm /)
    // Glyph stays the record-dot icon (filled when armed) — only the
    // aria-label + title flip; asserted via the `filled` prop's visible
    // effect (a filled <circle>) rather than textContent.
    expect(armBtn.querySelector('circle[fill="currentColor"]')).toBeTruthy()
  })

  it('arm button has --active modifier class when armed', () => {
    const t = trackForArmTests()
    useAutomationStore.setState({ armedTrackId: t.id })
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const armBtn = container.querySelector('.track-header__auto-btn') as HTMLElement
    expect(armBtn.className).toContain('track-header__auto-btn--active')
  })
})
