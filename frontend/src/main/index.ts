import * as Sentry from '@sentry/electron/main'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir, userInfo } from 'os'
import { app, BrowserWindow, screen } from 'electron'
import { spawnPython, killPython } from './python'
import { startWatchdog, stopWatchdog } from './watchdog'
import { registerRelayHandlers, setRelayPort, closeRelay } from './zmq-relay'
import { registerDiagnosticsHandlers } from './diagnostics-handlers'
import { registerSupportBundleHandler } from './support-bundle'
import { registerFileHandlers } from './file-handlers'
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

// --- Window state persistence ---

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

const WINDOW_STATE_PATH = join(homedir(), '.entropic', 'window-state.json')
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 800

function loadWindowState(): WindowState | null {
  try {
    if (!existsSync(WINDOW_STATE_PATH)) return null
    const raw = readFileSync(WINDOW_STATE_PATH, 'utf8')
    const state = JSON.parse(raw) as WindowState
    // Basic shape validation
    if (
      typeof state.x !== 'number' ||
      typeof state.y !== 'number' ||
      typeof state.width !== 'number' ||
      typeof state.height !== 'number' ||
      typeof state.isMaximized !== 'boolean'
    ) {
      return null
    }
    // Sanity: reject nonsensical sizes
    if (state.width < 400 || state.height < 300) return null
    return state
  } catch {
    return null
  }
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const isMaximized = win.isMaximized()
    // Save the non-maximized bounds so restore works correctly
    const bounds = isMaximized ? win.getNormalBounds?.() ?? win.getBounds() : win.getBounds()
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    }
    const dir = join(homedir(), '.entropic')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state), 'utf8')
  } catch {
    // Non-critical — silently fail
  }
}

function validateWindowBounds(state: WindowState): { x: number; y: number; width: number; height: number } {
  const rect = { x: state.x, y: state.y, width: state.width, height: state.height }
  try {
    const display = screen.getDisplayMatching(rect)
    const { x: dx, y: dy, width: dw, height: dh } = display.workArea
    // Check if at least 100px of the window is visible on this display
    const overlapX = Math.max(0, Math.min(rect.x + rect.width, dx + dw) - Math.max(rect.x, dx))
    const overlapY = Math.max(0, Math.min(rect.y + rect.height, dy + dh) - Math.max(rect.y, dy))
    if (overlapX >= 100 && overlapY >= 100) {
      return rect
    }
  } catch {
    // screen API not ready or failed
  }
  // Fall back to centered default
  return { x: undefined as unknown as number, y: undefined as unknown as number, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
}

function createWindow(): BrowserWindow {
  const saved = loadWindowState()
  let winOpts: { x?: number; y?: number; width: number; height: number }

  if (saved) {
    const validated = validateWindowBounds(saved)
    winOpts = validated
  } else {
    winOpts = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }

  const win = new BrowserWindow({
    ...winOpts,
    ...(winOpts.x === undefined ? { center: true } : {}),
    title: 'Entropic v2 Challenger',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Restore maximized state after creation
  if (saved?.isMaximized) {
    win.maximize()
  }

  // Debounced window state save on resize/move
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => saveWindowState(win), 500)
  }
  win.on('resize', debouncedSave)
  win.on('move', debouncedSave)
  win.on('close', () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveWindowState(win)
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
  registerFileHandlers()
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
