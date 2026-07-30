/**
 * UC5.1 — App.tsx render-frame-loop CHARACTERIZATION (F4 decomposition gate).
 *
 * Pins the CURRENT behavior of the preview render pipeline exactly as wired
 * today, so App.tsx may be decomposed against these assertions:
 *
 *   load project -> initPreviewFromHydratedProject (ingest probe, sets
 *   activeAssetPath ref + totalFrames) -> render-trigger useEffects fire
 *   requestRenderFrame(currentFrame) -> sendCommand({cmd:'render_frame'...})
 *   -> res.frame_data becomes frameDataUrl state (data:image/jpeg;base64,...)
 *   -> PreviewCanvas prop + unconditional sendFrameToPopOut relay.
 *
 * Staleness model pinned here: the renderer has NO _render_seq guard
 * (CLAUDE.md "IPC Trace Fields": _render_seq "not yet activated"; the relay
 * injects it main-side). Instead, requestRenderFrame enforces a SINGLE
 * in-flight render (isRenderingRef) and coalesces bursts into
 * pendingFrameRef — only the NEWEST queued frame is dispatched when the
 * in-flight render resolves. Out-of-order frame display is impossible via
 * this path because a second render is never in flight. That invariant —
 * not a sequence-number comparison — is what the decomposition must keep.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor, screen, fireEvent, act } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic, teardownMockEntropic, type EntropicBridge } from '../helpers/mock-entropic'
import { useProjectStore } from '../../renderer/stores/project'
import { useTimelineStore } from '../../renderer/stores/timeline'
import { useUndoStore } from '../../renderer/stores/undo'
import {
  makeVideoProject,
  makeSendCommandRouter,
  renderFrameIndices,
  VIDEO_ASSET_PATH,
  PROJECT_PATH,
  FIXTURE,
  type SendCommandRouter,
} from './char-helpers'

function resetStores() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

/**
 * Mounts the REAL <App /> and loads the fixture project through the
 * WelcomeScreen "Open Project" path (clean state → loads straight through),
 * then waits for the first successful render_frame round-trip.
 */
async function renderAppWithLoadedProject(): Promise<{ mock: EntropicBridge; router: SendCommandRouter; container: HTMLElement }> {
  const router = makeSendCommandRouter()
  const mock = setupMockEntropic({
    sendCommand: router.sendCommand,
    onMenuAction: () => () => {},
    checkTelemetryConsent: vi.fn().mockResolvedValue(true),
    readRecentProjects: vi.fn().mockResolvedValue([]),
    showOpenDialog: vi.fn().mockResolvedValue(PROJECT_PATH),
    readFile: vi.fn().mockResolvedValue(JSON.stringify(makeVideoProject())),
  })

  const { container } = render(<App />)

  await waitFor(() => {
    expect(screen.getByText('Open Project')).toBeTruthy()
  })
  fireEvent.click(screen.getByText('Open Project'))

  // Hydration probe: exactly one ingest for the clip's asset path.
  await waitFor(() => {
    expect(router.sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'ingest', path: VIDEO_ASSET_PATH }),
    )
  })
  // First frame round-trip completed (frame_data reached the display path).
  await waitFor(() => {
    expect(mock.sendFrameToPopOut).toHaveBeenCalled()
  })
  return { mock, router, container }
}

