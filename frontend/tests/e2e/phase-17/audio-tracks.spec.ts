// WHY E2E: Exercises the real ZMQ path through the Python sidecar: validate_upload
// + realpath + is_audio_magic + decode timeout + sample-count cap. Vitest component
// tests mock IPC; only an E2E hits the actual security guards and PyAV decode.

/**
 * Phase 17 — Audio Tracks — Backend IPC Guards
 *
 * PR-1 E2E coverage focuses on the backend contracts that cannot be reached
 * from vitest (which mocks sendCommand). UI mounting is covered by vitest
 * (audio-clip-view.test.tsx + timeline-audio.test.ts).
 */

import path from 'path'
import { test, expect } from '../fixtures/electron-app.fixture'
import { waitForEngineConnected } from '../fixtures/test-helpers'

function getTestAudioPath(): string {
  return path.resolve(__dirname, '..', '..', '..', '..', 'test-fixtures', 'audio', 'sine-440hz-500ms.wav')
}

async function sendCommandViaBridge(window: any, cmd: Record<string, unknown>): Promise<any> {
  return window.evaluate(async (c: Record<string, unknown>) => {
    const w = window as any
    if (!w.entropic?.sendCommand) return { ok: false, error: 'no bridge' }
    return await w.entropic.sendCommand(c)
  }, cmd)
}

test.describe('Phase 17 — Audio Tracks Backend Guards', () => {
  test.beforeEach(async ({ window }) => {
    await waitForEngineConnected(window, 20_000)
  })

  test('audio_decode probes real WAV fixture successfully', async ({ window }) => {
    test.setTimeout(15_000)
    const audioPath = getTestAudioPath()

    const result = await sendCommandViaBridge(window, {
      cmd: 'audio_decode',
      path: audioPath,
    })

    expect(result).toBeTruthy()
    expect(result.ok).toBe(true)
    // 0.5s fixture at 48kHz stereo
    expect(result.sample_rate).toBe(48000)
    expect(result.channels).toBe(2)
    expect(result.duration_s).toBeGreaterThan(0.4)
    expect(result.duration_s).toBeLessThan(0.6)
  })

  test('audio_decode rejects missing path (validate_upload)', async ({ window }) => {
    const result = await sendCommandViaBridge(window, {
      cmd: 'audio_decode',
      path: '/Users/nonexistent-user/fake-audio.wav',
    })
    expect(result.ok).toBe(false)
    expect(String(result.error ?? '').toLowerCase()).toMatch(/not found|path/)
  })

  test('audio_decode rejects path outside user home (SEC-5)', async ({ window }) => {
    const result = await sendCommandViaBridge(window, {
      cmd: 'audio_decode',
      path: '/etc/passwd',
    })
    expect(result.ok).toBe(false)
  })

  test('audio_decode rejects unsupported extension', async ({ window }) => {
    const result = await sendCommandViaBridge(window, {
      cmd: 'audio_decode',
      path: path.resolve(process.env.HOME || '/', 'Downloads', 'fake.exe'),
    })
    expect(result.ok).toBe(false)
  })

  test('waveform command returns peaks for real WAV', async ({ window }) => {
    test.setTimeout(15_000)
    const audioPath = getTestAudioPath()

    const result = await sendCommandViaBridge(window, {
      cmd: 'waveform',
      path: audioPath,
      num_bins: 100,
    })

    expect(result.ok).toBe(true)
    expect(Array.isArray(result.peaks)).toBe(true)
    expect(result.peaks.length).toBe(100)
  })

  test('waveform cached on second call (resolved-path key)', async ({ window }) => {
    test.setTimeout(15_000)
    const audioPath = getTestAudioPath()

    const first = await sendCommandViaBridge(window, {
      cmd: 'waveform',
      path: audioPath,
      num_bins: 64,
    })
    expect(first.ok).toBe(true)
    // First call may be cached from prior test run; skip cached assertion on first.

    const second = await sendCommandViaBridge(window, {
      cmd: 'waveform',
      path: audioPath,
      num_bins: 64,
    })
    expect(second.ok).toBe(true)
    expect(second.cached).toBe(true)
  })
})
