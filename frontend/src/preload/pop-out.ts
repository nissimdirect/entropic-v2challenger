import { contextBridge, ipcRenderer } from 'electron'

// RT-1: READ-ONLY preload — exposes ONLY frame updates, close signal, and ping.
// MUST NOT expose ipcRenderer.invoke() or ipcRenderer.send().

// Preload-level cache: IPC listener attaches before the renderer's React mount,
// so frames sent by main during the gap (loadURL → did-finish-load → DOM parse →
// React mount → useEffect) are captured here and replayed when onFrameUpdate subscribes.
let latestFrame: string | null = null
let frameCb: ((dataUrl: string) => void) | null = null
// F-0514-6: heartbeat plumbing. Main sends `pop-out:ping` ~1Hz; preload caches
// the timestamp so PopOutPreview can distinguish "channel dead" from "paused".
let lastPingAt: number = 0
let pingCb: (() => void) | null = null

ipcRenderer.on('pop-out:frame', (_event, dataUrl: string) => {
  latestFrame = dataUrl
  if (frameCb) frameCb(dataUrl)
})

ipcRenderer.on('pop-out:ping', () => {
  lastPingAt = Date.now()
  if (pingCb) pingCb()
})

contextBridge.exposeInMainWorld('entropicPopOut', {
  onFrameUpdate: (callback: (dataUrl: string) => void): void => {
    frameCb = callback
    if (latestFrame !== null) callback(latestFrame)
  },

  onClose: (callback: () => void): void => {
    ipcRenderer.on('pop-out:close', () => callback())
  },

  // F-0514-6: subscribe to main-process heartbeat. Callback fires on every
  // ping; getLastPingAt() lets the renderer compute its own staleness window.
  onPing: (callback: () => void): void => {
    pingCb = callback
    if (lastPingAt > 0) callback()
  },

  getLastPingAt: (): number => lastPingAt,
})
