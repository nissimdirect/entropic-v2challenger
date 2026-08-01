/**
 * W1.5b PK.A1 oracle — GridOverlay component tests.
 *
 * Direct unit tests on GridOverlay (presence/height/absence) plus an
 * integration check mounting the real <Timeline> (same pattern as
 * timeline-ui.test.tsx) to prove the overlay is actually wired into the
 * tracks-scroll wrapper, not just correct in isolation.
 */
import { render, cleanup, fireEvent } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../../helpers/mock-entropic'
import { useTimelineStore } from '../../../renderer/stores/timeline'
import GridOverlay, { TRACK_ROW_HEIGHT_PX } from '../../../renderer/components/timeline/GridOverlay'
import Timeline from '../../../renderer/components/timeline/Timeline'
import { selectQuantizeGridLevel, snapTimeToGridLevel } from '../../../renderer/utils/quantize-grid'

describe('GridOverlay — direct', () => {
  afterEach(() => cleanup())

  test('renders with nonzero computed height when quantize is on, even with zero clips', () => {
    const { getByTestId } = render(
      <GridOverlay quantizeEnabled bpm={120} quantizeDivision={4} zoom={50} contentWidth={1000} rowCount={2} />,
    )
    const el = getByTestId('quantize-grid-overlay')
    expect(el).toBeTruthy()
    const height = Number((el as HTMLElement).style.height.replace('px', ''))
    expect(height).toBeGreaterThan(0)
    expect(height).toBe(2 * TRACK_ROW_HEIGHT_PX)
  })

  test('renders regardless of rowCount (selection-independent — no selectedTrackId prop even exists)', () => {
    const { getByTestId } = render(
      <GridOverlay quantizeEnabled bpm={120} quantizeDivision={4} zoom={50} contentWidth={1000} rowCount={5} />,
    )
    expect((getByTestId('quantize-grid-overlay') as HTMLElement).style.height).toBe(`${5 * TRACK_ROW_HEIGHT_PX}px`)
  })

  test('absent when quantize is off', () => {
    const { queryByTestId } = render(
      <GridOverlay quantizeEnabled={false} bpm={120} quantizeDivision={4} zoom={50} contentWidth={1000} rowCount={2} />,
    )
    expect(queryByTestId('quantize-grid-overlay')).toBeNull()
  })

  test('absent when bpm is missing/zero even if quantizeEnabled is true', () => {
    const { queryByTestId } = render(
      <GridOverlay quantizeEnabled bpm={undefined} quantizeDivision={4} zoom={50} contentWidth={1000} rowCount={2} />,
    )
    expect(queryByTestId('quantize-grid-overlay')).toBeNull()
  })

  test('background-image references only tokens (--cx-grid-*), never a raw hex — hex-ratchet parity', () => {
    const { getByTestId } = render(
      <GridOverlay quantizeEnabled bpm={120} quantizeDivision={4} zoom={50} contentWidth={1000} rowCount={2} />,
    )
    const bg = (getByTestId('quantize-grid-overlay') as HTMLElement).style.backgroundImage
    expect(bg).toContain('var(--cx-grid-bar)')
    expect(bg).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })

  test('4bar LOD renders at the fine (16-beat) spacing, not the bar (4-beat) spacing — GridOverlay.tsx single-layer branch', () => {
    const bpm = 120
    const quantizeDivision = 4
    // barPx = 4 beats * 0.5s/beat * zoom = 4 (fails 10px floor);
    // finePx (4bar) = 16 beats * 0.5s/beat * zoom = 16 (clears floor) — forces level '4bar'.
    const zoom = 2
    const { level, fineIntervalSeconds } = selectQuantizeGridLevel(bpm, quantizeDivision, zoom)
    expect(level).toBe('4bar')

    const { getByTestId } = render(
      <GridOverlay quantizeEnabled bpm={bpm} quantizeDivision={quantizeDivision} zoom={zoom} contentWidth={1000} rowCount={2} />,
    )
    const bg = (getByTestId('quantize-grid-overlay') as HTMLElement).style.backgroundImage
    const match = bg.match(/var\(--cx-grid-bar\)\s*([\d.]+)px\)/)
    expect(match).toBeTruthy()
    const renderedPx = Number(match![1])
    // Must equal fineIntervalSeconds*zoom (16px) — NOT barIntervalSeconds*zoom (4px, the bug).
    expect(renderedPx).toBeCloseTo(fineIntervalSeconds * zoom, 5)

    // The snap helper must agree with what's actually painted: rounding to
    // the nearest multiple of the on-screen spacing (in seconds) matches
    // snapTimeToGridLevel's output at the same bpm/division/zoom.
    const renderedIntervalSeconds = renderedPx / zoom
    const t = 5.3
    const expectedSnap = Math.round(t / renderedIntervalSeconds) * renderedIntervalSeconds
    expect(snapTimeToGridLevel(t, bpm, quantizeDivision, zoom)).toBeCloseTo(expectedSnap, 5)
  })
})

describe('GridOverlay — wired into Timeline', () => {
  beforeEach(() => {
    setupMockEntropic()
    useTimelineStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
  })

  function addTrackViaMenu() {
    fireEvent.click(document.querySelector('[data-testid="add-track-button"]')!)
    fireEvent.click(document.querySelector('[data-testid="add-track-menu-item-video"]')!)
  }

  test('overlay is present in the real Timeline when quantize is on, with zero clips on the track', () => {
    render(<Timeline onSeek={() => {}} quantizeEnabled bpm={120} quantizeDivision={4} />)
    addTrackViaMenu()
    const track = useTimelineStore.getState().tracks[0]
    expect(track.clips.length).toBe(0)
    expect(document.querySelector('[data-testid="quantize-grid-overlay"]')).toBeTruthy()
  })

  test('overlay presence does not depend on which track is selected', () => {
    render(<Timeline onSeek={() => {}} quantizeEnabled bpm={120} quantizeDivision={4} />)
    addTrackViaMenu()
    addTrackViaMenu()
    const [t1, t2] = useTimelineStore.getState().tracks
    useTimelineStore.getState().selectTrack(t1.id)
    expect(document.querySelector('[data-testid="quantize-grid-overlay"]')).toBeTruthy()
    useTimelineStore.getState().selectTrack(t2.id)
    expect(document.querySelector('[data-testid="quantize-grid-overlay"]')).toBeTruthy()
    useTimelineStore.getState().selectTrack(null)
    expect(document.querySelector('[data-testid="quantize-grid-overlay"]')).toBeTruthy()
  })

  test('overlay is absent in the real Timeline when quantize is off', () => {
    render(<Timeline onSeek={() => {}} quantizeEnabled={false} bpm={120} quantizeDivision={4} />)
    addTrackViaMenu()
    expect(document.querySelector('[data-testid="quantize-grid-overlay"]')).toBeNull()
  })
})
