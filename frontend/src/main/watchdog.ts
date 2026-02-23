import { Request } from 'zeromq'
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { spawnPython, killPython, type PythonPorts } from './python'
import { reconnectRelay } from './zmq-relay'
import { MissCounter } from './utils'

export type EngineStatus = 'connected' | 'disconnected' | 'restarting'

const PING_INTERVAL = 1000
const PING_TIMEOUT = 2000
const MAX_MISSES = 3
/** When a render is in flight, allow more misses before killing Python (BUG-4). */
const MAX_MISSES_RENDERING = 10

let currentPingPort = 0
let currentToken = ''
let running = false
let timeoutId: ReturnType<typeof setTimeout> | null = null
let renderInFlight = false
const missCounter = new MissCounter(MAX_MISSES)

function broadcast(status: EngineStatus, uptime?: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('engine-status', { status, uptime })
  }
}

async function ping(): Promise<void> {
  const sock = new Request()
  sock.receiveTimeout = PING_TIMEOUT
  sock.linger = 0
  sock.connect(`tcp://127.0.0.1:${currentPingPort}`)

  try {
    const id = randomUUID()
    await sock.send(JSON.stringify({ cmd: 'ping', id, _token: currentToken }))
    const [raw] = await sock.receive()
    const res = JSON.parse(raw.toString())
    if (res.status === 'alive') {
      missCounter.hit()
      broadcast('connected', res.uptime_s)
    }
  } catch {
    // Use higher miss tolerance while a render_frame is in flight,
    // because the single-threaded ZMQ server can't respond to pings
    // while processing a heavy effect (BUG-4).
    const threshold = renderInFlight ? MAX_MISSES_RENDERING : MAX_MISSES
    if (missCounter.current + 1 >= threshold) {
      missCounter.miss()
      await restart()
    } else {
      missCounter.miss()
      broadcast('disconnected')
    }
  } finally {
    try {
      sock.close()
    } catch {
      /* socket may already be closed */
    }
  }
}

async function restart(): Promise<void> {
  broadcast('restarting')
  killPython()
  missCounter.reset()
  renderInFlight = false

  try {
    const { port, pingPort, token } = await spawnPython()
    currentPingPort = pingPort
    currentToken = token
    reconnectRelay(port, token)
    broadcast('connected')
  } catch (err) {
    console.error('[Watchdog] Restart failed:', err)
    broadcast('disconnected')
  }
}

async function tick(): Promise<void> {
  if (!running) return
  await ping()
  if (running) {
    timeoutId = setTimeout(tick, PING_INTERVAL)
  }
}

export async function startWatchdog(pingPort: number, token: string): Promise<void> {
  currentPingPort = pingPort
  currentToken = token
  running = true
  missCounter.reset()
  broadcast('connected')
  timeoutId = setTimeout(tick, PING_INTERVAL)
}

export function stopWatchdog(): void {
  running = false
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
}

/**
 * Notify the watchdog that a render is starting or finishing.
 * While a render is in flight, the miss threshold is raised to
 * MAX_MISSES_RENDERING to avoid killing Python during heavy effects.
 */
export function setRenderInFlight(inFlight: boolean): void {
  renderInFlight = inFlight
}
