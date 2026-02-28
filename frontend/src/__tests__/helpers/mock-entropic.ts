/**
 * Mock for the Entropic preload bridge (window.entropic).
 *
 * The 12-method preload bridge is the mock boundary for component tests.
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
  getAppPath: (name: string) => Promise<string>
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
    getAppPath: vi.fn().mockResolvedValue('/test/userData'),
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
    delete (window as Record<string, unknown>).entropic
  }
}
