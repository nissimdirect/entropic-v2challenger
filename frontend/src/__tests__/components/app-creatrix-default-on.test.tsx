/**
 * Build task #20 (2026-07-03) — F_CREATRIX_LAYOUT default flip.
 *
 * Smoke test: the Creatrix layout is now ON by default. A fresh session
 * (no localStorage override, no env var) must mount <App /> with the
 * `.app--creatrix` class applied (App.tsx line ~3402:
 *   className={`app${FF.F_CREATRIX_LAYOUT ? ' app--creatrix' : ''}`}).
 *
 * No vi.mock of feature-flags here — this deliberately exercises the REAL
 * default polarity (isFixEnabled('creatrix-layout'), disable-by-override),
 * matching what a brand-new user launching the app would see.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import App from '../../renderer/App'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('App — F_CREATRIX_LAYOUT default ON (build task #20)', () => {
  it('mounts with .app--creatrix when no override is set', async () => {
    setupMockEntropic({
      onMenuAction: () => () => {},
    })

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.querySelector('.app')).toBeTruthy()
    })

    expect(container.querySelector('.app--creatrix')).toBeTruthy()
  })

  // The disable-override path (entropic-disable-creatrix-layout) requires
  // re-evaluating the feature-flags module with localStorage pre-set — that
  // requires vi.resetModules() + dynamic import, which is exercised in
  // src/__tests__/stores/creatrix-layout.test.ts rather than duplicated here.
})
