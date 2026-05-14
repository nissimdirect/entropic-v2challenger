import { contextBridge, ipcRenderer } from 'electron'

// RT-1: READ-ONLY preload — exposes ONLY frame updates and close signal.
// MUST NOT expose ipcRenderer.invoke() or ipcRenderer.send().

// Preload-level cache: IPC listener attaches before the renderer's React mount,
// so frames sent by main during the gap (loadURL → did-finish-load → DOM parse →
// React mount → useEffect) are captured here and replayed when onFrameUpdate subscribes.
let latestFrame: string | null = null
let frameCb: ((dataUrl: string) => void) | null = null

ipcRenderer.on('pop-out:frame', (_event, dataUrl: string) => {
  latestFrame = dataUrl
  if (frameCb) frameCb(dataUrl)
})

contextBridge.exposeInMainWorld('entropicPopOut', {
  onFrameUpdate: (callback: (dataUrl: string) => void): void => {
    frameCb = callback
    if (latestFrame !== null) callback(latestFrame)
  },

  onClose: (callback: () => void): void => {
    ipcRenderer.on('pop-out:close', () => callback())
  },
})
