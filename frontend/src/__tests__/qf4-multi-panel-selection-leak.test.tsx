/**
 * qf4-multi-panel-selection-leak.test.tsx — adjudication test requested by
 * team-lead after the QF4 store-level fix (armedTrackId leak) shipped: the
 * owner's ACTUAL repro was stale "Track 3" surviving in the LayerPanel, the
 * Inspector's TRACK state, and the status bar's mapping-context chip — all
 * THREE derive from `useTimelineStore.selectedTrackId`, not
 * `useAutomationStore.armedTrackId`. If selectedTrackId is genuinely cleared
 * by removeTrack (proven separately in w15a-owner-walk.test.tsx / QF4), none
 * of these three panels should ever show a deleted track — this test proves
 * that end-to-end, through the REAL interaction path (right-click header →
 * click "Delete Track" in the actual ContextMenu), not a direct store call.
 *
 * Harness note: TrackHeader takes `track` as a PROP, not a live by-id
 * subscription — in production, Timeline.tsx re-derives which TrackHeaders
 * to render every render from the live `tracks` array (`orderedTracks.map`),
 * so a deleted track's header simply stops being rendered. `Harness` below
 * mirrors that exact pattern (conditional render off a live store
 * subscription) instead of passing a static `track` object, so this test
 * doesn't manufacture a false "stale header" failure that Timeline.tsx's
 * real behavior would never produce.
 *
 * FINDING while building this test: right-clicking a track header selects
 * it as a side effect BEFORE the menu opens (Track.tsx's handleContextMenu
 * calls selectTrack(track.id) first) — so "delete an unselected track via
 * right-click" isn't a reachable real-UI scenario; right-clicking makes it
 * selected. The store-level "delete unselected track preserves selection"
 * invariant (a caller that invokes removeTrack directly, bypassing the
 * context menu) is already covered in w15a-owner-walk.test.tsx and isn't
 * duplicated here — this file's second test instead covers the real-UI
 * equivalent: deleting a DIFFERENT track than the one currently selected,
 * through the actual right-click-then-select-then-delete sequence.
 *
 * Per team-lead's instruction: this test is written so that reverting the
 * QF4 armedTrackId fix should NOT make it fail (selection clearing is a
 * SEPARATE code path from the arm-state leak the QF4 store fix addressed —
 * proven explicitly in the third describe block below).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from './helpers/mock-entropic'
import { TrackHeader } from '../renderer/components/timeline/Track'
import LayerPanel from '../renderer/components/timeline/LayerPanel'
import Inspector from '../renderer/components/inspector/Inspector'
import MappingContextChip from '../renderer/components/layout/MappingContextChip'
import { useTimelineStore } from '../renderer/stores/timeline'
import { useAutomationStore } from '../renderer/stores/automation'

beforeEach(() => {
  setupMockEntropic()
  useTimelineStore.getState().reset()
  useAutomationStore.getState().resetAutomation()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

/** Mirrors Timeline.tsx's real `orderedTracks.map(...)` pattern: re-derives
 * the track from a LIVE store subscription every render, and renders
 * nothing once it's gone — exactly what happens to a deleted track's header
 * in production, never a stale prop snapshot. */
function Harness({ trackId }: { trackId: string }) {
  const track = useTimelineStore((s) => s.tracks.find((t) => t.id === trackId))
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  return (
    <>
      {track && <TrackHeader track={track} isSelected={track.id === selectedTrackId} />}
      <LayerPanel />
      <Inspector />
      <MappingContextChip />
    </>
  )
}

function openContextMenuAndDelete(container: HTMLElement) {
  const header = container.querySelector('[data-testid="lean-track-header"]')!
  fireEvent.contextMenu(header)
  const deleteBtn = screen.getAllByRole('menuitem').find((el) => el.textContent?.startsWith('Delete Track'))
  expect(deleteBtn).toBeTruthy()
  fireEvent.click(deleteBtn!)
}

