import * as Sentry from '@sentry/electron/main'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app, BrowserWindow, session } from 'electron'
import { spawnPython, killPython } from './python'
import { startWatchdog, stopWatchdog } from './watchdog'
import { registerRelayHandlers, setRelayPort, closeRelay } from './zmq-relay'

// Consent-gated Sentry init (VULN-11)
const consentPath = join(homedir(), '.entropic', 'telemetry_consent')
let sentryDsn = ''
try {
  if (existsSync(consentPath) && readFileSync(consentPath, 'utf8').trim() === 'yes') {
    sentryDsn = process.env.SENTRY_DSN || ''
  }
} catch {
  // Consent file unreadable — leave DSN empty
}

Sentry.init({
  dsn: sentryDsn,
  tracesSampleRate: 0.1,
  environment: process.env.SENTRY_ENV || 'development',
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
      sandbox: true,
    },
  })

  // CSP header — restrict script/style sources (M-3)
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"],
      },
    })
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
    Sentry.captureException(err, { tags: { source: 'python-spawn' } })
    console.error('[Main] Failed to start Python sidecar:', err)
  }
})

app.on('window-all-closed', () => {
  stopWatchdog()
  closeRelay()
  killPython()
  app.quit()
})
