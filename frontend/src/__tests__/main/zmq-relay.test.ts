/**
 * Tests for ZMQ relay — command allowlist, filtering, basic handler registration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn(() => '/mock'), isReady: vi.fn(() => true) },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => []),
  },
}))

// Mock sentry
vi.mock('@sentry/electron/main', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

// Mock zeromq — prevent real socket creation
vi.mock('zeromq', () => ({
  Request: vi.fn(() => ({
    receiveTimeout: 0,
    linger: 0,
    connect: vi.fn(),
    send: vi.fn(),
    receive: vi.fn(() => [Buffer.from(JSON.stringify({ id: 'test', ok: true }))]),
    close: vi.fn(),
  })),
}))

// Mock watchdog (breaks circular import chain)
vi.mock('../../main/watchdog', () => ({
  setRenderInFlight: vi.fn(),
}))

// Mock python spawner
vi.mock('../../main/python', () => ({
  spawnPython: vi.fn(),
  killPython: vi.fn(),
}))

// Mock logger
vi.mock('../../main/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { registerRelayHandlers, setRelayPort } from '../../main/zmq-relay'
import { ipcMain } from 'electron'

describe('zmq-relay', () => {
  let handlers: Record<string, (...args: unknown[]) => Promise<unknown>>

  beforeEach(() => {
    handlers = {}
    vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler) => {
      handlers[channel] = handler as (...args: unknown[]) => Promise<unknown>
      return undefined as unknown as Electron.IpcMain
    })
    // Set up relay with a port and token so commands aren't rejected as "not connected"
    setRelayPort(5555, 'test-token')
    registerRelayHandlers()
  })

  describe('command allowlist', () => {
    it('forwards valid commands', async () => {
      const result = await handlers['send-command'](
        {} as Electron.IpcMainInvokeEvent,
        { cmd: 'ping', id: 'test-1' },
      )
      // Should get a response (from mock ZMQ), not a rejection
      expect(result).toBeDefined()
      expect((result as Record<string, unknown>).ok).toBe(true)
    })

    it('rejects shutdown command', async () => {
      const result = await handlers['send-command'](
        {} as Electron.IpcMainInvokeEvent,
        { cmd: 'shutdown', id: 'test-2' },
      )
      expect((result as Record<string, unknown>).ok).toBe(false)
      expect((result as Record<string, unknown>).error).toContain('Unknown command')
    })

    it('rejects unknown command', async () => {
      const result = await handlers['send-command'](
        {} as Electron.IpcMainInvokeEvent,
        { cmd: 'evil_command', id: 'test-3' },
      )
      expect((result as Record<string, unknown>).ok).toBe(false)
      expect((result as Record<string, unknown>).error).toContain('Unknown command')
    })

    it('rejects missing cmd field', async () => {
      const result = await handlers['send-command'](
        {} as Electron.IpcMainInvokeEvent,
        { id: 'test-4' },
      )
      expect((result as Record<string, unknown>).ok).toBe(false)
      expect((result as Record<string, unknown>).error).toContain('Unknown command')
    })

    it('allows all documented commands', async () => {
      const validCommands = [
        'render_frame', 'render_composite', 'apply_chain', 'seek',
        'ingest', 'list_effects', 'effect_health', 'effect_stats',
        'export_start', 'export_cancel', 'export_status',
        'audio_decode', 'audio_load', 'audio_play', 'audio_pause',
        'audio_stop', 'audio_seek', 'audio_volume', 'audio_position', 'waveform',
        'clock_sync', 'clock_set_fps',
        'freeze_prefix', 'read_freeze', 'flatten', 'invalidate_cache',
        'flush_state', 'memory_status',
        'check_dag', 'ping',
      ]

      for (const cmd of validCommands) {
        const result = await handlers['send-command'](
          {} as Electron.IpcMainInvokeEvent,
          { cmd, id: `test-${cmd}` },
        )
        expect((result as Record<string, unknown>).ok).not.toBe(false,
          `Command '${cmd}' should be allowed but was rejected`)
      }
    })
  })

  describe('handler registration', () => {
    it('registers send-command, select-file, select-save-path', () => {
      expect(Object.keys(handlers)).toEqual(
        expect.arrayContaining(['send-command', 'select-file', 'select-save-path']),
      )
    })
  })

  describe('select-save-path (F-0512-7)', () => {
    beforeEach(async () => {
      const { dialog, BrowserWindow } = await import('electron')
      vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue({} as never)
      vi.mocked(dialog.showSaveDialog).mockReset()
    })

    it('strips duplicate extension when macOS appends one ("foo.mp4.mp4" → "foo.mp4")', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/Users/x/foo.mp4.mp4',
      } as never)

      const result = await handlers['select-save-path']({}, 'output.mp4')
      expect(result).toBe('/Users/x/foo.mp4')
    })

    it('passes single extension through unchanged ("foo.mp4")', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/Users/x/foo.mp4',
      } as never)

      const result = await handlers['select-save-path']({}, 'output.mp4')
      expect(result).toBe('/Users/x/foo.mp4')
    })

    it('is case-insensitive ("foo.MP4.mp4" → "foo.MP4")', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/Users/x/foo.MP4.mp4',
      } as never)

      const result = await handlers['select-save-path']({}, 'output.mp4')
      expect(result).toBe('/Users/x/foo.MP4')
    })

    it('does not strip when extensions differ ("foo.bak.mp4")', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/Users/x/foo.bak.mp4',
      } as never)

      const result = await handlers['select-save-path']({}, 'output.mp4')
      expect(result).toBe('/Users/x/foo.bak.mp4')
    })

    it('returns null on cancel', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: true,
        filePath: undefined,
      } as never)

      const result = await handlers['select-save-path']({}, 'output.mp4')
      expect(result).toBeNull()
    })

    it('omits filter when defaultName has no extension (image sequence) — F-0512-23', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/Users/x/uat-seq',
      } as never)

      const result = await handlers['select-save-path']({}, 'frame_sequence')
      expect(result).toBe('/Users/x/uat-seq')
      const callArgs = vi.mocked(dialog.showSaveDialog).mock.calls[0][1]
      expect(callArgs.filters).toBeUndefined()
    })

    it('uses gif filter when defaultName is .gif', async () => {
      const { dialog } = await import('electron')
      vi.mocked(dialog.showSaveDialog).mockResolvedValue({
        canceled: false,
        filePath: '/Users/x/loop.gif',
      } as never)

      await handlers['select-save-path']({}, 'output.gif')
      const callArgs = vi.mocked(dialog.showSaveDialog).mock.calls[0][1]
      expect(callArgs.filters).toEqual([{ name: 'GIF', extensions: ['gif'] }])
    })
  })
})
