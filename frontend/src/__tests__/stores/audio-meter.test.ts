/**
 * Audio store meter actions — F-0516-6 phase 2 wiring.
 *
 * Tests the `meter` field + `setMeter()` + `pollMeter()` IPC roundtrip
 * (mocked entropic.sendCommand). Covers happy path + the trust-boundary
 * defenses (NaN/Inf from backend → floor, transient ok:false → no clobber).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockSendCommand = vi.fn()

;(window as unknown as { entropic: unknown }).entropic = {
  onEngineStatus: () => {},
  sendCommand: mockSendCommand,
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => () => {},
}

import { useAudioStore, METER_FLOOR_DB } from '../../renderer/stores/audio'

beforeEach(() => {
  mockSendCommand.mockReset()
  useAudioStore.getState().reset()
})

describe('audio store — meter state', () => {
  it('initial meter is the floor reading (silence, not clipped)', () => {
    const meter = useAudioStore.getState().meter
    expect(meter.rmsDb).toBe(METER_FLOOR_DB)
    expect(meter.peakDb).toBe(METER_FLOOR_DB)
    expect(meter.clipped).toBe(false)
  })

  it('setMeter writes a new reading', () => {
    useAudioStore.getState().setMeter({ rmsDb: -9, peakDb: -3, clipped: false })
    const meter = useAudioStore.getState().meter
    expect(meter.rmsDb).toBe(-9)
    expect(meter.peakDb).toBe(-3)
    expect(meter.clipped).toBe(false)
  })

  it('reset() snaps meter back to floor', () => {
    useAudioStore.getState().setMeter({ rmsDb: -1, peakDb: 0, clipped: true })
    useAudioStore.getState().reset()
    const meter = useAudioStore.getState().meter
    expect(meter.rmsDb).toBe(METER_FLOOR_DB)
    expect(meter.clipped).toBe(false)
  })
})

describe('audio store — pollMeter()', () => {
  it('updates meter from a successful IPC response', async () => {
    mockSendCommand.mockResolvedValueOnce({
      ok: true,
      rms_db: -9.03,
      peak_db: -3.01,
      clipped: false,
    })

    const ok = await useAudioStore.getState().pollMeter()
    expect(ok).toBe(true)

    const meter = useAudioStore.getState().meter
    expect(meter.rmsDb).toBeCloseTo(-9.03, 2)
    expect(meter.peakDb).toBeCloseTo(-3.01, 2)
    expect(meter.clipped).toBe(false)
  })

  it('preserves prior meter on IPC error (no clobber to floor)', async () => {
    useAudioStore.getState().setMeter({ rmsDb: -6, peakDb: -3, clipped: false })
    mockSendCommand.mockResolvedValueOnce({ ok: false, error: 'transient' })

    const ok = await useAudioStore.getState().pollMeter()
    expect(ok).toBe(false)
    // Prior reading still in place — the UI shouldn't flash to silence
    // every time the sidecar drops a poll.
    expect(useAudioStore.getState().meter.rmsDb).toBe(-6)
    expect(useAudioStore.getState().meter.peakDb).toBe(-3)
  })

  it('clipped=true flag is propagated', async () => {
    mockSendCommand.mockResolvedValueOnce({
      ok: true,
      rms_db: -1,
      peak_db: 0,
      clipped: true,
    })
    await useAudioStore.getState().pollMeter()
    expect(useAudioStore.getState().meter.clipped).toBe(true)
  })

  it('non-finite backend values are clamped to floor (trust boundary)', async () => {
    mockSendCommand.mockResolvedValueOnce({
      ok: true,
      rms_db: -Infinity,
      peak_db: NaN,
      clipped: false,
    })
    await useAudioStore.getState().pollMeter()
    const meter = useAudioStore.getState().meter
    expect(meter.rmsDb).toBe(METER_FLOOR_DB)
    expect(meter.peakDb).toBe(METER_FLOOR_DB)
  })

  it('missing fields fall back to floor without crashing', async () => {
    mockSendCommand.mockResolvedValueOnce({ ok: true })
    await useAudioStore.getState().pollMeter()
    const meter = useAudioStore.getState().meter
    expect(meter.rmsDb).toBe(METER_FLOOR_DB)
    expect(meter.peakDb).toBe(METER_FLOOR_DB)
    expect(meter.clipped).toBe(false)
  })

  it('non-truthy clipped values default to false', async () => {
    mockSendCommand.mockResolvedValueOnce({
      ok: true,
      rms_db: -6,
      peak_db: -3,
      clipped: 'not-a-bool',
    })
    await useAudioStore.getState().pollMeter()
    expect(useAudioStore.getState().meter.clipped).toBe(false)
  })

  it('sends the audio_meter command', async () => {
    mockSendCommand.mockResolvedValueOnce({ ok: true, rms_db: -12, peak_db: -6, clipped: false })
    await useAudioStore.getState().pollMeter()
    const call = mockSendCommand.mock.calls[0][0]
    expect(call.cmd).toBe('audio_meter')
    expect(typeof call.id).toBe('string')
  })
})
