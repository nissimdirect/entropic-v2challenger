import { ipcMain, dialog, BrowserWindow } from 'electron'
import { Request } from 'zeromq'
import { randomUUID } from 'crypto'
import { setRenderInFlight } from './watchdog'

const ZMQ_TIMEOUT = 10_000
const EXPORT_POLL_INTERVAL = 500

/** Commands that trigger heavy Python work and may block pings (BUG-4). */
const RENDER_COMMANDS = new Set(['render_frame', 'apply_chain', 'export_start'])

let currentPort = 0
let currentToken = ''
let persistentSocket: InstanceType<typeof Request> | null = null
let exportPollTimer: ReturnType<typeof setInterval> | null = null

export function setRelayPort(port: number, token: string): void {
  // Close existing socket if port changes
  if (currentPort !== port) {
    closePersistentSocket()
  }
  currentPort = port
  currentToken = token
}

/** Called by watchdog on restart to switch to new Python process. */
export function reconnectRelay(port: number, token: string): void {
  closePersistentSocket()
  currentPort = port
  currentToken = token
}

/** Called on app shutdown to clean up the persistent socket. */
export function closeRelay(): void {
  stopExportPoll()
  closePersistentSocket()
  currentPort = 0
  currentToken = ''
}

function closePersistentSocket(): void {
  if (persistentSocket) {
    try {
      persistentSocket.close()
    } catch {
      /* socket may already be closed */
    }
    persistentSocket = null
  }
}

function getOrCreateSocket(): InstanceType<typeof Request> {
  if (!persistentSocket) {
    persistentSocket = new Request()
    persistentSocket.receiveTimeout = ZMQ_TIMEOUT
    persistentSocket.linger = 0
    persistentSocket.connect(`tcp://127.0.0.1:${currentPort}`)
  }
  return persistentSocket
}

async function sendZmqCommand(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (currentPort === 0 || !currentToken) {
    return { id: command.id as string, ok: false, error: 'Engine not connected' }
  }

  const isRender = RENDER_COMMANDS.has(command.cmd as string)
  if (isRender) {
    setRenderInFlight(true)
  }

  const sock = getOrCreateSocket()

  try {
    command._token = currentToken
    await sock.send(JSON.stringify(command))
    const [raw] = await sock.receive()
    return JSON.parse(raw.toString())
  } catch (err) {
    // On error, destroy the socket so the next call creates a fresh one
    closePersistentSocket()
    return {
      id: command.id as string,
      ok: false,
      error: err instanceof Error ? err.message : 'ZMQ communication failed',
    }
  } finally {
    if (isRender) {
      setRenderInFlight(false)
    }
  }
}

function stopExportPoll(): void {
  if (exportPollTimer) {
    clearInterval(exportPollTimer)
    exportPollTimer = null
  }
}

function startExportPoll(): void {
  stopExportPoll()
  exportPollTimer = setInterval(async () => {
    const res = await sendZmqCommand({ cmd: 'export_status', id: randomUUID() })
    if (!res.ok) return

    const progress = (res.progress as number) ?? 0
    const exportState = res.status as string
    const done = exportState === 'complete' || exportState === 'cancelled'
    const failed = exportState === 'error'
    const error = failed ? (res.error as string) ?? 'Export failed' : undefined

    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('export-progress', {
        jobId: null,
        progress,
        done: done || failed,
        error,
      })
    }

    if (done || failed || exportState === 'idle') {
      stopExportPoll()
    }
  }, EXPORT_POLL_INTERVAL)
}

export function registerRelayHandlers(): void {
  ipcMain.handle('send-command', async (_event, command: Record<string, unknown>) => {
    if (!command.id) {
      command.id = randomUUID()
    }
    const result = await sendZmqCommand(command)

    // Start polling after successful export_start
    if (command.cmd === 'export_start' && result.ok) {
      startExportPoll()
    }

    // Stop polling on export_cancel
    if (command.cmd === 'export_cancel') {
      stopExportPoll()
    }

    return result
  })

  ipcMain.handle('select-file', async (_event, filters: { name: string; extensions: string[] }[]) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters,
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('select-save-path', async (_event, defaultName: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters: [{ name: 'Video', extensions: ['mp4'] }],
    })

    if (result.canceled || !result.filePath) return null
    return result.filePath
  })
}
