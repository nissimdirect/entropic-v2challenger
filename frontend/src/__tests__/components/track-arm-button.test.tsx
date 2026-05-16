/**
 * Track Arm button label tests — F-0516-10.
 *
 * Parallel session UAT 2026-05-16 filed F-0516-10: the track arm button was
 * labeled "A", which conflicts with the user mental model — in every major
 * DAW (Logic, Ableton, Pro Tools, Reaper) "R" is the record-arm convention.
 * "A" suggests Automation (which is what 'a' keyboard shortcut toggles).
 *
 * This locks the label as "R" with a descriptive aria-label so the change
 * cannot regress back to "A" silently.
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

describe('Track Arm button — F-0516-10 (label should be "R" not "A")', () => {
  it('arm button text is "R" (DAW record-arm convention)', () => {
    const t = trackForArmTests()
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const armBtn = container.querySelector('.track-header__auto-btn') as HTMLElement
    expect(armBtn).toBeTruthy()
    expect(armBtn.textContent).toBe('R')
    // The visual label MUST NOT collide with the timeline 'a' shortcut for
    // toggle_automation. "A" was the old label; assert it is gone.
    expect(armBtn.textContent).not.toBe('A')
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
    // Text stays "R" — only the aria-label + title flip.
    expect(armBtn.textContent).toBe('R')
  })

  it('arm button has --active modifier class when armed', () => {
    const t = trackForArmTests()
    useAutomationStore.setState({ armedTrackId: t.id })
    const { container } = render(<TrackHeader track={t} isSelected={false} />)
    const armBtn = container.querySelector('.track-header__auto-btn') as HTMLElement
    expect(armBtn.className).toContain('track-header__auto-btn--active')
  })
})
