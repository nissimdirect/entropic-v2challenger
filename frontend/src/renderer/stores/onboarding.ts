/**
 * P3.5 — Onboarding store.
 *
 * Persists first-launch ritual state to localStorage under the
 * `creatrix.onboarding.*` prefix (§8 key table, ONBOARDING-SPEC.md).
 * No telemetry; all state is local (§8 telemetry = none).
 *
 * Key table (§8):
 *   creatrix.onboarding.v1.dismissed  — bool — dismiss-forever
 *   creatrix.onboarding.launchCount   — int  — auto-open launches with no engagement
 *   creatrix.onboarding.engaged       — bool — any card opened ever
 *   creatrix.onboarding.promptAnswered — bool — §7 prompt shown + answered
 *   creatrix.onboarding.tourSeen.<demoId> — bool — per-demo tour completion
 */
import { create } from 'zustand'

// ── localStorage keys ────────────────────────────────────────────────────
export const ONBOARDING_KEYS = {
  dismissed: 'creatrix.onboarding.v1.dismissed',
  launchCount: 'creatrix.onboarding.launchCount',
  engaged: 'creatrix.onboarding.engaged',
  promptAnswered: 'creatrix.onboarding.promptAnswered',
  tourSeen: (demoId: string) => `creatrix.onboarding.tourSeen.${demoId}`,
} as const

// ── Helpers ──────────────────────────────────────────────────────────────
function readBool(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function readInt(key: string, fallback = 0): number {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // best-effort
  }
}

function writeInt(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // best-effort
  }
}

// ── Store ────────────────────────────────────────────────────────────────
interface OnboardingState {
  /** Whether the dismiss-forever checkbox has been checked (§7). */
  dismissed: boolean
  /** Number of auto-open launches with zero engagement. */
  launchCount: number
  /** Whether any demo card has ever been opened. */
  engaged: boolean
  /** Whether the §7 no-engagement toast prompt has been shown + answered. */
  promptAnswered: boolean
  /** Whether the demos drawer is currently open (transient UI state). */
  drawerOpen: boolean

  /** Called once on app mount. Reads persisted state and opens drawer if appropriate. */
  init: () => void
  /** Dismiss-forever: sets the key, closes the drawer. */
  dismiss: () => void
  /** Record that a demo card was opened (marks engagement). */
  recordEngagement: () => void
  /** Record that the no-engagement prompt was answered. */
  recordPromptAnswered: () => void
  /** Open/close the drawer imperatively (e.g. from demos nav entry). */
  openDrawer: () => void
  closeDrawer: () => void
  /** Mark a demo's tour as seen. */
  markTourSeen: (demoId: string) => void
  isTourSeen: (demoId: string) => boolean
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  dismissed: false,
  launchCount: 0,
  engaged: false,
  promptAnswered: false,
  drawerOpen: false,

  init() {
    const dismissed = readBool(ONBOARDING_KEYS.dismissed)
    const launchCount = readInt(ONBOARDING_KEYS.launchCount, 0)
    const engaged = readBool(ONBOARDING_KEYS.engaged)
    const promptAnswered = readBool(ONBOARDING_KEYS.promptAnswered)

    set({ dismissed, launchCount, engaged, promptAnswered })

    if (dismissed) {
      // Drawer never auto-opens when dismissed-forever.
      return
    }

    if (launchCount >= 3 && !engaged && !promptAnswered) {
      // 3 launches with zero engagement → the §7 prompt fires instead of auto-open.
      // The prompt is a toast surfaced by App.tsx watching this state; drawer stays closed.
      return
    }

    // First launch (launchCount === 0 and not dismissed) → auto-open.
    if (launchCount === 0) {
      set({ drawerOpen: true })
    }

    // Increment launch counter only on the first-run-eligible path.
    const nextCount = launchCount + 1
    writeInt(ONBOARDING_KEYS.launchCount, nextCount)
    set({ launchCount: nextCount })
  },

  dismiss() {
    writeBool(ONBOARDING_KEYS.dismissed, true)
    set({ dismissed: true, drawerOpen: false })
  },

  recordEngagement() {
    if (get().engaged) return
    writeBool(ONBOARDING_KEYS.engaged, true)
    set({ engaged: true })
  },

  recordPromptAnswered() {
    writeBool(ONBOARDING_KEYS.promptAnswered, true)
    set({ promptAnswered: true })
  },

  openDrawer() {
    set({ drawerOpen: true })
  },

  closeDrawer() {
    set({ drawerOpen: false })
  },

  markTourSeen(demoId) {
    writeBool(ONBOARDING_KEYS.tourSeen(demoId), true)
  },

  isTourSeen(demoId) {
    return readBool(ONBOARDING_KEYS.tourSeen(demoId))
  },
}))
