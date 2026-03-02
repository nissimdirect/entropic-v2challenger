import * as Sentry from '@sentry/electron/main'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir, userInfo } from 'os'
import { app, BrowserWindow, screen } from 'electron'
import { spawnPython, killPython } from './python'
import { startWatchdog, stopWatchdog } from './watchdog'
import { registerRelayHandlers, setRelayPort, closeRelay } from './zmq-relay'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { registerSupportBundleHandler } from './support-bundle'
import { logger } from './logger'

// PII stripping for Sentry events — matches Python's strip_pii pattern
const _homeDir = homedir()
let _username = ''
try { _username = userInfo().username } catch { /* best-effort */ }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripPiiFromEvent<T extends Record<string, any>>(event: T): T {
  const json = JSON.stringify(event)
  let stripped = json
  if (_homeDir) {
    stripped = stripped.replaceAll(_homeDir, '<HOME>')
  }
  if (_username && _username.length > 1) {
    stripped = stripped.replaceAll(_username, '<USER>')
  }
  stripped = stripped.replace(/\/Users\/[^/\\"\s]+/g, '/Users/<USER>')
  stripped = stripped.replace(/\/home\/[^/\\"\s]+/g, '/home/<USER>')
  stripped = stripped.replace(/C:\\\\Users\\\\[^\\\\"\s]+/g, 'C:\\\\Users\\\\<USER>')
  return JSON.parse(stripped)
}

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
  beforeSend(event) {
    return stripPiiFromEvent(event)
  },
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
  registerDiagnosticsHandlers()
  registerSupportBundleHandler()
  registerRelayHandlers()
  createWindow()

  // Enrich Sentry context with GPU and display info
  const display = screen.getPrimaryDisplay()
  Sentry.setContext('display', {
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor,
  })
  app.getGPUInfo('basic').then((info) => {
    Sentry.setContext('gpu', info as Record<string, unknown>)
  }).catch(() => { /* non-critical */ })

  try {
    const { port, pingPort, token } = await spawnPython()
    logger.info('[Main] Python sidecar started', { port, pingPort })
    setRelayPort(port, token)
    await startWatchdog(pingPort, token)
  } catch (err) {
    Sentry.captureException(err, { tags: { source: 'python-spawn' } })
    logger.error('[Main] Failed to start Python sidecar', { error: String(err) })
  }
})

app.on('window-all-closed', () => {
  stopWatchdog()
  closeRelay()
  killPython()
  app.quit()
})
