/**
 * Format a `shortcutRegistry`-style key string (e.g. `meta+shift+k`) into a
 * compact UI hint suitable for right-aligning in a menu item (e.g. `⌘⇧K`).
 *
 * Returns undefined when the key is empty so callers can short-circuit
 * rendering — `<span>{prettyShortcut(...)}</span>` would render an empty span
 * if we returned `""`. Returning undefined lets `{shortcut && <span>…</span>}`
 * skip cleanly.
 */
const MOD_GLYPH: Record<string, string> = {
  meta: '⌘', // ⌘
  ctrl: '⌃', // ⌃
  alt: '⌥', // ⌥
  shift: '⇧', // ⇧
}

const KEY_GLYPH: Record<string, string> = {
  space: 'Space',
  return: '⏎', // ⏎
  escape: 'Esc',
  tab: 'Tab',
  backspace: '⌫', // ⌫
  delete: '⌦', // ⌦
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
}

export function prettyShortcut(keys: string | undefined | null): string | undefined {
  if (!keys) return undefined
  const parts = keys.toLowerCase().split('+')
  const key = parts.pop() ?? ''
  const mods = parts.map((m) => MOD_GLYPH[m] ?? m)
  const keyDisplay = KEY_GLYPH[key] ?? key.toUpperCase()
  return mods.join('') + keyDisplay
}
