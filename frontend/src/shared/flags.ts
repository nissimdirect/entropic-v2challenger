/**
 * Feature flags (Creatrix). Read once at module load.
 *
 * F_CREATRIX_LAYOUT — gates the new Creatrix layout shell + 5-tab browser +
 * polymorphic inspector (PR-A). Off by default → the existing layout stays the
 * live experience; flipping it on swaps in the new shell. Set via localStorage
 * (`creatrix.flags.layout = "1"`) or the `VITE_F_CREATRIX_LAYOUT` env at build.
 */

function readFlag(lsKey: string, envKey: string): boolean {
  try {
    const ls = globalThis.localStorage?.getItem(lsKey)
    if (ls === '1' || ls === 'true') return true
    if (ls === '0' || ls === 'false') return false
  } catch {
    // localStorage unavailable (SSR / tests) — fall through to env
  }
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  return env?.[envKey] === '1' || env?.[envKey] === 'true'
}

export const F_CREATRIX_LAYOUT = readFlag('creatrix.flags.layout', 'VITE_F_CREATRIX_LAYOUT')
