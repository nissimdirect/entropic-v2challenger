/**
 * HT-7 (2026-05-16 red-team): the older `pop-out.test.ts` "contract" test
 * constructs an inline object literal and asserts THAT shape has no
 * invoke/send/sendCommand keys. It does NOT import the actual preload — a
 * future commit that adds `invoke` to `frontend/src/preload/pop-out.ts`
 * would not fail it.
 *
 * This file IMPORTS the real preload module, mocks `contextBridge` +
 * `ipcRenderer`, and asserts the actual exposed API shape and channel
 * subscriptions. Now the contract test is no longer a shadow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track what the preload calls into the electron mocks.
const exposeInMainWorld = vi.fn()
const ipcRendererOn = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    on: ipcRendererOn,
    // Intentionally NOT mocking invoke/send/sendSync — if the preload calls
    // them, the test crashes with a clear "not a function" error.
  },
}))

beforeEach(() => {
  exposeInMainWorld.mockReset()
  ipcRendererOn.mockReset()
  vi.resetModules()
})

describe('pop-out preload — actual file contract (HT-7)', () => {
  it('exposes exactly the read-only API surface', async () => {
    await import('../../preload/pop-out')

    expect(exposeInMainWorld).toHaveBeenCalledTimes(1)
    const [worldName, api] = exposeInMainWorld.mock.calls[0]
    expect(worldName).toBe('entropicPopOut')

    const allowedKeys = ['onFrameUpdate', 'onClose', 'onPing', 'getLastPingAt']
    expect(Object.keys(api as Record<string, unknown>).sort()).toEqual([...allowedKeys].sort())
  })

  it('does NOT expose any IPC-write capability', async () => {
    await import('../../preload/pop-out')
    const [, api] = exposeInMainWorld.mock.calls[0]
    const apiObj = api as Record<string, unknown>

    // RT-1 contract: no write-side methods, regardless of name.
    expect('invoke' in apiObj).toBe(false)
    expect('send' in apiObj).toBe(false)
    expect('sendSync' in apiObj).toBe(false)
    expect('sendCommand' in apiObj).toBe(false)

    // The exposed methods are either subscribers (callback in) or
    // primitive getters — neither carries a write capability.
    expect(typeof apiObj.onFrameUpdate).toBe('function')
    expect(typeof apiObj.onClose).toBe('function')
    expect(typeof apiObj.onPing).toBe('function')
    expect(typeof apiObj.getLastPingAt).toBe('function')
  })

  it('subscribes to the expected main → renderer channels', async () => {
    await import('../../preload/pop-out')

    // The preload registers `pop-out:frame` and `pop-out:ping` listeners
    // at module load. (`pop-out:close` registers lazily when the renderer
    // calls onClose(callback).)
    const channels = ipcRendererOn.mock.calls.map((c) => c[0])
    expect(channels).toContain('pop-out:frame')
    expect(channels).toContain('pop-out:ping')
  })

  it('getLastPingAt starts at 0 and updates only on pop-out:ping receipt', async () => {
    await import('../../preload/pop-out')
    const [, api] = exposeInMainWorld.mock.calls[0]
    const apiObj = api as { getLastPingAt: () => number }
    expect(apiObj.getLastPingAt()).toBe(0)

    // Fire the registered pop-out:ping handler and verify the timestamp moves.
    const pingHandler = ipcRendererOn.mock.calls.find((c) => c[0] === 'pop-out:ping')?.[1]
    expect(pingHandler).toBeTruthy()
    pingHandler!({}, undefined)
    expect(apiObj.getLastPingAt()).toBeGreaterThan(0)
  })

  it('onFrameUpdate replays the last buffered frame on subscription (race-window guarantee)', async () => {
    await import('../../preload/pop-out')
    const [, api] = exposeInMainWorld.mock.calls[0]
    const apiObj = api as {
      onFrameUpdate: (cb: (data: string) => void) => void
    }

    // Simulate the race: main sends a frame BEFORE the React renderer mounts
    // and subscribes. The preload should cache it.
    const frameHandler = ipcRendererOn.mock.calls.find((c) => c[0] === 'pop-out:frame')?.[1]
    expect(frameHandler).toBeTruthy()
    frameHandler!({}, 'data:image/jpeg;base64,EARLY')

    // Renderer mounts later and subscribes — the callback should fire with
    // the cached frame immediately.
    const cb = vi.fn()
    apiObj.onFrameUpdate(cb)
    expect(cb).toHaveBeenCalledWith('data:image/jpeg;base64,EARLY')
  })
})
