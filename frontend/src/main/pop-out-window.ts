import { BrowserWindow, ipcMain, screen } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { clampFinite } from '../shared/numeric'

const POP_OUT_STATE_PATH = join(homedir(), '.entropic', 'pop-out-state.json')

interface PopOutBounds {
  x: number
  y: number
  width: number
  height: number
}

let popOutWindow: BrowserWindow | null = null
let saveTimeout: ReturnType<typeof setTimeout> | null = null
// F-0514-6: heartbeat keeps pop-out's disconnect-detection honest. The old
// approach used frame arrival as a proxy for liveness, which produced a false
// "Disconnected" overlay every time the main app paused (no new frames → 2s
// timeout → false alarm). A dedicated ping decouples liveness from playback.
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const HEARTBEAT_INTERVAL_MS = 1000

/**
 * Send to the pop-out window without leaking webContents-disposed errors.
 *
 * The pop-out close sequence flips state in this order:
 *   close → renderer disposed → 'closed' event → popOutWindow.isDestroyed()
 *
 * Our setInterval and async send paths can fire in the window between
 * "renderer disposed" and "isDestroyed flips true," so even with an
 * isDestroyed guard the send call still throws "Render frame was disposed
 * before WebFrameMain could be accessed". Both checks AND the try/catch are
 * required — the first eliminates the common case, the second covers the race.
 *
 * RT-2 (qa-redteam follow-up): the catch is NARROWED to renderer-disposed
 * messages. Any other throw (channel typo, non-serializable arg, future
 * Electron internal) routes to `console.warn` so future regressions surface
 * instead of silently killing the heartbeat.
 */
// Narrowed to the actual Electron disposal error strings. The previous
// pattern matched `invalid` and `destroyed` as bare substrings, which would
// silently swallow any future Electron error containing those words (e.g.
// "invalid argument" on a channel rename, or "Render process destroyed" on
// an unrelated crash). Now only renderer-disposed races are silenced.
const DISPOSED_ERROR_PATTERN = /Render frame was disposed|WebFrameMain|webContents.*disposed/i

function safeSend(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  if (win.isDestroyed()) return
  try {
    if (win.webContents.isDestroyed()) return
    win.webContents.send(channel, ...args)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!DISPOSED_ERROR_PATTERN.test(message)) {
      console.warn(`[pop-out] safeSend(${channel}) unexpected error:`, err)
    }
    // Expected dispose race: silently drop — the 'closed' handler will clear
    // timers and null the ref shortly.
  }
}

function loadPopOutBounds(): PopOutBounds | null {
  try {
    if (!existsSync(POP_OUT_STATE_PATH)) return null
    const raw = readFileSync(POP_OUT_STATE_PATH, 'utf8')
    const state = JSON.parse(raw) as PopOutBounds
    if (
      typeof state.x !== 'number' ||
      typeof state.y !== 'number' ||
      typeof state.width !== 'number' ||
      typeof state.height !== 'number'
    ) {
      return null
    }
    if (state.width < 200 || state.height < 150) return null
    return state
  } catch {
    return null
  }
}

function savePopOutBounds(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    const bounds = win.getBounds()
    const state: PopOutBounds = {
      x: bounds.x,
      y: bounds.y,
      width: clampFinite(bounds.width, 200, 4000, 640),
      height: clampFinite(bounds.height, 150, 3000, 480),
    }
    const dir = join(homedir(), '.entropic')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(POP_OUT_STATE_PATH, JSON.stringify(state), 'utf8')
  } catch {
    // Non-critical — silently fail
  }
}

