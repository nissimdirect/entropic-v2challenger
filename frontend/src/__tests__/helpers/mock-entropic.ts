/**
 * Mock for the Entropic preload bridge (window.entropic).
 *
 * The 6-method preload bridge is the mock boundary for component tests.
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
}

/**
 * Creates a mock EntropicBridge with sensible defaults.
 * Override any method by passing partial overrides.
 */
export function createMockEntropic(
  overrides?: Partial<EntropicBridge>,
): EntropicBridge {
  return {
    sendCommand: vi.fn().mockResolvedValue({ ok: true }),
    selectFile: vi.fn().mockResolvedValue('/test/video.mp4'),
    selectSavePath: vi.fn().mockResolvedValue('/test/output.mp4'),
    onEngineStatus: vi.fn(),
    onExportProgress: vi.fn().mockReturnValue(vi.fn()),
    getPathForFile: vi.fn().mockReturnValue('/test/video.mp4'),
    ...overrides,
  }
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
