/**
 * F-0516-7 — zero-adjustment util effects (curves, levels, hsl, color_balance)
 * fire a one-time info toast on first add to set user expectations that the
 * effect starts neutral until params are adjusted. The toast is gated by
 * localStorage so each effect_id fires at most once per browser profile.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Don't clobber jsdom's window — just augment it with the entropic bridge.
;(window as unknown as { entropic: unknown }).entropic = {
  onEngineStatus: () => {},
  sendCommand: async () => ({ ok: true }),
  selectFile: async () => null,
  selectSavePath: async () => null,
  onExportProgress: () => {},
}

// happy-dom's localStorage is a stub missing .clear(). Install a Map-backed
// Storage so per-test reset works deterministically.
function installMapBackedLocalStorage() {
  const store = new Map<string, string>()
  const ls: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
  }
  Object.defineProperty(window, 'localStorage', {
    value: ls,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: ls,
    writable: true,
    configurable: true,
  })
}

import { useProjectStore } from '../../renderer/stores/project'
import { useToastStore } from '../../renderer/stores/toast'
import { useUndoStore } from '../../renderer/stores/undo'
import { ZERO_DEFAULT_EFFECT_IDS } from '../../shared/limits'
import type { EffectInstance } from '../../shared/types'

function makeEffect(effectId: string): EffectInstance {
  return {
    id: `inst-${Math.random().toString(36).slice(2)}`,
    effectId,
    isEnabled: true,
    isFrozen: false,
    parameters: {},
    modulations: {},
    mix: 1,
    mask: null,
  }
}

function zeroDefaultStorageKey(effectId: string): string {
  return `entropic.toast.zeroDefault.shown.${effectId}`
}

beforeEach(() => {
  installMapBackedLocalStorage()
  useProjectStore.getState().resetProject()
  useToastStore.setState({ toasts: [] })
  useUndoStore.getState().clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('F-0516-7: zero-default effect toast', () => {
  it('addEffect fires a zero-default toast on first add of a util effect', () => {
    useProjectStore.getState().addEffect(makeEffect('util.curves'))
    const toasts = useToastStore.getState().toasts
    const hit = toasts.find((t) => t.source === 'zero-default:util.curves')
    expect(hit).toBeTruthy()
    expect(hit?.level).toBe('info')
    expect(hit?.message).toMatch(/starts neutral/i)
  })

  it('second add of the same effect does NOT re-fire the toast', () => {
    useProjectStore.getState().addEffect(makeEffect('util.curves'))
    useToastStore.setState({ toasts: [] })
    useProjectStore.getState().addEffect(makeEffect('util.curves'))
    const toasts = useToastStore.getState().toasts
    expect(
      toasts.find((t) => t.source === 'zero-default:util.curves'),
    ).toBeUndefined()
  })

  it('localStorage flag is set after first toast (cross-session persistence)', () => {
    useProjectStore.getState().addEffect(makeEffect('util.levels'))
    expect(localStorage.getItem(zeroDefaultStorageKey('util.levels'))).toBe('1')
  })

  it('non-zero-default effects (e.g. fx.invert) do NOT fire the toast', () => {
    useProjectStore.getState().addEffect(makeEffect('fx.invert'))
    const toasts = useToastStore.getState().toasts
    expect(
      toasts.find((t) => (t.source ?? '').startsWith('zero-default:')),
    ).toBeUndefined()
  })

  it('each zero-default effect fires its own independent one-time toast', () => {
    for (const effectId of ZERO_DEFAULT_EFFECT_IDS) {
      useProjectStore.getState().addEffect(makeEffect(effectId))
    }
    const zeroDefaultToasts = useToastStore
      .getState()
      .toasts.filter((t) => (t.source ?? '').startsWith('zero-default:'))
    expect(zeroDefaultToasts.length).toBe(ZERO_DEFAULT_EFFECT_IDS.size)

    // All gate keys persisted
    for (const effectId of ZERO_DEFAULT_EFFECT_IDS) {
      expect(localStorage.getItem(zeroDefaultStorageKey(effectId))).toBe('1')
    }
  })

  it('preserves the existing chain-limit toast path (does not regress)', () => {
    // Fill the chain to limit
    for (let i = 0; i < 10; i++) {
      useProjectStore.getState().addEffect(makeEffect('fx.invert'))
    }
    useToastStore.setState({ toasts: [] })
    // 11th add — should toast about the limit, NOT the zero-default
    useProjectStore.getState().addEffect(makeEffect('util.curves'))
    const toasts = useToastStore.getState().toasts
    expect(toasts.find((t) => t.message.includes('chain limit'))).toBeTruthy()
    expect(useProjectStore.getState().effectChain.length).toBe(10)
  })
})
