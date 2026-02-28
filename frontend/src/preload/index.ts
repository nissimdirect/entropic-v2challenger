import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('entropic', {
  getPathForFile: (file: File): string => {
    return webUtils.getPathForFile(file)
  },

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
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { jobId: string; progress: number; done: boolean; error?: string }) => callback(data)
    ipcRenderer.on('export-progress', handler)
    return () => ipcRenderer.removeListener('export-progress', handler)
  },

  showSaveDialog: (options: Record<string, unknown>): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:save', options)
  },

  showOpenDialog: (options: Record<string, unknown>): Promise<string | null> => {
    return ipcRenderer.invoke('dialog:open', options)
  },

  readFile: (filePath: string): Promise<string> => {
    return ipcRenderer.invoke('file:read', filePath)
  },

  writeFile: (filePath: string, data: string): Promise<void> => {
    return ipcRenderer.invoke('file:write', filePath, data)
  },

  deleteFile: (filePath: string): Promise<void> => {
    return ipcRenderer.invoke('file:delete', filePath)
  },

  getAppPath: (name: string): Promise<string> => {
    return ipcRenderer.invoke('app:getPath', name)
  },
})
