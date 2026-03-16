/**
 * Mock for the Entropic preload bridge (window.entropic).
 *
 * The 20-method preload bridge is the mock boundary for component tests.
 * Any test that can use createMockEntropic() should — only tests verifying
 * the bridge itself or process lifecycle need real Electron.
 *
 * See: P97 (Test at the Right Layer), docs/solutions/2026-02-28-e2e-test-pyramid.md
 */
import { vi } from 'vitest'

export interface EntropicBridge {
  getPathForFile: (file: File) => string
  onEngineStatus: (
    callback: (data: { status: string; uptime?: number }) => void,
  ) => void
  sendCommand: (
    command: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  selectFile: (
    filters: { name: string; extensions: string[] }[],
  ) => Promise<string | null>
  selectSavePath: (defaultName: string) => Promise<string | null>
  onExportProgress: (
    callback: (data: {
      jobId: string
      progress: number
      done: boolean
      error?: string
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
  onUpdateAvailable: (callback: (data: { version: string; releaseDate?: string }) => void) => () => void
  onUpdateDownloaded: (callback: (data: { version: string }) => void) => () => void
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
}

/**
 * Creates a mock EntropicBridge with sensible defaults.
 * Override any method by passing partial overrides.
 */
export function createMockEntropic(
  overrides?: Partial<EntropicBridge>,
): EntropicBridge {
  const defaults: EntropicBridge = {
    sendCommand: vi.fn().mockResolvedValue({ ok: true }),
    selectFile: vi.fn().mockResolvedValue('/test/video.mp4'),
    selectSavePath: vi.fn().mockResolvedValue('/test/output.mp4'),
    onEngineStatus: vi.fn(),
    onExportProgress: vi.fn().mockReturnValue(vi.fn()),
    getPathForFile: vi.fn().mockReturnValue('/test/video.mp4'),
    showSaveDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
    showOpenDialog: vi.fn().mockResolvedValue('/test/project.glitch'),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
    mkdirp: vi.fn().mockResolvedValue(undefined),
    getAppPath: vi.fn().mockResolvedValue('/test/userData'),
    checkTelemetryConsent: vi.fn().mockResolvedValue(null),
    setTelemetryConsent: vi.fn().mockResolvedValue(undefined),
    readCrashReports: vi.fn().mockResolvedValue([]),
    clearCrashReports: vi.fn().mockResolvedValue(undefined),
    findAutosave: vi.fn().mockResolvedValue(null),
    getSystemInfo: vi.fn().mockResolvedValue({ os: 'darwin', arch: 'arm64' }),
    generateSupportBundle: vi.fn().mockResolvedValue('/test/Desktop/entropic-support.tar.gz'),
    submitFeedback: vi.fn().mockResolvedValue(undefined),
    readPreferences: vi.fn().mockResolvedValue({}),
    writePreferences: vi.fn().mockResolvedValue(undefined),
    readRecentProjects: vi.fn().mockResolvedValue([]),
    writeRecentProjects: vi.fn().mockResolvedValue(undefined),
    onUpdateAvailable: vi.fn().mockReturnValue(vi.fn()),
    onUpdateDownloaded: vi.fn().mockReturnValue(vi.fn()),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    installUpdate: vi.fn().mockResolvedValue(undefined),
  }
  return { ...defaults, ...overrides }
}

/**
 * Installs a mock EntropicBridge on window.entropic.
 * Call in beforeEach() for component tests.
 * Returns the mock for assertions.
 */
export function setupMockEntropic(
  overrides?: Partial<EntropicBridge>,
): EntropicBridge {
  const mock = createMockEntropic(overrides)
  Object.defineProperty(window, 'entropic', {
    value: mock,
    writable: true,
    configurable: true,
  })
  return mock
}

/**
 * Removes window.entropic mock. Call in afterEach() for cleanup.
 */
export function teardownMockEntropic(): void {
  if ('entropic' in window) {
    delete (window as unknown as Record<string, unknown>).entropic
  }
}
