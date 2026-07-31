/**
 * qf4-inspector-track-hypothesis.test.tsx — verifies (or falsifies)
 * team-lead's reframed QF4 hypothesis: the owner never deleted a track at
 * all. "Track 3" was almost certainly the INSPECTOR track created via the
 * (now-removed, QF6) "+ Inspector" button — a real, selected, EXISTING
 * track whose timeline presence the owner didn't recognize as a track row,
 * not a stale-selection leak.
 *
 * Falsifiable claim under test: does InspectorTrackHeader render a normal,
 * legible row in the tracks column (color swatch + name + controls, same
 * as any other track), or does it render somewhere unexpected / illegible
 * — which would explain "the timeline showed only Track 4 + MASTER" while
 * LayerPanel/status bar showed "Track 3" (a track that IS selected and
 * DOES exist, just not visually recognized).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from './helpers/mock-entropic'
import Timeline from '../renderer/components/timeline/Timeline'
import LayerPanel from '../renderer/components/timeline/LayerPanel'
import MappingContextChip from '../renderer/components/layout/MappingContextChip'
import { useTimelineStore } from '../renderer/stores/timeline'

beforeEach(() => {
  setupMockEntropic()
  useTimelineStore.getState().reset()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('QF4 reframed hypothesis — the Inspector track, not a deletion leak', () => {
  it('an Inspector track renders a normal, legible header row in the tracks column, sized/styled like every other track', () => {
    // Reproduce the owner's likely sequence: some regular tracks, then an
    // Inspector track created via the (pre-QF6) "+ Inspector" affordance,
    // renamed to "Track 3" — addInspectorTrack defaults to "Inspector",
    // but the header supports rename (double-click), and the owner's own
    // description used "Track 3", so match that exact scenario.
    useTimelineStore.getState().addTrack('Track 1', '#ef4444')
    useTimelineStore.getState().addTrack('Track 2', '#f59e0b')
    const inspectorId = useTimelineStore.getState().addInspectorTrack()!
    useTimelineStore.getState().renameTrack(inspectorId, 'Track 3')
    useTimelineStore.getState().addTrack('Track 4', '#3b82f6')
    // addTrack/addInspectorTrack auto-select on first add only; make the
    // inspector track the current selection explicitly, matching "the
    // owner had it selected."
    useTimelineStore.getState().selectTrack(inspectorId)

    const { container } = render(<Timeline onSeek={() => {}} />)

    // THE CORE CLAIM: does the inspector track have ITS OWN header row,
    // findable and legible, in the SAME tracks column as every other track?
    const inspectorHeader = container.querySelector('[data-track-type="inspector"].track-header')
    expect(inspectorHeader).toBeTruthy()
    expect(inspectorHeader!.textContent).toContain('Track 3')

    // Compare its rendered geometry/classing to a normal track header — if
    // the hypothesis "no obvious visual indication" were literally true,
    // we'd expect this row to be missing, zero-height, or lack the shared
    // .track-header base class other rows use. It does NOT lack it.
    expect(inspectorHeader!.classList.contains('track-header')).toBe(true)
    const regularHeader = container.querySelector('[data-testid="lean-track-header"]')
    expect(regularHeader).toBeTruthy()

    // Count every row in the tracks column — Track 1, Track 2, Track 3
    // (inspector), Track 4 = 4 (no Master in this test — addMasterTrack
    // was never called). If the inspector row silently failed to render,
    // this would be 3. `.children` (a DOM property), not
    // `querySelectorAll('.foo > *')` — the latter does not behave as a
    // direct-child-only match under happy-dom (confirmed empirically: it
    // returns every descendant, not just direct children).
    const tracksColumn = container.querySelector('.timeline__track-headers')!
    expect(tracksColumn.children.length).toBe(4)

    // Where in DOM order does it land? Timeline.tsx renders orderedTracks
    // in STORE ARRAY ORDER — the inspector track is NOT special-cased to
    // hide or reorder; it sits exactly where it was added (3rd).
    const rowTypes = Array.from(tracksColumn.children).map((el) => el.getAttribute('data-track-type') ?? 'video')
    expect(rowTypes).toEqual(['video', 'video', 'inspector', 'video'])
  })

  it('LayerPanel and the status-bar chip show the Inspector track\'s name while it is selected — matching what the owner reported, because it IS the selected, EXISTING track', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ef4444')
    const inspectorId = useTimelineStore.getState().addInspectorTrack()!
    useTimelineStore.getState().renameTrack(inspectorId, 'Track 3')
    useTimelineStore.getState().selectTrack(inspectorId)

    render(
      <>
        <LayerPanel />
        <MappingContextChip />
      </>,
    )

    // LayerPanel's header ALWAYS shows "LAYER — {track.name}" regardless of
    // track type (no inspector-specific branch skips the name) — so it
    // correctly and unsurprisingly shows "Track 3" here. This is not a
    // leak: the track is genuinely selected and genuinely named that.
    expect(screen.getByTestId('layer-panel-name').textContent).toContain('Track 3')
    expect(screen.getByTestId('statusbar-mapping-context-chip').textContent).toContain('Track 3')
  })

  it('an Inspector track has NO clip lane content, unlike a normal video track — a real paradigm gap, not a bug: its row exists but reads differently once you look closely', () => {
    useTimelineStore.getState().addTrack('Track 1', '#ef4444')
    const inspectorId = useTimelineStore.getState().addInspectorTrack()!
    useTimelineStore.getState().renameTrack(inspectorId, 'Track 3')

    const { container } = render(<Timeline onSeek={() => {}} />)
    const inspectorLane = container.querySelector('[data-track-type="inspector"].inspector-track-lane')
    expect(inspectorLane).toBeTruthy()
    // No clips, ever — matches Master's "no clips" design but for a
    // DIFFERENT reason (probes, not a bus) — and unlike Master, an
    // inspector row otherwise looks like a normal track header. The
    // probe-empty hint is a QUIET, easy-to-miss row, not a "TRACK" label.
    expect(inspectorLane!.querySelector('.clip')).toBeNull()
    expect(container.querySelector('[data-testid="inspector-track-lane-empty"]')).toBeTruthy()
  })
})
