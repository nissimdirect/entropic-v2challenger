import { contextBridge, ipcRenderer } from 'electron'

// RT-1: READ-ONLY preload — exposes ONLY frame updates and close signal.
// MUST NOT expose ipcRenderer.invoke() or ipcRenderer.send().

contextBridge.exposeInMainWorld('entropicPopOut', {
  onFrameUpdate: (callback: (dataUrl: string) => void): void => {
    ipcRenderer.on('pop-out:frame', (_event, dataUrl: string) => callback(dataUrl))
  },

  onClose: (callback: () => void): void => {
    ipcRenderer.on('pop-out:close', () => callback())
  },
})
