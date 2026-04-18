/**
 * UAT E-12: zmq-relay.ts `shouldStopExportPoll` decision fn.
 *
 * Covers the idle-race fix — polling must NOT stop on the first 'idle'
 * response, since there's a tiny window between `export_start` returning
 * ok=True and the worker thread transitioning IDLE→RUNNING where a 500ms
 * poll can land. Requires 3 consecutive idles before stopping.
 *
 * Pure unit test — no Electron, no IPC.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock Electron surface (transitively imported by zmq-relay via watchdog)
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: vi.fn(() => '/mock'), isReady: vi.fn(() => true) },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => []),
  },
}))
vi.mock('@sentry/electron/main', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}))
vi.mock('zeromq', () => ({
  Request: vi.fn(() => ({
    connect: vi.fn(),
    send: vi.fn(),
    receive: vi.fn(),
    close: vi.fn(),
  })),
}))

import { shouldStopExportPoll } from '../../main/zmq-relay'

describe('UAT E-12: shouldStopExportPoll', () => {
  describe('terminal states stop immediately', () => {
    it('complete → stop, resets strikes', () => {
      const r = shouldStopExportPoll(0, 'complete')
      expect(r.stop).toBe(true)
      expect(r.reason).toBe('terminal')
      expect(r.newIdleStrikes).toBe(0)
    })

    it('cancelled → stop, resets strikes', () => {
      const r = shouldStopExportPoll(0, 'cancelled')
      expect(r.stop).toBe(true)
      expect(r.reason).toBe('terminal')
    })

    it('error → stop, resets strikes', () => {
      const r = shouldStopExportPoll(0, 'error')
      expect(r.stop).toBe(true)
      expect(r.reason).toBe('terminal')
    })

    it('terminal state stops even if strikes already accumulated', () => {
      const r = shouldStopExportPoll(2, 'complete')
      expect(r.stop).toBe(true)
      expect(r.newIdleStrikes).toBe(0)
    })
  })

  describe('idle state requires 3 consecutive strikes', () => {
    it('1st idle poll → continue (THE RACE FIX — previously stopped here)', () => {
      const r = shouldStopExportPoll(0, 'idle')
      expect(r.stop).toBe(false)
      expect(r.newIdleStrikes).toBe(1)
      expect(r.reason).toBe('continue')
    })

    it('2nd consecutive idle poll → continue', () => {
      const r = shouldStopExportPoll(1, 'idle')
      expect(r.stop).toBe(false)
      expect(r.newIdleStrikes).toBe(2)
    })

    it('3rd consecutive idle poll → stop (sustained-idle)', () => {
      const r = shouldStopExportPoll(2, 'idle')
      expect(r.stop).toBe(true)
      expect(r.newIdleStrikes).toBe(3)
      expect(r.reason).toBe('sustained-idle')
    })
  })

  describe('non-idle, non-terminal states reset strikes', () => {
    it('running resets strikes to 0, continues', () => {
      const r = shouldStopExportPoll(2, 'running')
      expect(r.stop).toBe(false)
      expect(r.newIdleStrikes).toBe(0)
      expect(r.reason).toBe('continue')
    })

    it('running after idle(1) keeps polling and resets', () => {
      const r = shouldStopExportPoll(1, 'running')
      expect(r.stop).toBe(false)
      expect(r.newIdleStrikes).toBe(0)
    })

    it('unknown state also resets strikes (safe default)', () => {
      const r = shouldStopExportPoll(2, 'some-future-status')
      expect(r.stop).toBe(false)
      expect(r.newIdleStrikes).toBe(0)
    })
  })

  describe('interleaved sequence (regression scenario)', () => {
    it('idle → idle → running → idle → idle → idle → stop', () => {
      let strikes = 0
      const sequence = ['idle', 'idle', 'running', 'idle', 'idle', 'idle']
      const stops: boolean[] = []
      for (const state of sequence) {
        const r = shouldStopExportPoll(strikes, state)
        strikes = r.newIdleStrikes
        stops.push(r.stop)
      }
      // First two idles: continue. Running resets. Three more idles: stop only at 3rd.
      expect(stops).toEqual([false, false, false, false, false, true])
    })

    it('the original bug reproduction: poll 1 = idle (pre-fix: would stop)', () => {
      // With the fix, first idle does NOT stop.
      const r = shouldStopExportPoll(0, 'idle')
      expect(r.stop).toBe(false)
    })

    it('the fast-export path: first poll returns complete, must stop immediately', () => {
      // 1-frame instant export: poll 1 lands at status=complete. Must stop.
      const r = shouldStopExportPoll(0, 'complete')
      expect(r.stop).toBe(true)
    })
  })
})
