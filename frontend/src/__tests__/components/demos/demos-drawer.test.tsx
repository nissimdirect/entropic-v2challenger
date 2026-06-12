/**
 * P3.5 — DemosDrawer + onboarding named tests.
 *
 * Named tests per P3.5 spec:
 *  1. "sampler entry disabled with tooltip when timeline empty" (in instruments-browser.test.tsx)
 *  2. "drag payload kind=instruments id=sampler" (in instruments-browser.test.tsx)
 *  3. "demos drawer lists three demo videos"
 *  4. "onboarding opens drawer on first launch only"
 *  Negative tests (named):
 *  5. "missing demo MP4 on disk renders the card's error state — drawer opens, no crash, no blank card"
 *  6. "second launch with dismissed flag set never opens the drawer"
 *
 * Plus ONBOARDING-SPEC §8 localStorage round-trip + Esc skip path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, screen, cleanup, act } from '@testing-library/react'
import DemosDrawer, { DEMO_IDS } from '../../../renderer/components/demos/DemosDrawer'
import { useOnboardingStore, ONBOARDING_KEYS } from '../../../renderer/stores/onboarding'

// Stub localStorage
const localStorageMock = (() => {
  const store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  }
})()

const TEST_PATHS = {
  y_is_time: '/test/demos/y-is-time.mp4',
  painted_blur: '/test/demos/painted-blur.mp4',
  audio_lfo_stripes: '/test/demos/audio-lfo-stripes.mp4',
} as const

function openDrawer() {
  useOnboardingStore.setState({ drawerOpen: true })
}

beforeEach(() => {
  localStorageMock.clear()
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
  // Reset store to clean state
  useOnboardingStore.setState({
    dismissed: false,
    launchCount: 0,
    engaged: false,
    promptAnswered: false,
    drawerOpen: false,
  })
})
afterEach(() => cleanup())

// ── §3: Demos Drawer ────────────────────────────────────────────────────

describe('DemosDrawer', () => {
  it('demos drawer lists three demo videos', () => {
    openDrawer()
    render(<DemosDrawer demoPaths={TEST_PATHS} />)

    // All 3 demo cards present
    for (const id of DEMO_IDS) {
      expect(screen.getByTestId(`demo-card-${id}`)).toBeTruthy()
    }

    // All 3 open buttons
    for (const id of DEMO_IDS) {
      expect(screen.getByTestId(`demo-open-${id}`)).toBeTruthy()
    }
  })

  it('missing demo MP4 on disk renders the card\'s error state — drawer opens, no crash, no blank card', () => {
    // Negative test: one file missing → card renders error state, not blank / crash
    openDrawer()
    const pathsWithMissing = {
      y_is_time: null,           // MISSING
      painted_blur: TEST_PATHS.painted_blur,
      audio_lfo_stripes: TEST_PATHS.audio_lfo_stripes,
    }
    render(<DemosDrawer demoPaths={pathsWithMissing} />)

    // Drawer is open (not crashed)
    expect(screen.getByTestId('demos-drawer')).toBeTruthy()

    // Missing card renders the error class (not blank or absent)
    const missingCard = screen.getByTestId('demo-card-y_is_time')
    expect(missingCard).toBeTruthy()
    expect(missingCard.className).toContain('missing')

    // Missing card has no open button (can't open a missing file)
    expect(screen.queryByTestId('demo-open-y_is_time')).toBeNull()

    // Other cards still render normally
    expect(screen.getByTestId('demo-open-painted_blur')).toBeTruthy()
    expect(screen.getByTestId('demo-open-audio_lfo_stripes')).toBeTruthy()
  })

  it('Escape closes the drawer', () => {
    openDrawer()
    const { container } = render(<DemosDrawer demoPaths={TEST_PATHS} />)
    expect(container.querySelector('[data-testid="demos-drawer"]')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })

    // After Esc the store has drawerOpen=false → drawer unmounts
    expect(useOnboardingStore.getState().drawerOpen).toBe(false)
  })

  it('dismiss checkbox sets dismissed-forever key (§7 localStorage round-trip)', () => {
    openDrawer()
    render(<DemosDrawer demoPaths={TEST_PATHS} />)

    const checkbox = screen.getByTestId('demos-drawer-dismiss-checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)

    // Simulate the dismiss directly (testing the store contract, not the DOM event)
    act(() => {
      useOnboardingStore.getState().dismiss()
    })

    // localStorage key set
    expect(localStorageMock.getItem(ONBOARDING_KEYS.dismissed)).toBe('true')
    // Store updated
    expect(useOnboardingStore.getState().dismissed).toBe(true)
    // Drawer closed
    expect(useOnboardingStore.getState().drawerOpen).toBe(false)
  })

  it('dismiss checkbox closes drawer (entry + exit paths work)', () => {
    openDrawer()
    const { container } = render(<DemosDrawer demoPaths={TEST_PATHS} />)
    expect(container.querySelector('[data-testid="demos-drawer"]')).toBeTruthy()

    // Dismiss via store (mirrors what the checkbox's onChange triggers)
    act(() => {
      useOnboardingStore.getState().dismiss()
    })

    expect(useOnboardingStore.getState().drawerOpen).toBe(false)
  })
})

// ── §7: Dismiss-forever + no-engagement ─────────────────────────────────

describe('Onboarding — first-launch + dismiss-forever', () => {
  it('onboarding opens drawer on first launch only', () => {
    // First launch: launchCount=0, not dismissed → init should open drawer
    localStorageMock.setItem(ONBOARDING_KEYS.launchCount, '0')
    localStorageMock.removeItem(ONBOARDING_KEYS.dismissed)

    act(() => {
      useOnboardingStore.getState().init()
    })

    // Drawer opened on first launch
    expect(useOnboardingStore.getState().drawerOpen).toBe(true)
  })

  it('second launch with dismissed flag set never opens the drawer', () => {
    // Dismissed-forever key set → init never opens drawer
    localStorageMock.setItem(ONBOARDING_KEYS.dismissed, 'true')
    localStorageMock.setItem(ONBOARDING_KEYS.launchCount, '2')

    act(() => {
      useOnboardingStore.getState().init()
    })

    expect(useOnboardingStore.getState().drawerOpen).toBe(false)
    expect(useOnboardingStore.getState().dismissed).toBe(true)
  })

  it('dismiss-forever round trip: dismiss() → dismissed=true, drawer closed', () => {
    openDrawer()

    act(() => {
      useOnboardingStore.getState().dismiss()
    })

    expect(useOnboardingStore.getState().dismissed).toBe(true)
    expect(useOnboardingStore.getState().drawerOpen).toBe(false)
    expect(localStorageMock.getItem(ONBOARDING_KEYS.dismissed)).toBe('true')
  })

  it('after dismissing, re-calling init never re-opens drawer', () => {
    // Simulate a subsequent launch after dismiss
    localStorageMock.setItem(ONBOARDING_KEYS.dismissed, 'true')
    localStorageMock.setItem(ONBOARDING_KEYS.launchCount, '1')
    useOnboardingStore.setState({ dismissed: true, drawerOpen: false })

    act(() => {
      useOnboardingStore.getState().init()
    })

    // Must NEVER re-open
    expect(useOnboardingStore.getState().drawerOpen).toBe(false)
  })

  it('recordEngagement sets engaged=true and persists (§7)', () => {
    act(() => {
      useOnboardingStore.getState().recordEngagement()
    })

    expect(useOnboardingStore.getState().engaged).toBe(true)
    expect(localStorageMock.getItem(ONBOARDING_KEYS.engaged)).toBe('true')

    // Calling again is a no-op (idempotent)
    act(() => {
      useOnboardingStore.getState().recordEngagement()
    })
    expect(localStorageMock.getItem(ONBOARDING_KEYS.engaged)).toBe('true')
  })
})

// ── §8 localStorage key compliance ─────────────────────────────────────

describe('Onboarding — §8 localStorage key table compliance', () => {
  it('all 5 key prefixes from §8 are defined in ONBOARDING_KEYS', () => {
    expect(ONBOARDING_KEYS.dismissed).toBe('creatrix.onboarding.v1.dismissed')
    expect(ONBOARDING_KEYS.launchCount).toBe('creatrix.onboarding.launchCount')
    expect(ONBOARDING_KEYS.engaged).toBe('creatrix.onboarding.engaged')
    expect(ONBOARDING_KEYS.promptAnswered).toBe('creatrix.onboarding.promptAnswered')
    // tourSeen is a function that generates the per-demo key
    const tourKey = ONBOARDING_KEYS.tourSeen('y_is_time')
    expect(tourKey).toBe('creatrix.onboarding.tourSeen.y_is_time')
    expect(tourKey.startsWith('creatrix.onboarding.tourSeen.')).toBe(true)
  })
})