function validatePopOutBounds(saved: PopOutBounds): PopOutBounds | null {
  try {
    const rect = { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    const display = screen.getDisplayMatching(rect)
    const { x: dx, y: dy, width: dw, height: dh } = display.workArea
    const overlapX = Math.max(0, Math.min(rect.x + rect.width, dx + dw) - Math.max(rect.x, dx))
    const overlapY = Math.max(0, Math.min(rect.y + rect.height, dy + dh) - Math.max(rect.y, dy))
    if (overlapX >= 50 && overlapY >= 50) {
      return rect
    }
  } catch {
    // screen API not ready
  }
  return null
}

export function createPopOutWindow(): BrowserWindow {
  // HT-4: Check if existing window ref is still alive
  if (popOutWindow && !popOutWindow.isDestroyed()) {
    popOutWindow.focus()
    return popOutWindow
  }

  const saved = loadPopOutBounds()
  const validated = saved ? validatePopOutBounds(saved) : null

  const winOpts = validated
    ? { x: validated.x, y: validated.y, width: validated.width, height: validated.height }
    : { width: 640, height: 480 }

  popOutWindow = new BrowserWindow({
    ...winOpts,
    ...(!validated ? { center: true } : {}),
    title: 'Entropic — Preview',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/pop-out.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Debounced bounds save
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (popOutWindow && !popOutWindow.isDestroyed()) {
        savePopOutBounds(popOutWindow)
      }
    }, 500)
  }
  popOutWindow.on('resize', debouncedSave)
  popOutWindow.on('move', debouncedSave)

  popOutWindow.on('closed', () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    popOutWindow = null
    pendingFirstFrame = null
  })

  // F-0512-47: flush the buffered frame once the renderer + preload are loaded.
  // We use `did-finish-load` because the preload's `ipcRenderer.on(...)` listener
  // is established before this event fires, and the preload also caches the
  // latest frame for the React mount that follows.
  popOutWindow.webContents.once('did-finish-load', () => {
    if (pendingFirstFrame && popOutWindow && !popOutWindow.isDestroyed()) {
      safeSend(popOutWindow, 'pop-out:frame', pendingFirstFrame)
      pendingFirstFrame = null
    }
    // F-0514-6: start the heartbeat once the preload is wired. Fire one
    // immediate ping so the renderer doesn't flash Disconnected before the
    // first interval tick.
    if (popOutWindow && !popOutWindow.isDestroyed()) {
      safeSend(popOutWindow, 'pop-out:ping')
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      heartbeatTimer = setInterval(() => {
        if (!popOutWindow || popOutWindow.isDestroyed()) {
          if (heartbeatTimer) clearInterval(heartbeatTimer)
          heartbeatTimer = null
          return
        }
        safeSend(popOutWindow, 'pop-out:ping')
      }, HEARTBEAT_INTERVAL_MS)
    }
  })

  // CSP header — mirror main window (dev mode needs 'unsafe-inline' for Vite's
  // React Fast Refresh preamble, otherwise the renderer never mounts)
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'"
  popOutWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [`default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:`],
      },
    })
  })

  // Prevent navigation
  popOutWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    // Dev mode: load the pop-out page from Vite dev server
    const devUrl = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')
    popOutWindow.loadURL(`${devUrl}/pop-out.html`)
  } else {
    popOutWindow.loadFile(join(__dirname, '../renderer/pop-out.html'))
  }

  return popOutWindow
}

export function closePopOutWindow(): void {
  if (popOutWindow && !popOutWindow.isDestroyed()) {
    popOutWindow.webContents.send('pop-out:close')
    popOutWindow.destroy()
  }
  popOutWindow = null
}

const MAX_FRAME_SIZE = 10 * 1024 * 1024 // 10MB — reject absurdly large frames

let popOutRelayCount = 0
let popOutRelayDropWindow = 0
let popOutRelayDropSize = 0
// F-0512-47: buffer the most recent frame until the pop-out finishes loading.
// `webContents.send` silently drops messages sent before the renderer's IPC
// listeners are attached — and `createPopOutWindow` returns synchronously while
// `loadFile` is still in flight. Without this buffer, the renderer's
// immediate-send-on-open (PreviewCanvas.handlePopOut) was ALWAYS too early on
// first open, producing the F-0512-47 solid-black pop-out window.
let pendingFirstFrame: string | null = null

export function sendFrameToPopOut(dataUrl: string): void {
  if (!popOutWindow || popOutWindow.isDestroyed()) {
    popOutRelayDropWindow++
    if (popOutRelayDropWindow <= 3 || popOutRelayDropWindow % 50 === 0) {
      console.log(`[pop-out-relay] drop (no window): count=${popOutRelayDropWindow}`)
    }
    return
  }
  if (dataUrl.length > MAX_FRAME_SIZE) {
    popOutRelayDropSize++
    console.log(`[pop-out-relay] drop (size ${dataUrl.length} > ${MAX_FRAME_SIZE}): count=${popOutRelayDropSize}`)
    return
  }
  if (popOutWindow.webContents.isLoading()) {
    // Renderer + preload not ready yet — stash the latest frame and let
    // did-finish-load flush it. Overwriting is correct: any earlier buffered
    // frame is now stale.
    pendingFirstFrame = dataUrl
    return
  }
  popOutRelayCount++
  if (popOutRelayCount <= 3 || popOutRelayCount % 30 === 0) {
    console.log(`[pop-out-relay] forward #${popOutRelayCount} len=${dataUrl.length}`)
  }
  safeSend(popOutWindow, 'pop-out:frame', dataUrl)
}

export function isPopOutOpen(): boolean {
  return popOutWindow !== null && !popOutWindow.isDestroyed()
}

export function registerPopOutHandlers(): void {
  ipcMain.handle('pop-out:open', () => {
    createPopOutWindow()
  })

  ipcMain.handle('pop-out:close', () => {
    closePopOutWindow()
  })

  ipcMain.handle('pop-out:is-open', () => {
    return isPopOutOpen()
  })

  // Frame relay: renderer sends frame data, main forwards to pop-out window
  ipcMain.on('pop-out:relay-frame', (_event, dataUrl: string) => {
    sendFrameToPopOut(dataUrl)
  })
}
