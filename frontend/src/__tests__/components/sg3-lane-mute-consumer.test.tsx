/**
 * Audit medium #1 — SG-3 clause-3: wire the dead `sg3AbortedLaneIds` flag to
 * real consumers so it is no longer write-only.
 *
 * Two consumers are proven here:
 *   1. LaneBadges (Track.tsx) renders a MUTED badge + dims the AUTO badge when
 *      the abort set is non-empty AND the track carries an automation lane.
 *   2. The render-frame chain build (App.tsx) suppresses automation lane
 *      payloads while the set is non-empty — the corrupt automation is no
 *      longer re-sent every frame. lane_id is always "unknown", so a non-empty
 *      set globally suppresses automation; a real lane_id also filters by id.
 *
 * The chain-skip is exercised via the exact filter predicate App.tsx applies to
 * `getAllLanes()` before building autoOverrides / axisLanes payloads.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { AutomationLane } from '../../shared/types'
import { useAutomationStore } from '../../renderer/stores/automation'
import { LaneBadges } from '../../renderer/components/timeline/Track'

function makeAutoLane(id: string): AutomationLane {
  return {
    id,
    paramPath: 'fx-1.amount',
    color: '#4ade80',
    isVisible: true,
    points: [{ time: 0, value: 0, curve: 0 }],
    mode: 'smooth', // non-trigger → counts as an automation lane
  }
}

// Mirror of the chain-skip predicate in App.tsx requestRenderFrame. If App's
// predicate changes, this MUST change with it — it is the documented behavior
// the consumer relies on. Keeping it here lets us assert the chain build drops
// aborted lanes without spinning up the full Electron render loop.
function chainLanesAfterSg3Filter(): AutomationLane[] {
  const rawLanes = useAutomationStore.getState().getAllLanes()
  const sg3Aborted = useAutomationStore.getState().sg3AbortedLaneIds
  return sg3Aborted.size > 0
    ? rawLanes.filter((l) => !sg3Aborted.has(l.id) && !sg3Aborted.has('unknown'))
    : rawLanes
}

beforeEach(() => {
  useAutomationStore.getState().resetAutomation()
  useAutomationStore.getState().loadAutomation({ 'track-1': [makeAutoLane('auto-lane-1')] })
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Consumer 1: badge renders MUTED when the set is non-empty
// ---------------------------------------------------------------------------

describe('badge renders muted state from sg3AbortedLaneIds', () => {
  it('no MUTED badge when the abort set is empty', () => {
    render(<LaneBadges trackId="track-1" />)
    expect(screen.getByText('AUTO')).toBeInTheDocument()
    expect(screen.queryByText('MUTED')).not.toBeInTheDocument()
  })

  it('renders MUTED badge when an SG-3 abort is active', () => {
    useAutomationStore.getState().markSg3Aborted('unknown')
    render(<LaneBadges trackId="track-1" />)
    expect(screen.getByText('MUTED')).toBeInTheDocument()
  })

  it('dims the badge row (muted modifier class) when active', () => {
    useAutomationStore.getState().markSg3Aborted('unknown')
    const { container } = render(<LaneBadges trackId="track-1" />)
    expect(container.querySelector('.track-header__badges--muted')).not.toBeNull()
  })

  it('does NOT show MUTED on a track with no automation lane', () => {
    useAutomationStore.getState().resetAutomation()
    // track-2 has no lanes at all → LaneBadges renders null
    useAutomationStore.getState().markSg3Aborted('unknown')
    const { container } = render(<LaneBadges trackId="track-2" />)
    expect(container.querySelector('.track-header__badge--muted')).toBeNull()
  })

  it('clearing the abort removes the MUTED badge', () => {
    useAutomationStore.getState().markSg3Aborted('unknown')
    const { rerender } = render(<LaneBadges trackId="track-1" />)
    expect(screen.getByText('MUTED')).toBeInTheDocument()
    useAutomationStore.getState().clearAllSg3Aborts()
    rerender(<LaneBadges trackId="track-1" />)
    expect(screen.queryByText('MUTED')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Consumer 2: chain build skips aborted automation lanes
// ---------------------------------------------------------------------------

describe('chain build skips aborted automation lanes', () => {
  it('sends all lanes when no abort is active', () => {
    expect(chainLanesAfterSg3Filter().map((l) => l.id)).toEqual(['auto-lane-1'])
  })

  it('suppresses ALL automation lanes when lane_id is "unknown" (global abort)', () => {
    useAutomationStore.getState().markSg3Aborted('unknown')
    expect(chainLanesAfterSg3Filter()).toHaveLength(0)
  })

  it('filters the specific lane by id when a real lane_id is reported', () => {
    useAutomationStore.getState().loadAutomation({
      'track-1': [makeAutoLane('auto-lane-1'), makeAutoLane('auto-lane-2')],
    })
    useAutomationStore.getState().markSg3Aborted('auto-lane-1')
    expect(chainLanesAfterSg3Filter().map((l) => l.id)).toEqual(['auto-lane-2'])
  })

  it('restores lanes to the chain after the abort is cleared', () => {
    useAutomationStore.getState().markSg3Aborted('unknown')
    expect(chainLanesAfterSg3Filter()).toHaveLength(0)
    useAutomationStore.getState().clearAllSg3Aborts()
    expect(chainLanesAfterSg3Filter().map((l) => l.id)).toEqual(['auto-lane-1'])
  })
})
