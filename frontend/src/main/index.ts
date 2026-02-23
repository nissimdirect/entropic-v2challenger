import * as Sentry from '@sentry/electron/main'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { spawnPython, killPython } from './python'
import { startWatchdog, stopWatchdog } from './watchdog'
import { registerRelayHandlers, setRelayPort, closeRelay } from './zmq-relay'

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  tracesSampleRate: 0.1,
  environment: 'development',
})

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Entropic v2 Challenger',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Intercept file drops at the main process level to get reliable file paths.
  // In dev mode (Vite HTTP), renderer file.path can be empty.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.session.on('will-download', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  registerRelayHandlers()
  createWindow()

  try {
    const { port, pingPort, token } = await spawnPython()
    console.log(`[Main] Python sidecar started on port ${port}, ping ${pingPort}`)
    setRelayPort(port, token)
    await startWatchdog(pingPort, token)
  } catch (err) {
    console.error('[Main] Failed to start Python sidecar:', err)
  }
})

app.on('window-all-closed', () => {
  stopWatchdog()
  closeRelay()
  killPython()
  app.quit()
})