describe('QF4 adjudication — LayerPanel / Inspector / status-bar chip after deleting a track via the real context menu', () => {
  it('all three panels clear after right-click -> "Delete Track" on the currently-selected track', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ef4444')
    useTimelineStore.getState().addTrack('Track 2', '#f59e0b')
    const t3Id = useTimelineStore.getState().addTrack('Track 3', '#4ade80')!
    useTimelineStore.getState().selectTrack(t3Id)

    const { container } = render(<Harness trackId={t3Id} />)

    // Sanity: all three panels DO show Track 3 before deletion (proves the
    // harness is wired correctly — a false negative here would invalidate
    // the rest of the test).
    expect(screen.getByTestId('layer-panel-name').textContent).toContain('Track 3')
    expect(screen.getByTestId('inspector-track-name').textContent).toBe('Track 3')
    expect(screen.getByTestId('statusbar-mapping-context-chip').textContent).toContain('Track 3')

    openContextMenuAndDelete(container)

    expect(useTimelineStore.getState().selectedTrackId).toBeNull()
    expect(useTimelineStore.getState().tracks.some((t) => t.id === t3Id)).toBe(false)

    // The three panels the owner actually reported as stale.
    expect(screen.getByTestId('layer-panel-empty')).toBeTruthy()
    expect(screen.queryByTestId('layer-panel')).toBeNull()
    expect(screen.queryByTestId('inspector-state-track')).toBeNull()
    expect(screen.queryByTestId('statusbar-mapping-context-chip')).toBeNull()
    // The deleted track's own header is gone too (Harness mirrors
    // Timeline.tsx's real conditional-render-off-the-live-array behavior).
    expect(container.querySelector('[data-testid="lean-track-header"]')).toBeNull()
  })

  it('deleting a DIFFERENT track (via the real right-click, which selects it first) correctly drops the PREVIOUSLY selected track from all three panels', () => {
    const t1Id = useTimelineStore.getState().addTrack('Track 1', '#ef4444')!
    useTimelineStore.getState().addTrack('Track 2', '#f59e0b')
    const t3Id = useTimelineStore.getState().addTrack('Track 3', '#4ade80')!
    useTimelineStore.getState().selectTrack(t3Id)

    // Render BOTH headers so right-clicking Track 1 is a real, available
    // interaction — Track 3 stays the store's selectedTrackId until the
    // right-click on Track 1 flips it (Track.tsx's handleContextMenu).
    function TwoTrackHarness() {
      const t1 = useTimelineStore((s) => s.tracks.find((t) => t.id === t1Id))
      const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
      return (
        <>
          {t1 && <TrackHeader track={t1} isSelected={t1.id === selectedTrackId} />}
          <LayerPanel />
          <Inspector />
          <MappingContextChip />
        </>
      )
    }
    const { container } = render(<TwoTrackHarness />)
    expect(screen.getByTestId('layer-panel-name').textContent).toContain('Track 3')

    // Right-clicking Track 1's header selects IT (documented finding above),
    // then "Delete Track" removes Track 1 — Track 3 (the prior selection)
    // is gone from the store's selectedTrackId as a result, same as if the
    // user had clicked Track 1 first and then deleted it. This is the real
    // reachable equivalent of "the previously-inspected track's panels
    // don't linger after some OTHER track claims focus and gets deleted."
    openContextMenuAndDelete(container)

    expect(useTimelineStore.getState().tracks.some((t) => t.id === t1Id)).toBe(false)
    expect(useTimelineStore.getState().selectedTrackId).toBeNull()
    expect(screen.queryByTestId('inspector-state-track')).toBeNull()
    expect(screen.queryByTestId('statusbar-mapping-context-chip')).toBeNull()
    // Track 3 (still alive, just no longer selected) must not linger either.
    expect(container.textContent).not.toContain('Track 3')
  })
})

describe('QF4 adjudication — the selection-clearing behavior above is independent of the armedTrackId fix', () => {
  it('arming a DIFFERENT, still-alive track does not change the panels-clear outcome, and armedTrackId itself is untouched', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ef4444')
    const t3Id = useTimelineStore.getState().addTrack('Track 3', '#4ade80')!
    useTimelineStore.getState().selectTrack(t3Id)
    // Deliberately arm the OTHER, surviving track — proves this test's
    // pass/fail has nothing to do with QF4's armedTrackId leak fix.
    const t1Id = useTimelineStore.getState().tracks[0].id
    useAutomationStore.getState().armTrack(t1Id)

    const { container } = render(<Harness trackId={t3Id} />)
    openContextMenuAndDelete(container)

    expect(useTimelineStore.getState().selectedTrackId).toBeNull()
    expect(screen.queryByTestId('inspector-state-track')).toBeNull()
    expect(screen.queryByTestId('statusbar-mapping-context-chip')).toBeNull()
    expect(useAutomationStore.getState().armedTrackId).toBe(t1Id)
  })
})
