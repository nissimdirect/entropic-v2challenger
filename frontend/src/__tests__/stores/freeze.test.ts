import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.entropic
const mockSendCommand = vi.fn()
;(globalThis as any).window = {
  entropic: {
    sendCommand: mockSendCommand,
    onEngineStatus: () => {},
    selectFile: async () => null,
    selectSavePath: async () => null,
    onExportProgress: () => () => {},
  },
}

import { useFreezeStore } from '../../renderer/stores/freeze'

describe('useFreezeStore', () => {
  beforeEach(() => {
    useFreezeStore.getState().reset()
    mockSendCommand.mockReset()
  })

  it('starts with no frozen prefixes', () => {
    const state = useFreezeStore.getState()
    expect(state.frozenPrefixes).toEqual({})
  })

  it('isFrozen returns false when no freeze exists', () => {
    const state = useFreezeStore.getState()
    expect(state.isFrozen('track-1', 0)).toBe(false)
    expect(state.isFrozen('track-1', 5)).toBe(false)
  })

  it('freezePrefix stores cache info on success', async () => {
    mockSendCommand.mockResolvedValue({ ok: true, cache_id: 'cache-abc' })

    await useFreezeStore.getState().freezePrefix(
      'track-1', 2, '/video.mp4', [{ effect_id: 'fx.invert' }], 42, 100, [1280, 720]
    )

    const state = useFreezeStore.getState()
    expect(state.frozenPrefixes['track-1']).toEqual({
      cacheId: 'cache-abc',
      cutIndex: 2,
    })
  })

  it('isFrozen returns true for effects at or below cutIndex', async () => {
    mockSendCommand.mockResolvedValue({ ok: true, cache_id: 'cache-abc' })

    await useFreezeStore.getState().freezePrefix(
      'track-1', 2, '/video.mp4', [], 42, 100, [1280, 720]
    )

    const state = useFreezeStore.getState()
    expect(state.isFrozen('track-1', 0)).toBe(true)
    expect(state.isFrozen('track-1', 1)).toBe(true)
    expect(state.isFrozen('track-1', 2)).toBe(true)
    expect(state.isFrozen('track-1', 3)).toBe(false)
  })

  it('unfreezePrefix removes cache info and sends invalidate', async () => {
    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-xyz' })
    await useFreezeStore.getState().freezePrefix(
      'track-1', 1, '/video.mp4', [], 42, 50, [1280, 720]
    )

    mockSendCommand.mockResolvedValueOnce({ ok: true })
    await useFreezeStore.getState().unfreezePrefix('track-1')

    expect(useFreezeStore.getState().frozenPrefixes['track-1']).toBeUndefined()
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'invalidate_cache', cache_id: 'cache-xyz' })
    )
  })

  it('unfreezePrefix is no-op for unknown track', async () => {
    await useFreezeStore.getState().unfreezePrefix('nonexistent')
    expect(mockSendCommand).not.toHaveBeenCalled()
  })

  it('getFreezeInfo returns info or null', async () => {
    mockSendCommand.mockResolvedValue({ ok: true, cache_id: 'cache-123' })
    await useFreezeStore.getState().freezePrefix(
      'track-1', 3, '/video.mp4', [], 42, 100, [1280, 720]
    )

    expect(useFreezeStore.getState().getFreezeInfo('track-1')).toEqual({
      cacheId: 'cache-123',
      cutIndex: 3,
    })
    expect(useFreezeStore.getState().getFreezeInfo('track-2')).toBeNull()
  })

  it('flattenPrefix sends flatten command', async () => {
    mockSendCommand.mockResolvedValueOnce({ ok: true, cache_id: 'cache-flat' })
    await useFreezeStore.getState().freezePrefix(
      'track-1', 2, '/video.mp4', [], 42, 100, [1280, 720]
    )

    mockSendCommand.mockResolvedValueOnce({ ok: true, output_path: '/output.mp4' })
    const result = await useFreezeStore.getState().flattenPrefix('track-1', '/output.mp4', 30)

    expect(result).toBe('/output.mp4')
    expect(mockSendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'flatten', cache_id: 'cache-flat' })
    )
  })

  it('flattenPrefix returns null for unknown track', async () => {
    const result = await useFreezeStore.getState().flattenPrefix('nonexistent', '/out.mp4')
    expect(result).toBeNull()
  })

  it('reset clears all frozen prefixes', async () => {
    mockSendCommand.mockResolvedValue({ ok: true, cache_id: 'cache-a' })
    await useFreezeStore.getState().freezePrefix(
      'track-1', 1, '/video.mp4', [], 42, 100, [1280, 720]
    )

    useFreezeStore.getState().reset()
    expect(useFreezeStore.getState().frozenPrefixes).toEqual({})
  })
})
