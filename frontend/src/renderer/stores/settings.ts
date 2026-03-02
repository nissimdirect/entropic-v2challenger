import { create } from 'zustand'

interface SettingsState {
  telemetryConsent: boolean | null
  consentChecked: boolean
  checkConsent: () => Promise<void>
  setConsent: (consent: boolean) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  telemetryConsent: null,
  consentChecked: false,

  checkConsent: async () => {
    if (!window.entropic) {
      set({ consentChecked: true })
      return
    }
    try {
      const consent = await window.entropic.checkTelemetryConsent()
      set({ telemetryConsent: consent, consentChecked: true })
    } catch {
      set({ consentChecked: true })
    }
  },

  setConsent: async (consent: boolean) => {
    if (!window.entropic) return
    try {
      await window.entropic.setTelemetryConsent(consent)
      set({ telemetryConsent: consent })
    } catch {
      // Best-effort
    }
  },
}))
