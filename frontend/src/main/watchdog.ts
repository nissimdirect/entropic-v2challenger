import { Request } from 'zeromq'
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { spawnPython, killPython } from './python'
import { MissCounter } from './utils'

export type EngineStatus = 'connected' | 'disconnected' | 'restarting'

const PING_INTERVAL = 1000
const PING_TIMEOUT = 2000
const MAX_MISSES = 3

let currentPort = 0
let running = false
let timeoutId: ReturnType<typeof setTimeout> | null = null
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
  sock.connect(`tcp://127.0.0.1:${currentPort}`)

  try {
    const id = randomUUID()
    await sock.send(JSON.stringify({ cmd: 'ping', id }))
    const [raw] = await sock.receive()
    const res = JSON.parse(raw.toString())
    if (res.status === 'alive') {
      missCounter.hit()
      broadcast('connected', res.uptime_s)
    }
  } catch {
    if (missCounter.miss()) {
      await restart()
    } else {
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

  try {
    currentPort = await spawnPython()
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

export async function startWatchdog(port: number): Promise<void> {
  currentPort = port
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
