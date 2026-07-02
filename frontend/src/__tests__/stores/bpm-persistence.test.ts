/**
 * BPM project round-trip — previously write-default + never-read (tempo always
 * reset to 120 on reload). Verifies serialize writes the real bpm and hydrate
 * restores it (clamped).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockEntropic = {
  onEngineStatus: vi.fn(),
  sendCommand: vi.fn().mockResolvedValue({ ok: true }),
  onExportProgress: vi.fn().mockReturnValue(vi.fn()),
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { serializeProject, hydrateStores } from '../../renderer/project-persistence'
import { useProjectStore } from '../../renderer/stores/project'

beforeEach(() => {
  useProjectStore.getState().setBpm(120)
})

describe('BPM persistence round-trip', () => {
  it('serializeProject writes the actual store bpm (not the 120 default)', () => {
    useProjectStore.getState().setBpm(140)
    const obj = JSON.parse(serializeProject())
    expect(obj.settings.bpm).toBe(140)
  })

  it('hydrateStores restores bpm from a saved project', () => {
    useProjectStore.getState().setBpm(95)
    const obj = JSON.parse(serializeProject())
    useProjectStore.getState().setBpm(120) // wipe before reload
    hydrateStores(obj)
    expect(useProjectStore.getState().bpm).toBe(95)
  })

  it('round-trips a non-default tempo through save→load', () => {
    useProjectStore.getState().setBpm(174)
    const obj = JSON.parse(serializeProject())
    useProjectStore.getState().setBpm(120)
    hydrateStores(obj)
    expect(useProjectStore.getState().bpm).toBe(174)
  })
})
