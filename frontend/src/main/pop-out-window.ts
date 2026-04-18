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
    popOutWindow = null
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
  popOutRelayCount++
  if (popOutRelayCount <= 3 || popOutRelayCount % 30 === 0) {
    console.log(`[pop-out-relay] forward #${popOutRelayCount} len=${dataUrl.length}`)
  }
  popOutWindow.webContents.send('pop-out:frame', dataUrl)
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
