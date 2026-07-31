/**
 * track-header-scroll-into-view.test.tsx — W1.5b PK.B2 hard oracle
 * (openspec/changes/w15b-grid-track-paradigm/packets.md):
 *
 * "Oracle: vitest with a scrolled container — selecting an out-of-view
 * track updates scrollTop; in-view selection leaves scrollTop unchanged."
 *
 * Timeline.tsx's PK.B2 effect computes "nearest" scroll manually via
 * getBoundingClientRect (native scrollIntoView is not deterministically
 * testable under happy-dom — see the effect's comment), so this test mocks
 * getBoundingClientRect on the headers container and each row, mirroring
 * the pattern useTrackDragReorder.test.tsx already uses for row geometry.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import { useTimelineStore } from '../../renderer/stores/timeline'
import Timeline from '../../renderer/components/timeline/Timeline'

const ROW_HEIGHT = 76
const VISIBLE_ROWS = 3
const CONTAINER_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS

beforeEach(() => {
  setupMockEntropic()
  useTimelineStore.getState().reset()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

/** Stubs getBoundingClientRect on the headers scroll container + every
 * `.track-header` row, positioning each row at `index * ROW_HEIGHT` inside
 * an infinite-content column whose visible window is offset by
 * `container.scrollTop`. */
function mockGeometry(container: HTMLElement, rowCount: number) {
  const headers = container.querySelector<HTMLElement>('.timeline__track-headers')!
  Object.defineProperty(headers, 'clientHeight', { value: CONTAINER_HEIGHT, configurable: true })
  headers.getBoundingClientRect = () =>
    ({
      top: 0,
      bottom: CONTAINER_HEIGHT,
      left: 0,
      right: 200,
      width: 200,
      height: CONTAINER_HEIGHT,
      x: 0,
      y: 0,
      toJSON() { return this },
    }) as DOMRect

  const rows = Array.from(headers.querySelectorAll<HTMLElement>('.track-header'))
  expect(rows.length).toBe(rowCount)
  rows.forEach((row, i) => {
    row.getBoundingClientRect = () => {
      const top = i * ROW_HEIGHT - headers.scrollTop
      return {
        top,
        bottom: top + ROW_HEIGHT,
        left: 0,
        right: 200,
        width: 200,
        height: ROW_HEIGHT,
        x: 0,
        y: top,
        toJSON() { return this },
      } as DOMRect
    }
  })
}

describe('Timeline — PK.B2 selection-driven scroll-into-view', () => {
  it('selecting an out-of-view track updates the headers column scrollTop', () => {
    for (let i = 0; i < 6; i++) useTimelineStore.getState().addTrack(`Track ${i}`, '#4ade80')
    const tracks = useTimelineStore.getState().tracks

    const { container } = render(<Timeline onSeek={() => {}} />)
    mockGeometry(container, tracks.length)
    const headers = container.querySelector<HTMLElement>('.timeline__track-headers')!
    headers.scrollTop = 0

    // Track index 5 sits at top=380..456, well below the 228px visible window.
    act(() => {
      useTimelineStore.getState().selectTrack(tracks[5].id)
    })

    expect(headers.scrollTop).not.toBe(0)
  })

  it('selecting an already-in-view track leaves scrollTop unchanged', () => {
    for (let i = 0; i < 6; i++) useTimelineStore.getState().addTrack(`Track ${i}`, '#4ade80')
    const tracks = useTimelineStore.getState().tracks

    const { container } = render(<Timeline onSeek={() => {}} />)
    mockGeometry(container, tracks.length)
    const headers = container.querySelector<HTMLElement>('.timeline__track-headers')!
    headers.scrollTop = 0

    // Track index 1 sits at top=76..152 — fully inside the 0..228 window.
    act(() => {
      useTimelineStore.getState().selectTrack(tracks[1].id)
    })

    expect(headers.scrollTop).toBe(0)
  })
})
