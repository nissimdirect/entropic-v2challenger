import * as Sentry from '@sentry/electron/main'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { spawnPython, killPython } from './python'
import { startWatchdog, stopWatchdog } from './watchdog'
import { registerRelayHandlers, setRelayPort } from './zmq-relay'

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
    const port = await spawnPython()
    console.log(`[Main] Python sidecar started on port ${port}`)
    setRelayPort(port)
    await startWatchdog(port)
  } catch (err) {
    console.error('[Main] Failed to start Python sidecar:', err)
  }
})

app.on('window-all-closed', () => {
  stopWatchdog()
  killPython()
  app.quit()
})
