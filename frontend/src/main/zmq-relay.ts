import { ipcMain, dialog, BrowserWindow } from 'electron'
import { Request } from 'zeromq'
import { randomUUID } from 'crypto'

const ZMQ_TIMEOUT = 10_000

let currentPort = 0

export function setRelayPort(port: number): void {
  currentPort = port
}

async function sendZmqCommand(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (currentPort === 0) {
    return { id: command.id as string, ok: false, error: 'Engine not connected' }
  }

  const sock = new Request()
  sock.receiveTimeout = ZMQ_TIMEOUT
  sock.linger = 0
  sock.connect(`tcp://127.0.0.1:${currentPort}`)

  try {
    await sock.send(JSON.stringify(command))
    const [raw] = await sock.receive()
    return JSON.parse(raw.toString())
  } catch (err) {
    return {
      id: command.id as string,
      ok: false,
      error: err instanceof Error ? err.message : 'ZMQ communication failed',
    }
  } finally {
    try {
      sock.close()
    } catch {
      /* socket may already be closed */
    }
  }
}

export function registerRelayHandlers(): void {
  ipcMain.handle('send-command', async (_event, command: Record<string, unknown>) => {
    if (!command.id) {
      command.id = randomUUID()
    }
    return sendZmqCommand(command)
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
