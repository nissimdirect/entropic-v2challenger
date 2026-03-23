import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('entropic', {
  isTestMode: process.env.NODE_ENV === 'test',
  getPathForFile: (file: File): string => {
    return webUtils.getPathForFile(file)
  },

  onEngineStatus: (
    callback: (data: { status: string; uptime?: number; lastFrameMs?: number }) => void,
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

  listFiles: (dirPath: string, pattern?: string): Promise<string[]> => {
    return ipcRenderer.invoke('file:list', dirPath, pattern)
  },

  mkdirp: (dirPath: string): Promise<void> => {
    return ipcRenderer.invoke('file:mkdir', dirPath)
  },

  getAppPath: (name: string): Promise<string> => {
    return ipcRenderer.invoke('app:getPath', name)
  },

  // --- Diagnostics ---

  checkTelemetryConsent: (): Promise<boolean | null> => {
    return ipcRenderer.invoke('telemetry:check')
  },

  setTelemetryConsent: (consent: boolean): Promise<void> => {
    return ipcRenderer.invoke('telemetry:set', consent)
  },

  readCrashReports: (): Promise<Record<string, unknown>[]> => {
    return ipcRenderer.invoke('crash:list')
  },

  clearCrashReports: (): Promise<void> => {
    return ipcRenderer.invoke('crash:clear')
  },

  findAutosave: (): Promise<string | null> => {
    return ipcRenderer.invoke('autosave:find')
  },

  getSystemInfo: (): Promise<Record<string, unknown>> => {
    return ipcRenderer.invoke('system:info')
  },

  generateSupportBundle: (): Promise<string> => {
    return ipcRenderer.invoke('support:bundle')
  },

  submitFeedback: (text: string): Promise<void> => {
    return ipcRenderer.invoke('feedback:submit', text)
  },

  readPreferences: (): Promise<Record<string, unknown>> => {
    return ipcRenderer.invoke('preferences:read')
  },

  writePreferences: (data: Record<string, unknown>): Promise<void> => {
    return ipcRenderer.invoke('preferences:write', data)
  },

  readRecentProjects: (): Promise<{ path: string; name: string; lastModified: number }[]> => {
    return ipcRenderer.invoke('recentProjects:read')
  },

  writeRecentProjects: (data: { path: string; name: string; lastModified: number }[]): Promise<void> => {
    return ipcRenderer.invoke('recentProjects:write', data)
  },

  // --- Auto-update ---

  onUpdateAvailable: (
    callback: (data: { version: string; releaseDate?: string }) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { version: string; releaseDate?: string }) => callback(data)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },

  onUpdateDownloaded: (
    callback: (data: { version: string }) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data)
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },

  downloadUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('updater:download')
  },

  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('updater:install')
  },

  // --- Pop-out preview ---

  openPopOut: (): Promise<void> => {
    return ipcRenderer.invoke('pop-out:open')
  },

  closePopOut: (): Promise<void> => {
    return ipcRenderer.invoke('pop-out:close')
  },

  isPopOutOpen: (): Promise<boolean> => {
    return ipcRenderer.invoke('pop-out:is-open')
  },

  sendFrameToPopOut: (dataUrl: string): void => {
    ipcRenderer.send('pop-out:relay-frame', dataUrl)
  },

  // --- Menu actions ---

  onMenuAction: (
    callback: (action: string) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('menu:action', handler)
    return () => ipcRenderer.removeListener('menu:action', handler)
  },
})
