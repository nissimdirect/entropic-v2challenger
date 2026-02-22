import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('entropic', {
  onEngineStatus: (
    callback: (data: { status: string; uptime?: number }) => void,
  ) => {
    ipcRenderer.on('engine-status', (_event, data) => callback(data))
  },

  sendCommand: (command: Record<string, unknown>): Promise<Record<string, unknown>> => {
    return ipcRenderer.invoke('send-command', command)
  },

  selectFile: (filters: { name: string; extensions: string[] }[]): Promise<string | null> => {
    return ipcRenderer.invoke('select-file', filters)
  },

  selectSavePath: (defaultName: string): Promise<string | null> => {
    return ipcRenderer.invoke('select-save-path', defaultName)
  },

  onExportProgress: (
    callback: (data: { jobId: string; progress: number; done: boolean; error?: string }) => void,
  ) => {
    ipcRenderer.on('export-progress', (_event, data) => callback(data))
  },
})
