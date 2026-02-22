import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('entropic', {
  onEngineStatus: (
    callback: (data: { status: string; uptime?: number }) => void,
  ) => {
    ipcRenderer.on('engine-status', (_event, data) => callback(data))
  },
})
