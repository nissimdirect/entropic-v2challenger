/**
 * F-0512-47 regression: pop-out window must not be solid black on first open.
 *
 * Root cause: `createPopOutWindow` returns synchronously while the BrowserWindow
 * is still loading. The renderer's "send current frame immediately" path
 * (PreviewCanvas.handlePopOut) fires before the preload's IPC listener is
 * registered, so the first frame is silently dropped.
 *
 * Fix: buffer the most recent frame in main until `did-finish-load`, then
 * dispatch it. This test asserts that:
 *   - A frame sent while the window is loading is buffered (no immediate send).
 *   - `did-finish-load` flushes the buffered frame via webContents.send.
 *   - Frames sent after load go through directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn()
const isLoadingMock = vi.fn(() => true)
const isDestroyedMock = vi.fn(() => false)

const handlers: Record<string, ((...args: unknown[]) => void)> = {}

function makeWebContentsStub() {
  return {
    send: sendMock,
    isLoading: isLoadingMock,
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
    }),
    on: vi.fn(),
    session: {
      webRequest: { onHeadersReceived: vi.fn() },
    },
  }
}

const popOutEvents: Record<string, () => void> = {}
const popOutWebContents = makeWebContentsStub()

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: popOutWebContents,
    on: vi.fn((event: string, handler: () => void) => {
      popOutEvents[event] = handler
    }),
    isDestroyed: isDestroyedMock,
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 640, height: 480 })),
  })),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  screen: {
    getDisplayMatching: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  isLoadingMock.mockReturnValue(true)
  isDestroyedMock.mockReturnValue(false)
  for (const k of Object.keys(handlers)) delete handlers[k]
  for (const k of Object.keys(popOutEvents)) delete popOutEvents[k]
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pop-out window — F-0512-47 first-frame buffering', () => {
  it('buffers frames while loading, flushes on did-finish-load, then sends direct', async () => {
    // F-0514-6: did-finish-load now also seeds the heartbeat. Use fake timers
    // so the 1Hz ping interval can't tick and pollute assertions.
    vi.useFakeTimers()
    try {
      const mod = await import('../../main/pop-out-window')
      mod.createPopOutWindow()

      // ---- Phase A: window still loading; frame must be buffered, not sent.
      mod.sendFrameToPopOut('data:image/jpeg;base64,FIRST')
      expect(sendMock).not.toHaveBeenCalled()

      // Multiple buffered sends — only the latest survives (no replay storm).
      mod.sendFrameToPopOut('data:image/jpeg;base64,SECOND')
      expect(sendMock).not.toHaveBeenCalled()

      // ---- Phase B: did-finish-load flushes the most-recent buffered frame
      // AND seeds the heartbeat with one immediate ping.
      expect(handlers['did-finish-load']).toBeDefined()
      handlers['did-finish-load']()
      expect(sendMock).toHaveBeenCalledTimes(2)
      expect(sendMock).toHaveBeenCalledWith('pop-out:frame', 'data:image/jpeg;base64,SECOND')
      expect(sendMock).toHaveBeenCalledWith('pop-out:ping')

      // ---- Phase C: subsequent frames go through directly.
      isLoadingMock.mockReturnValue(false)
      sendMock.mockClear()
      mod.sendFrameToPopOut('data:image/jpeg;base64,POST')
      expect(sendMock).toHaveBeenCalledTimes(1)
      expect(sendMock).toHaveBeenCalledWith('pop-out:frame', 'data:image/jpeg;base64,POST')
    } finally {
      vi.useRealTimers()
    }
  })

})
