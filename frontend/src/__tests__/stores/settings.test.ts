/**
 * Settings store tests — telemetry consent check/set.
 * Sprint 1B.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import type { EntropicBridge } from '../helpers/mock-entropic'
import { useSettingsStore } from '../../renderer/stores/settings'

let mock: EntropicBridge

beforeEach(() => {
  mock = setupMockEntropic()
  // Reset store state
  useSettingsStore.setState({
    telemetryConsent: null,
    consentChecked: false,
  })
})

afterEach(() => {
  teardownMockEntropic()
})

describe('useSettingsStore', () => {
  it('checkConsent returns null when bridge returns null', async () => {
    ;(mock.checkTelemetryConsent as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    await useSettingsStore.getState().checkConsent()

    const state = useSettingsStore.getState()
    expect(state.telemetryConsent).toBeNull()
    expect(state.consentChecked).toBe(true)
  })

  it('checkConsent returns true when bridge returns true', async () => {
    ;(mock.checkTelemetryConsent as ReturnType<typeof vi.fn>).mockResolvedValue(true)

    await useSettingsStore.getState().checkConsent()

    expect(useSettingsStore.getState().telemetryConsent).toBe(true)
    expect(useSettingsStore.getState().consentChecked).toBe(true)
  })

  it('checkConsent returns false when bridge returns false', async () => {
    ;(mock.checkTelemetryConsent as ReturnType<typeof vi.fn>).mockResolvedValue(false)

    await useSettingsStore.getState().checkConsent()

    expect(useSettingsStore.getState().telemetryConsent).toBe(false)
  })

  it('setConsent(true) calls bridge and updates state', async () => {
    await useSettingsStore.getState().setConsent(true)

    expect(mock.setTelemetryConsent).toHaveBeenCalledWith(true)
    expect(useSettingsStore.getState().telemetryConsent).toBe(true)
  })

  it('setConsent(false) calls bridge and updates state', async () => {
    await useSettingsStore.getState().setConsent(false)

    expect(mock.setTelemetryConsent).toHaveBeenCalledWith(false)
    expect(useSettingsStore.getState().telemetryConsent).toBe(false)
  })

  it('checkConsent handles missing window.entropic gracefully', async () => {
    teardownMockEntropic()

    await useSettingsStore.getState().checkConsent()

    expect(useSettingsStore.getState().consentChecked).toBe(true)
  })
})
