import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.entropic
;(globalThis as any).window = {
  entropic: {
    sendCommand: vi.fn().mockResolvedValue({ ok: true }),
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => () => {},
  },
}

import { useFreezeStore } from '../../renderer/stores/freeze'

describe('Freeze UI logic', () => {
  beforeEach(() => {
    useFreezeStore.getState().reset()
  })

  it('isFrozen returns false for empty state', () => {
    expect(useFreezeStore.getState().isFrozen('track-1', 0)).toBe(false)
  })

  it('isFrozen reflects correct range after freeze', async () => {
    const mock = (globalThis as any).window.entropic.sendCommand
    mock.mockResolvedValueOnce({ ok: true, cache_id: 'test-cache' })

    await useFreezeStore.getState().freezePrefix(
      'track-1', 3, '/video.mp4', [], 42, 100, [1280, 720]
    )

    // Effects 0-3 should be frozen
    expect(useFreezeStore.getState().isFrozen('track-1', 0)).toBe(true)
    expect(useFreezeStore.getState().isFrozen('track-1', 3)).toBe(true)
    // Effect 4 should not be frozen
    expect(useFreezeStore.getState().isFrozen('track-1', 4)).toBe(false)
    // Different track should not be frozen
    expect(useFreezeStore.getState().isFrozen('track-2', 0)).toBe(false)
  })

  it('unfreeze clears frozen state for track', async () => {
    const mock = (globalThis as any).window.entropic.sendCommand
    mock.mockResolvedValueOnce({ ok: true, cache_id: 'cache-1' })

    await useFreezeStore.getState().freezePrefix(
      'track-1', 2, '/video.mp4', [], 42, 100, [1280, 720]
    )
    expect(useFreezeStore.getState().isFrozen('track-1', 0)).toBe(true)

    mock.mockResolvedValueOnce({ ok: true })
    await useFreezeStore.getState().unfreezePrefix('track-1')
    expect(useFreezeStore.getState().isFrozen('track-1', 0)).toBe(false)
  })

  it('getFreezeInfo returns null for unfrozen track', () => {
    expect(useFreezeStore.getState().getFreezeInfo('unknown')).toBeNull()
  })

  it('context menu actions correspond to freeze state', async () => {
    const mock = (globalThis as any).window.entropic.sendCommand
    mock.mockResolvedValueOnce({ ok: true, cache_id: 'cache-ctx' })

    await useFreezeStore.getState().freezePrefix(
      'track-1', 1, '/video.mp4', [], 42, 100, [1280, 720]
    )

    const info = useFreezeStore.getState().getFreezeInfo('track-1')
    expect(info).not.toBeNull()
    expect(info!.cutIndex).toBe(1)
    expect(info!.cacheId).toBe('cache-ctx')
  })
})
