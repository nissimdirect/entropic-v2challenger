// Augment ImportMeta for Vite env variables (electron-vite injects these)
interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  entropic: {
    isTestMode: boolean
    getPathForFile: (file: File) => string
    onEngineStatus: (
      callback: (data: { status: string; uptime?: number; lastFrameMs?: number }) => void,
    ) => void
    sendCommand: (command: Record<string, unknown>) => Promise<Record<string, unknown>>
    selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
    selectSavePath: (defaultName: string) => Promise<string | null>
    onExportProgress: (
      callback: (data: {
        jobId: string
        progress: number
        done: boolean
        error?: string
        currentFrame?: number
        totalFrames?: number
        etaSeconds?: number | null
        outputPath?: string
        status?: 'idle' | 'running' | 'complete' | 'cancelled' | 'error'
      }) => void,
    ) => () => void
    showSaveDialog: (options: Record<string, unknown>) => Promise<string | null>
    showOpenDialog: (options: Record<string, unknown>) => Promise<string | null>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, data: string) => Promise<void>
    deleteFile: (filePath: string) => Promise<void>
    listFiles: (dirPath: string, pattern?: string) => Promise<string[]>
    mkdirp: (dirPath: string) => Promise<void>
    getAppPath: (name: string) => Promise<string>
    checkTelemetryConsent: () => Promise<boolean | null>
    setTelemetryConsent: (consent: boolean) => Promise<void>
    readCrashReports: () => Promise<Record<string, unknown>[]>
    clearCrashReports: () => Promise<void>
    findAutosave: () => Promise<string | null>
    getSystemInfo: () => Promise<Record<string, unknown>>
    generateSupportBundle: () => Promise<string>
    submitFeedback: (text: string) => Promise<void>
    readPreferences: () => Promise<Record<string, unknown>>
    writePreferences: (data: Record<string, unknown>) => Promise<void>
    readRecentProjects: () => Promise<{ path: string; name: string; lastModified: number }[]>
    writeRecentProjects: (data: { path: string; name: string; lastModified: number }[]) => Promise<void>
    onUpdateAvailable?: (callback: (data: { version: string; releaseDate?: string }) => void) => (() => void)
    onUpdateDownloaded?: (callback: (data: { version: string }) => void) => (() => void)
    downloadUpdate?: () => Promise<void>
    installUpdate?: () => Promise<void>
    openPopOut: () => Promise<void>
    closePopOut: () => Promise<void>
    isPopOutOpen: () => Promise<boolean>
    sendFrameToPopOut: (dataUrl: string) => void
    onMenuAction: (callback: (action: string) => void) => () => void
    onCloseRequested: (callback: () => void) => () => void
    confirmClose: () => void
  }
}

// Electron extends File with a path property for drag-and-drop
interface File {
  readonly path: string
}
