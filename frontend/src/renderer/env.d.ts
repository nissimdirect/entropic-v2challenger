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
    getPathForFile: (file: File) => string
    onEngineStatus: (
      callback: (data: { status: string; uptime?: number }) => void,
    ) => void
    sendCommand: (command: Record<string, unknown>) => Promise<Record<string, unknown>>
    selectFile: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
    selectSavePath: (defaultName: string) => Promise<string | null>
    onExportProgress: (
      callback: (data: { jobId: string; progress: number; done: boolean; error?: string }) => void,
    ) => void
  }
}

// Electron extends File with a path property for drag-and-drop
interface File {
  readonly path: string
}
