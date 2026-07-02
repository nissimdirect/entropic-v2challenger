import { create } from 'zustand'

interface SettingsState {
  telemetryConsent: boolean | null
  consentChecked: boolean
  preferences: Record<string, unknown>
  checkConsent: () => Promise<void>
  setConsent: (consent: boolean) => Promise<void>
  loadPreferences: () => Promise<void>
  savePreferences: (prefs: Record<string, unknown>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  telemetryConsent: null,
  consentChecked: false,
  preferences: {},

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

  loadPreferences: async () => {
    if (!window.entropic) return
    try {
      const prefs = await window.entropic.readPreferences()
      set({ preferences: prefs })
    } catch {
      // Best-effort — keep empty defaults
    }
  },

  savePreferences: async (prefs: Record<string, unknown>) => {
    if (!window.entropic) return
    try {
      await window.entropic.writePreferences(prefs)
      set({ preferences: prefs })
    } catch {
      // Best-effort
    }
  },
}))
