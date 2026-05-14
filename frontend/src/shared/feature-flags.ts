/**
 * Feature flags for the 2026-05-12 UAT bugfix sweep.
 *
 * Each fix from that sweep is gated by a flag so that regressions
 * surfaced after merge can be disabled in isolation without reverting
 * the whole branch.
 *
 * Default behavior: every flag is ENABLED. The fixes are active.
 *
 * To DISABLE a fix at runtime (devtools console, no rebuild):
 *   localStorage.setItem('entropic-disable-f-0512-14', '1')
 *   location.reload()
 *
 * To DISABLE a fix at build time:
 *   VITE_ENTROPIC_DISABLE_F_0512_14=1 npm run build
 *
 * Flag names are kebab-case bug IDs ("f-0512-14"). Each fix exports a
 * boolean property whose value is TRUE when the fix is active.
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

function isFixEnabled(slug: string): boolean {
  const lsKey = `entropic-disable-${slug}`
  const envKey = `VITE_ENTROPIC_DISABLE_${slug.toUpperCase().replace(/-/g, '_')}`
  return !readLocalStorageFlag(lsKey) && !readEnvFlag(envKey)
}

/**
 * Feature-flag map. Each property is TRUE when the corresponding 2026-05-12
 * UAT bugfix is active. Keys mirror the F-0512-N bug IDs.
 */
export const FF = {
  // ── P0 ─────────────────────────────────────────────────────────────────
  /** F-0512-14: space/play-pause coordinates audio + timer + resets transport direction */
  F_0512_14_SPACE_TRANSPORT: isFixEnabled('f-0512-14'),
  /** F-0512-29: project-reload triggers a render once activeAssetPath is rebound */
  F_0512_29_RELOAD_REBIND: isFixEnabled('f-0512-29'),

  // ── P1 ─────────────────────────────────────────────────────────────────
  /** F-0512-2: empty-state hint reads `[Cmd]+[I]` instead of relying on the ⌘ glyph */
  F_0512_2_CMD_I_HINT: isFixEnabled('f-0512-2'),
  /** F-0512-6: requestRenderFrame reads chain from store, not the captured closure */
  F_0512_6_UNDO_RERENDER: isFixEnabled('f-0512-6'),
  /** F-0512-17: status bar reads canvasResolution, not the last rendered frame width */
  F_0512_17_STATUS_BAR_CANVAS: isFixEnabled('f-0512-17'),
  /** F-0512-19: render-trigger useEffect also subscribes to `tracks` */
  F_0512_19_TRACKS_RERENDER: isFixEnabled('f-0512-19'),
  /** F-0512-30: device-card width 160-280px so 4-knob effects fit on one row */
  F_0512_30_CARD_WIDTH: isFixEnabled('f-0512-30'),
  /** F-0512-32: rename input focuses reliably after the context menu unmounts */
  F_0512_32_RENAME_FOCUS: isFixEnabled('f-0512-32'),

  // ── P2 ─────────────────────────────────────────────────────────────────
  /** F-0512-1: handleNewProject clears autosave + crashReports + gate dialog on welcomeDismissed */
  F_0512_1_WELCOME_MODAL: isFixEnabled('f-0512-1'),
  /** F-0512-3: title bar reads "Entropic" while WelcomeScreen is up */
  F_0512_3_TITLE_BAR: isFixEnabled('f-0512-3'),
  /** F-0512-7: select-save-path strips macOS's double-appended extension */
  F_0512_7_EXPORT_DOUBLE_EXT: isFixEnabled('f-0512-7'),
  /** F-0512-8: clip thumbnails distribute evenly across clip width */
  F_0512_8_CLIP_THUMBS: isFixEnabled('f-0512-8'),
  /** F-0512-16: second Stop/Escape press clears an unintended loop region */
  F_0512_16_ESCAPE_LOOP: isFixEnabled('f-0512-16'),
  /** F-0512-21: opacity sliders labeled "Clip opacity" vs "Track opacity (multiplies)" */
  F_0512_21_OPACITY_LABELS: isFixEnabled('f-0512-21'),
  /** F-0512-22: backend export error message is `<Type>: <msg>` not "Export failed: <Type>" */
  F_0512_22_ERROR_FORMAT: isFixEnabled('f-0512-22'),
  /** F-0512-23: select-save-path derives filter from defaultName's extension */
  F_0512_23_DERIVED_FILTER: isFixEnabled('f-0512-23'),
  /** F-0512-25: Timeline zoom persists in .glitch files */
  F_0512_25_ZOOM_PERSIST: isFixEnabled('f-0512-25'),
  /** F-0512-34: automation toolbar tooltips + inline hint when no track is armed */
  F_0512_34_ARM_HINT: isFixEnabled('f-0512-34'),
  /** F-0512-36: transform panel max-height + overflow so effects search stays visible */
  F_0512_36_TRANSFORM_HEIGHT: isFixEnabled('f-0512-36'),
  /** F-0512-37: Help → Keyboard Shortcuts opens Preferences on the Shortcuts tab */
  F_0512_37_SHORTCUTS_TAB: isFixEnabled('f-0512-37'),
  /** F-0512-12/13: preview canvas locks CSS display size to bitmap so independent
   * max-width/max-height caps can't stretch the canvas to non-source aspect, and
   * the BoundingBoxOverlay's contain-fit math aligns with the visible canvas. */
  F_0512_12_PREVIEW_ASPECT: isFixEnabled('f-0512-12'),
} as const

/**
 * Apply CSS-disabled-attribute toggles to the document body so CSS rules
 * scoped with `body[data-disable-f-0512-N]` can selectively revert visual
 * fixes. Call from the renderer entry point exactly once after mount.
 */
export function applyCssDisableFlags(): void {
  if (typeof document === 'undefined') return
  const cssFixes: Array<[boolean, string]> = [
    [FF.F_0512_8_CLIP_THUMBS, 'data-disable-f-0512-8'],
    [FF.F_0512_30_CARD_WIDTH, 'data-disable-f-0512-30'],
    [FF.F_0512_36_TRANSFORM_HEIGHT, 'data-disable-f-0512-36'],
  ]
  for (const [enabled, attr] of cssFixes) {
    if (enabled) {
      document.body.removeAttribute(attr)
    } else {
      document.body.setAttribute(attr, '1')
    }
  }
}
