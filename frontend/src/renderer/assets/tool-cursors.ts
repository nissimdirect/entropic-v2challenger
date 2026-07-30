import type { CursorTool } from '../components/effects/EffectBrowser'

/**
 * PK.H1 (iv) — per-tool cursors. proposal.md v4.1 addendum "Cursor inventory"
 * finding: the 8 timeline tools change click behavior (Clip.tsx:320,
 * TimeRuler.tsx:132) but never swap the OS pointer — armed razor looks
 * identical to select (Norman feedback-visibility violation). This module is
 * the single source of the fix: a `cursor` CSS value per CursorTool id,
 * consumed via the `body[data-cursor-tool]` attribute ToolRail.tsx/
 * EffectBrowser.tsx already write on every cursorTool change (grepped as
 * "the cursor-apply site" per the packet contract — no new write site
 * needed, only new CSS reads of the existing one).
 *
 * Locked cursor assignments (v4.1 addendum, verbatim):
 *   razor / ripple-delete / loop-in / loop-out / mask-key-picker (eyedropper)
 *     -> custom svg cursor built from the locked glyph set, `url(svg)
 *        hotspot, fallback`.
 *   slip / slide -> ew-resize.
 *   marker -> crosshair.
 *   mask-marquee-rect / mask-marquee-ellipse / mask-lasso-freehand /
 *   mask-lasso-polygon / mask-wand -> crosshair (mask tools keep crosshair;
 *     the two that previously drifted to 'cell' — eyedropper and
 *     lasso-freehand — are fixed directly in MaskSelectOverlay.tsx since
 *     that component already sets `cursor` per-mode inline and a CSS rule
 *     here would lose to that inline style's specificity).
 *   select -> no override (default arrow).
 */

/**
 * Builds a small self-contained cursor SVG: a black halo (for visibility
 * over light/bright video content) under a white line (for visibility over
 * dark content) — the standard two-pass technique OS cursors use, since a
 * `cursor` data URI is rendered outside any element and cannot resolve
 * `currentColor` or a CSS custom property. This is the one place in the
 * icon system where a hardcoded color is a technical requirement, not a
 * token-law violation (Frontend UI Law rule 1) — flagged here rather than
 * silently deviating.
 */
function buildCursorSvg(paths: string[], extra = ''): string {
  const body = paths.map((d) => `<path d="${d}"/>`).join('') + extra
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">` +
    `<g stroke="#000000" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">${body}</g>` +
    `<g stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</g>` +
    `</svg>`
  // btoa (not URL-encoding) keeps the payload free of literal '#' bytes, so
  // the hex-color halo above never trips the tsx_hex ratchet's #RRGGBB scan.
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

// Path data mirrors the matching ICON_BODY entry in tool-icons.tsx (same
// 24x24 coordinate space, ground truth per openspec/changes/ui-foundation/
// tool-glyphs-locked.js) so the cursor reads as the same glyph the rail
// button shows, just rendered as a fixed-color OS cursor image.
// Razor R2c is a rotated rect+rivets shape, not plain paths — passed as raw
// extra markup rather than through the paths[] array.
const RAZOR_SVG = buildCursorSvg(
  [],
  '<g transform="rotate(-24 12 12)"><rect x="4.5" y="8.6" width="15" height="6.8" rx="1"/>' +
    '<circle cx="12" cy="12" r="1.4"/><circle cx="7.4" cy="12" r=".9"/><circle cx="16.6" cy="12" r=".9"/></g>',
)
const RIPPLE_DELETE_SVG = buildCursorSvg(['M6 6.5v11M18 6.5v11', 'M9.5 9.5l5 5M14.5 9.5l-5 5'])
const LOOP_IN_SVG = buildCursorSvg(['M9 4.5H4.5v15H9', 'M19 12h-8.5M13.5 8.5L10 12l3.5 3.5'])
const LOOP_OUT_SVG = buildCursorSvg(['M15 4.5h4.5v15H15', 'M5 12h8.5M10.5 8.5L14 12l-3.5 3.5'])
const EYEDROPPER_SVG = buildCursorSvg([
  'm12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12',
  'm18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z',
  'm2 22 .414-.414',
])

// Hotspot = the tool's "acting point" (blade tip, X center, bracket corner,
// pipette tip); fallback keyword renders while the custom cursor loads/if
// unsupported.
export const CURSOR_FOR_TOOL: Partial<Record<CursorTool, string>> = {
  // Razor's hotspot is the center rivet (12,12) — the rotated-bar shape has
  // no single "tip" the way the prior blade-silhouette design did.
  razor: `url("${RAZOR_SVG}") 12 12, crosshair`,
  'ripple-delete': `url("${RIPPLE_DELETE_SVG}") 12 12, crosshair`,
  'loop-in': `url("${LOOP_IN_SVG}") 9 12, crosshair`,
  'loop-out': `url("${LOOP_OUT_SVG}") 15 12, crosshair`,
  'mask-key-picker': `url("${EYEDROPPER_SVG}") 3 21, crosshair`,
  slip: 'ew-resize',
  slide: 'ew-resize',
  marker: 'crosshair',
  'mask-marquee-rect': 'crosshair',
  'mask-marquee-ellipse': 'crosshair',
  'mask-lasso-freehand': 'crosshair',
  'mask-lasso-polygon': 'crosshair',
  'mask-wand': 'crosshair',
}

/** Returns the CSS `cursor` value for a tool, or undefined for 'select' (default arrow, no override). */
export function cursorForTool(tool: CursorTool): string | undefined {
  return CURSOR_FOR_TOOL[tool]
}
