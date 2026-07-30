/**
 * Feature flags.
 *
 * F4b (2026-07-30): the 21 F_0512_* flags from the 2026-05-12 UAT bugfix
 * sweep were retired — those fixes have been default-ON with no reported
 * regressions for 11+ weeks, so the flag-OFF (pre-fix) branches were deleted
 * from source and the flag entries removed from this map. See the git
 * history of this file for the full list if a specific fix ever needs to be
 * traced back to its bug ID.
 *
 * `isFixEnabled` (disable-by-default polarity) and `isEnabled` (opt-in
 * polarity) remain as the shared mechanism for any future flagged rollout —
 * F_CREATRIX_LAYOUT below is the current live example.
 */

function readEnvFlag(key: string): boolean {
  // Vite injects build-time env vars on `import.meta.env`. Guard so this
  // file is safe to import from the main process / tests where the meta
  // object isn't populated.
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return env?.[key] === '1'
  } catch {
    return false
  }
}

function readLocalStorageFlag(key: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/**
 * isFixEnabled — disable-by-default polarity. Returns true unless
 * explicitly disabled via localStorage or env var.
 *
 * Disable at runtime:
 *   localStorage.setItem('entropic-disable-<slug>', '1')
 *   location.reload()
 *
 * Disable at build time:
 *   VITE_ENTROPIC_DISABLE_<SLUG>=1 npm run build
 */
function isFixEnabled(slug: string): boolean {
  const lsKey = `entropic-disable-${slug}`
  const envKey = `VITE_ENTROPIC_DISABLE_${slug.toUpperCase().replace(/-/g, '_')}`
  return !readLocalStorageFlag(lsKey) && !readEnvFlag(envKey)
}

/**
 * isEnabled — opt-in polarity (opposite of isFixEnabled).
 * Returns true only when explicitly enabled via localStorage or env var.
 * Use for new features that are OFF by default.
 *
 * Enable at runtime:
 *   localStorage.setItem('entropic-enable-creatrix-layout', '1')
 *   location.reload()
 *
 * Enable at build time:
 *   VITE_ENTROPIC_ENABLE_CREATRIX_LAYOUT=1 npm run build
 */
function isEnabled(slug: string): boolean {
  const lsKey = `entropic-enable-${slug}`
  const envKey = `VITE_ENTROPIC_ENABLE_${slug.toUpperCase().replace(/-/g, '_')}`
  return readLocalStorageFlag(lsKey) || readEnvFlag(envKey)
}

export const FF = {
  // ── Creatrix campaign ──────────────────────────────────────────────────
  /**
   * F_CREATRIX_LAYOUT: Creatrix CSS-grid app shell + 4 resize handles (P3.1).
   * ON by default (flipped 2026-07-03, build task #20) now that the lean-header
   * lock/arm/drag regression (#395) is fixed. Uses isFixEnabled's disable-by-default
   * polarity, so a fresh session (no localStorage/env) gets the Creatrix layout.
   *
   * To force it OFF at runtime (devtools console, no rebuild):
   *   localStorage.setItem('entropic-disable-creatrix-layout', '1')
   *   location.reload()
   *
   * To force it OFF at build time:
   *   VITE_ENTROPIC_DISABLE_CREATRIX_LAYOUT=1 npm run build
   */
  F_CREATRIX_LAYOUT: isFixEnabled('creatrix-layout'),
} as const
