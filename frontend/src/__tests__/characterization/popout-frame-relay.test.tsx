/**
 * UC5.4 — pop-out preview frame relay CHARACTERIZATION (F4 decomposition gate).
 *
 * Pins the CURRENT relay contract between App.tsx's render loop and the
 * pop-out preview window:
 *
 *   - App.tsx ~1692: every successful frame is relayed via
 *     window.entropic.sendFrameToPopOut(dataUrl) UNCONDITIONALLY — renderer
 *     state does NOT gate on the pop-out being open. The comment in App.tsx
 *     is explicit: "Relay every frame unconditionally — main process drops if
 *     pop-out closed. Cheaper than a stale gate; avoids the state-divergence
 *     bug from F13."
 *   - PreviewCanvas's pop-out button: opening calls openPopOut() and
 *     immediately relays the CURRENT frame ("so pop-out isn't black");
 *     closing calls closePopOut(). Frames keep relaying after close.
 *
 * NOTE vs the packet spec: the packet phrased this as "closed pop-out does
 * not [relay]" — that is NOT the current renderer behavior. Characterization
 * pins reality: the renderer ALWAYS relays; drop-when-closed is the MAIN
 * process's job (outside this suite's mock boundary). Listed as a
 * characterized oddity in the PR body.
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
  PROJECT_PATH,
  FIXTURE,
  type SendCommandRouter,
} from './char-helpers'

function resetStores() {
  useProjectStore.getState().resetProject()
  useTimelineStore.getState().reset()
  useUndoStore.getState().clear()
}

function relayedFrames(mock: EntropicBridge): string[] {
  return (mock.sendFrameToPopOut as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
}

/** Advance the playhead/currentFrame and wait for that frame's relay. */
async function advanceToFrame(mock: EntropicBridge, frame: number): Promise<void> {
  act(() => {
    useTimelineStore.getState().setPlayheadTime(frame / FIXTURE.fps)
    useProjectStore.getState().setCurrentFrame(frame)
  })
  await waitFor(() => {
    expect(relayedFrames(mock)).toContain(`data:image/jpeg;base64,FRAME_${frame}`)
  })
}

async function renderAppWithLoadedProject(): Promise<{ mock: EntropicBridge; router: SendCommandRouter }> {
  const router = makeSendCommandRouter()
  const mock = setupMockEntropic({
    sendCommand: router.sendCommand,
    onMenuAction: () => () => {},
    checkTelemetryConsent: vi.fn().mockResolvedValue(true),
    readRecentProjects: vi.fn().mockResolvedValue([]),
    showOpenDialog: vi.fn().mockResolvedValue(PROJECT_PATH),
    readFile: vi.fn().mockResolvedValue(JSON.stringify(makeVideoProject())),
  })

  render(<App />)
  await waitFor(() => {
    expect(screen.getByText('Open Project')).toBeTruthy()
  })
  fireEvent.click(screen.getByText('Open Project'))
  await waitFor(() => {
    expect(mock.sendFrameToPopOut).toHaveBeenCalled()
  })
  return { mock, router }
}

describe('UC5.4 — pop-out frame relay (characterization)', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
    teardownMockEntropic()
    vi.restoreAllMocks()
    resetStores()
  })

  it('PINNED: frames are relayed to sendFrameToPopOut even while the pop-out has NEVER been opened (unconditional relay; main drops when closed)', async () => {
    const { mock } = await renderAppWithLoadedProject()

    // The pop-out was never opened, yet the first frame already relayed.
    expect(mock.openPopOut).not.toHaveBeenCalled()
    expect(relayedFrames(mock)).toContain('data:image/jpeg;base64,FRAME_0')

    // And every subsequent frame relays too.
    await advanceToFrame(mock, 30)
  })

  it('opening the pop-out calls openPopOut and immediately relays the CURRENT frame; subsequent new frames relay their data', async () => {
    const { mock } = await renderAppWithLoadedProject()
    await waitFor(() => {
      expect(relayedFrames(mock)).toContain('data:image/jpeg;base64,FRAME_0')
    })
    const countBefore = relayedFrames(mock).length

    fireEvent.click(screen.getByTitle('Pop out preview'))

    await waitFor(() => {
      expect(mock.openPopOut).toHaveBeenCalledTimes(1)
    })
    // Immediate re-send of the current frame so the pop-out isn't black.
    await waitFor(() => {
      const frames = relayedFrames(mock)
      expect(frames.length).toBeGreaterThan(countBefore)
      expect(frames[frames.length - 1]).toBe('data:image/jpeg;base64,FRAME_0')
    })
    // Button flips to the close affordance.
    await waitFor(() => {
      expect(screen.getByTitle('Close pop-out preview')).toBeTruthy()
    })

    // While open: each newly rendered frame is relayed with its frame data.
    await advanceToFrame(mock, 30)
    await advanceToFrame(mock, 60)
  })

  it('closing the pop-out calls closePopOut; PINNED: frames STILL relay after close (renderer never gates on open-state)', async () => {
    const { mock } = await renderAppWithLoadedProject()

    fireEvent.click(screen.getByTitle('Pop out preview'))
    await waitFor(() => {
      expect(screen.getByTitle('Close pop-out preview')).toBeTruthy()
    })

    fireEvent.click(screen.getByTitle('Close pop-out preview'))
    await waitFor(() => {
      expect(mock.closePopOut).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByTitle('Pop out preview')).toBeTruthy()
    })

    // Current behavior: the relay keeps firing after close — dropping frames
    // for a closed pop-out is the MAIN process's responsibility, not the
    // renderer's. If the decomposition adds a renderer-side gate, flip this
    // assertion deliberately.
    await advanceToFrame(mock, 45)
    expect(relayedFrames(mock)).toContain('data:image/jpeg;base64,FRAME_45')
  })
})