describe('UC5.1 — render frame loop (characterization)', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
    vi.restoreAllMocks()
    resetStores()
  })

  it('loading a project dispatches render requests and the received frame_data reaches the preview data path', async () => {
    const { mock, router, container } = await renderAppWithLoadedProject()

    // At least one render_frame was dispatched for the single-clip fast path,
    // carrying the clip's asset path and frame 0 (playhead at 0).
    const frames = renderFrameIndices(router.renderCommands)
    expect(frames.length).toBeGreaterThanOrEqual(1)
    expect(frames[0]).toBe(0)
    const first = router.renderCommands.find((c) => c.cmd === 'render_frame')!
    expect(first.path).toBe(VIDEO_ASSET_PATH)
    // Characterized: the renderer attaches NO _render_seq — staleness is
    // handled by the single-in-flight gate, not a sequence number (the relay
    // injects _render_seq main-side, outside this component's contract).
    expect(first).not.toHaveProperty('_render_seq')

    // The received frame_data is wrapped into the JPEG data-URL display path.
    // frameDataUrl feeds BOTH PreviewCanvas and the pop-out relay from the
    // same state write, so the relay arg is the observable for "the frame
    // reached the display data path".
    expect(mock.sendFrameToPopOut).toHaveBeenCalledWith(
      'data:image/jpeg;base64,FRAME_0',
    )

    // Frame geometry from the render response lands on the <canvas> element.
    await waitFor(() => {
      const canvas = container.querySelector('.preview-canvas__element') as HTMLCanvasElement
      expect(canvas).toBeTruthy()
      expect(canvas.getAttribute('width')).toBe(String(FIXTURE.width))
      expect(canvas.getAttribute('height')).toBe(String(FIXTURE.height))
    })

    // previewState reached 'ready': loading spinner and empty placeholder gone.
    expect(container.querySelector('.preview-canvas__loading')).toBeNull()
    expect(container.querySelector('.preview-canvas__placeholder')).toBeNull()
  })

  it('Space (play) starts the silent-video timer transport and dispatches successive render requests with advancing frame indices', async () => {
    const { router } = await renderAppWithLoadedProject()
    const baseline = renderFrameIndices(router.renderCommands).length

    // Space routes through handlePlayPauseRef → no audio → timer transport.
    fireEvent.keyDown(window, { code: 'Space' })

    // Playback advances currentFrame via rAF; each change re-fires the
    // render-trigger effect → new render_frame IPCs with increasing indices.
    await waitFor(
      () => {
        const after = renderFrameIndices(router.renderCommands).slice(baseline)
        expect(after.some((f) => f > 0)).toBe(true)
      },
      { timeout: 5000 },
    )

    await waitFor(
      () => {
        const after = renderFrameIndices(router.renderCommands).slice(baseline)
        const positive = after.filter((f) => f > 0)
        expect(positive.length).toBeGreaterThanOrEqual(2)
        // Strictly advancing (timer only moves forward at 1x from frame 0).
        expect(positive[positive.length - 1]).toBeGreaterThan(positive[0])
      },
      { timeout: 5000 },
    )

    // Space again pauses: after the in-flight/pending renders settle, no new
    // render requests are dispatched.
    fireEvent.keyDown(window, { code: 'Space' })
    await new Promise((r) => setTimeout(r, 200))
    const settled = router.renderCommands.length
    await new Promise((r) => setTimeout(r, 200))
    expect(router.renderCommands.length).toBe(settled)
  })

  it('bursts while a render is in flight coalesce to the NEWEST frame only — intermediate frames are never dispatched and the display converges to the newest frame', async () => {
    const { mock, router } = await renderAppWithLoadedProject()

    // Let the initial renders fully settle before switching to manual control.
    await new Promise((r) => setTimeout(r, 100))
    const baseline = router.renderCommands.length
    router.setDeferRenders(true)

    // Frame 30 — dispatches immediately (nothing in flight).
    act(() => {
      useTimelineStore.getState().setPlayheadTime(30 / FIXTURE.fps)
      useProjectStore.getState().setCurrentFrame(30)
    })
    await waitFor(() => {
      expect(router.renderCommands.length).toBe(baseline + 1)
    })
    expect(router.renderCommands[baseline].frame_index).toBe(30)

    // Frames 45 then 60 arrive while 30 is still in flight: both are queued
    // into pendingFrameRef, 60 OVERWRITES 45 — neither dispatches yet.
    act(() => {
      useTimelineStore.getState().setPlayheadTime(45 / FIXTURE.fps)
      useProjectStore.getState().setCurrentFrame(45)
    })
    act(() => {
      useTimelineStore.getState().setPlayheadTime(60 / FIXTURE.fps)
      useProjectStore.getState().setCurrentFrame(60)
    })
    expect(router.renderCommands.length).toBe(baseline + 1)

    // Resolving the in-flight render displays ITS frame (30), then dispatches
    // exactly one follow-up for the newest pending frame (60). Frame 45 is
    // never rendered — that is the pinned coalescing contract.
    act(() => {
      router.resolveOldestDeferred()
    })
    await waitFor(() => {
      expect(mock.sendFrameToPopOut).toHaveBeenCalledWith('data:image/jpeg;base64,FRAME_30')
    })
    await waitFor(() => {
      expect(router.renderCommands.length).toBe(baseline + 2)
    })
    expect(router.renderCommands[baseline + 1].frame_index).toBe(60)

    act(() => {
      router.resolveOldestDeferred()
    })
    await waitFor(() => {
      expect(mock.sendFrameToPopOut).toHaveBeenCalledWith('data:image/jpeg;base64,FRAME_60')
    })

    // No stale regression: the LAST frame relayed to the display path is the
    // newest one, and frame 45 never appeared at all.
    const relayed = (mock.sendFrameToPopOut as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(relayed[relayed.length - 1]).toBe('data:image/jpeg;base64,FRAME_60')
    expect(relayed).not.toContain('data:image/jpeg;base64,FRAME_45')
    expect(renderFrameIndices(router.renderCommands)).not.toContain(45)
  })
})
