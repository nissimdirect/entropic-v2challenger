/**
 * #429 — ZMQ relay serialization + timeout recovery.
 *
 * These are the hard oracles for the fix:
 *   (a) N concurrent send-command calls result in strictly sequential socket
 *       operations (send→recv→send→recv…), never overlapping — a zeromq.js REQ
 *       socket permits only one in-flight exchange.
 *   (b) A timed-out exchange leaves the relay able to serve the NEXT request
 *       (fresh socket, ok:true), instead of wedging on "Socket is closed" /
 *       "Operation cannot be accomplished in current state".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared, mutable mock state (hoisted so the vi.mock factory can see it).
const h = vi.hoisted(() => ({
  opLog: [] as string[],
  inFlight: 0,
  maxInFlight: 0,
  ctorCount: 0,
  closeCount: 0,
  // Per-receive behavior queue; missing entries default to 'ok'.
  receiveBehaviors: [] as Array<'ok' | 'timeout'>,
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn(() => '/mock'), isReady: vi.fn(() => true) },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn(() => []) },
}))

vi.mock('@sentry/electron/main', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

// Controllable single-socket mock. Tracks concurrency and op ordering so the
// test can prove exchanges never overlap.
vi.mock('zeromq', () => ({
  Request: vi.fn().mockImplementation(() => {
    h.ctorCount++
    return {
      receiveTimeout: 0,
      linger: 0,
      connect: vi.fn(),
      send: vi.fn(async () => {
        h.inFlight++
        h.maxInFlight = Math.max(h.maxInFlight, h.inFlight)
        h.opLog.push('send')
        await new Promise((r) => setTimeout(r, 3))
      }),
      receive: vi.fn(async () => {
        h.opLog.push('recv')
        await new Promise((r) => setTimeout(r, 3))
        h.inFlight--
        const behavior = h.receiveBehaviors.shift() ?? 'ok'
        if (behavior === 'timeout') {
          throw new Error('Socket receive operation timed out')
        }
        return [Buffer.from(JSON.stringify({ id: 'x', ok: true }))]
      }),
      close: vi.fn(() => {
        h.closeCount++
      }),
    }
  }),
}))

vi.mock('../../main/watchdog', () => ({ setRenderInFlight: vi.fn() }))
vi.mock('../../main/python', () => ({ spawnPython: vi.fn(), killPython: vi.fn() }))
vi.mock('../../main/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { registerRelayHandlers, setRelayPort, closeRelay } from '../../main/zmq-relay'
import { ipcMain } from 'electron'

type Handler = (...args: unknown[]) => Promise<Record<string, unknown>>

describe('zmq-relay serialization (#429)', () => {
  let send: Handler

  beforeEach(() => {
    // Reset module-level socket state so every test starts with no live socket.
    closeRelay()

    h.opLog.length = 0
    h.inFlight = 0
    h.maxInFlight = 0
    h.ctorCount = 0
    h.closeCount = 0
    h.receiveBehaviors.length = 0

    const handlers: Record<string, Handler> = {}
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler) => {
      handlers[channel] = handler as Handler
      return undefined as unknown as Electron.IpcMain
    })
    setRelayPort(5555, 'test-token')
    registerRelayHandlers()
    send = handlers['send-command']
  })

  it('serializes N concurrent send-command calls into strict send→recv pairs', async () => {
    const N = 6
    // Fire all at once (mimics render frame + meter/pressure/probe pollers
    // hitting the socket in the same tick).
    const calls = Array.from({ length: N }, (_, i) =>
      send({} as Electron.IpcMainInvokeEvent, { cmd: 'render_frame', id: `r${i}` }),
    )
    const results = await Promise.all(calls)

    // Never more than one exchange touching the socket at a time.
    expect(h.maxInFlight).toBe(1)

    // Ops must strictly alternate: send,recv,send,recv,... (2 per exchange).
    expect(h.opLog).toEqual(
      Array.from({ length: N }, () => ['send', 'recv']).flat(),
    )

    // Every caller still gets its own resolved reply.
    expect(results).toHaveLength(N)
    for (const r of results) expect(r.ok).toBe(true)
  })

  it('a timeout leaves the relay able to serve the NEXT request', async () => {
    h.receiveBehaviors.push('timeout', 'ok')

    const first = await send(
      {} as Electron.IpcMainInvokeEvent,
      { cmd: 'render_frame', id: 'boom' },
    )
    expect(first.ok).toBe(false)
    expect(String(first.error)).toContain('Engine took too long')

    // Socket was discarded after the timeout so the NEXT call must rebuild it.
    expect(h.closeCount).toBeGreaterThanOrEqual(1)

    const second = await send(
      {} as Electron.IpcMainInvokeEvent,
      { cmd: 'render_frame', id: 'recovered' },
    )
    expect(second.ok).toBe(true)
    // A fresh socket was constructed for the recovery request.
    expect(h.ctorCount).toBe(2)
  })

  it('a timeout mid-burst does not corrupt later concurrent exchanges', async () => {
    // First exchange times out; the rest recover on fresh sockets, strictly
    // serialized — no "Socket is busy" / "current state" cascade.
    h.receiveBehaviors.push('timeout')

    const calls = Array.from({ length: 4 }, (_, i) =>
      send({} as Electron.IpcMainInvokeEvent, { cmd: 'render_frame', id: `m${i}` }),
    )
    const results = await Promise.all(calls)

    expect(h.maxInFlight).toBe(1)
    // Exactly one failure (the injected timeout); the rest succeed.
    expect(results.filter((r) => r.ok === false)).toHaveLength(1)
    expect(results.filter((r) => r.ok === true)).toHaveLength(3)
  })
})
