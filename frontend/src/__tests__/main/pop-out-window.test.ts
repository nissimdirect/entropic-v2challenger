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

// Shared closures the electron mock factory references. Re-pointed to fresh
// vi.fn() in beforeEach so call history can't bleed across tests.
const sendMock = vi.fn()
const isLoadingMock = vi.fn(() => true)
const isDestroyedMock = vi.fn(() => false)
const handlers: Record<string, ((...args: unknown[]) => void)> = {}
const popOutEvents: Record<string, () => void> = {}

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(() => ({
    webContents: {
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
    },
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
  // The module under test holds top-level singletons (popOutWindow,
  // heartbeatTimer, etc.). Reset modules first so each test gets a fresh
  // import. Reset call history on the shared mocks; do NOT touch
  // mockImplementation so the electron-mock factory wiring survives.
  vi.resetModules()
  sendMock.mockReset()
  isLoadingMock.mockReset().mockReturnValue(true)
  isDestroyedMock.mockReset().mockReturnValue(false)
  for (const k of Object.keys(handlers)) delete handlers[k]
  for (const k of Object.keys(popOutEvents)) delete popOutEvents[k]
})

afterEach(() => {
  // Intentionally NOT calling vi.restoreAllMocks() — it strips the
  // BrowserWindow mockImplementation that the electron mock factory set
  // at hoist time, making subsequent tests see an empty BrowserWindow.
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

describe('pop-out safeSend — RT-2 narrow-catch semantics', () => {
  it('silently drops Render-frame-disposed errors (the expected race)', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sendMock.mockImplementationOnce(() => {
      throw new Error('Render frame was disposed before WebFrameMain could be accessed')
    })
    try {
      const mod = await import('../../main/pop-out-window')
      mod.createPopOutWindow()
      handlers['did-finish-load']()
      // The first send (the buffered frame, or the immediate ping) hit the
      // throwing mock. console.warn must NOT fire — this is the expected race.
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('emits console.warn on non-race throw (channel typo, non-serializable arg, etc.)', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sendMock.mockImplementation(() => {
      throw new Error('TypeError: object could not be cloned')
    })
    try {
      const mod = await import('../../main/pop-out-window')
      mod.createPopOutWindow()
      handlers['did-finish-load']()
      // At least one safeSend call hit the throwing mock with a non-race
      // message. console.warn MUST surface it so future regressions don't
      // hide behind the heartbeat catch.
      expect(warnSpy).toHaveBeenCalled()
      const firstCall = warnSpy.mock.calls[0]
      expect(String(firstCall[0])).toMatch(/safeSend.*unexpected error/)
    } finally {
      warnSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})
