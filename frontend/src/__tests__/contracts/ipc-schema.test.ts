/**
 * IPC Contract Tests — validates the TypeScript preload bridge
 * methods align with the Python ZMQ server commands.
 *
 * This catches schema drift between frontend and backend without
 * running either. If a command exists on one side but not the other,
 * these tests fail.
 *
 * See: P97, docs/solutions/2026-02-28-e2e-test-pyramid.md
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Extract the preload bridge method names from the TypeScript source
function getPreloadMethods(): string[] {
  const preloadPath = resolve(
    __dirname,
    '../../../src/preload/index.ts',
  )
  const content = readFileSync(preloadPath, 'utf-8')

  // Match top-level method names inside contextBridge.exposeInMainWorld('entropic', { ... })
  // The 12 bridge methods are indented with exactly 2 spaces (direct object properties).
  // Deeper-indented identifiers (like `callback` params) must be excluded.
  const methodPattern =
    /^  (\w+)\s*:\s*(?:\(|async\s*\()/gm
  const methods: string[] = []
  let match: RegExpExecArray | null

  while ((match = methodPattern.exec(content)) !== null) {
    methods.push(match[1])
  }

  return methods.sort()
}

// Extract ZMQ command names from the Python backend
function getBackendCommands(): string[] {
  const zmqPath = resolve(
    __dirname,
    '../../../../backend/src/zmq_server.py',
  )
  const content = readFileSync(zmqPath, 'utf-8')

  const commands: string[] = []

  // Pattern: cmd == "command_name" (used in handle_message elif chain)
  const cmdPattern = /cmd\s*==\s*["'](\w+)["']/g
  let match: RegExpExecArray | null
  while ((match = cmdPattern.exec(content)) !== null) {
    if (!commands.includes(match[1])) {
      commands.push(match[1])
    }
  }

  return commands.sort()
}

describe('IPC Contract', () => {
  it('preload bridge exposes the expected 26 methods', () => {
    const methods = getPreloadMethods()

    expect(methods).toContain('sendCommand')
    expect(methods).toContain('selectFile')
    expect(methods).toContain('selectSavePath')
    expect(methods).toContain('onEngineStatus')
    expect(methods).toContain('onExportProgress')
    expect(methods).toContain('getPathForFile')
    expect(methods).toContain('showSaveDialog')
    expect(methods).toContain('showOpenDialog')
    expect(methods).toContain('readFile')
    expect(methods).toContain('writeFile')
    expect(methods).toContain('deleteFile')
    expect(methods).toContain('getAppPath')
    // Diagnostics bridge methods (Sprint 1A)
    expect(methods).toContain('checkTelemetryConsent')
    expect(methods).toContain('setTelemetryConsent')
    expect(methods).toContain('readCrashReports')
    expect(methods).toContain('clearCrashReports')
    expect(methods).toContain('findAutosave')
    expect(methods).toContain('getSystemInfo')
    expect(methods).toContain('generateSupportBundle')
    expect(methods).toContain('submitFeedback')
    // Phase 10: file listing + directory creation
    expect(methods).toContain('listFiles')
    expect(methods).toContain('mkdirp')
    // Phase 11: preferences + recent projects persistence
    expect(methods).toContain('readPreferences')
    expect(methods).toContain('writePreferences')
    expect(methods).toContain('readRecentProjects')
    expect(methods).toContain('writeRecentProjects')
    // Auto-update bridge methods (Sprint 11-4-11)
    expect(methods).toContain('onUpdateAvailable')
    expect(methods).toContain('onUpdateDownloaded')
    expect(methods).toContain('downloadUpdate')
    expect(methods).toContain('installUpdate')
    // Pop-out preview (Phase 16)
    expect(methods).toContain('openPopOut')
    expect(methods).toContain('closePopOut')
    expect(methods).toContain('isPopOutOpen')
    expect(methods).toContain('sendFrameToPopOut')
    // Menu actions (UAT sprint)
    expect(methods).toContain('onMenuAction')
    expect(methods).toHaveLength(35)
  })

  it('backend ZMQ server registers all expected commands', () => {
    const commands = getBackendCommands()

    // All 25 commands from handle_message()
    const expected = [
      'apply_chain',
      'audio_decode',
      'audio_load',
      'audio_pause',
      'audio_play',
      'audio_position',
      'audio_seek',
      'audio_stop',
      'audio_volume',
      'check_dag',
      'clock_set_fps',
      'clock_sync',
      'effect_health',
      'effect_stats',
      'export_cancel',
      'export_start',
      'export_status',
      'flatten',
      'flush_state',
      'freeze_prefix',
      'ingest',
      'invalidate_cache',
      'list_effects',
      'list_fonts',
      'memory_status',
      'ping',
      'read_freeze',
      'render_composite',
      'render_frame',
      'render_text_frame',
      'seek',
      'shutdown',
      'waveform',
    ]

    expect(commands).toEqual(expected)
  })

  it('preload bridge shape matches mock helper', async () => {
    // Verify the mock helper covers all bridge methods
    const { createMockEntropic } = await import(
      '../helpers/mock-entropic'
    )
    const mock = createMockEntropic()
    const mockMethods = Object.keys(mock).sort()
    const preloadMethods = getPreloadMethods()

    expect(mockMethods).toEqual(preloadMethods)
  })
})
