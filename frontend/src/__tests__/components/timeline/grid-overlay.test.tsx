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
