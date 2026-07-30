import type { ReactElement } from 'react'

/**
 * Creatrix tool-rail icon set — WIRE direction (PK.H1).
 *
 * OD-3 ROUND-2 VERDICTS (proposal.md, user dictation 2026-07-15, LOCKED):
 * icon direction = wire restyle set-wide (1.9 stroke, round caps, fills
 * opened). Supersedes the earlier BLOCK direction (2.7 stroke, square caps,
 * miter joins, solid fills) that shipped with PK.B/PK.B2.
 *
 * OD-3 FINAL GLYPH MANIFEST (proposal.md, 2026-07-18) assigns each of the 14
 * live CursorTool ids (EffectBrowser.tsx) one of:
 *   - OURS (custom, hand-drawn on this 24x24/1.9-stroke grid): razor, slip,
 *     rippledel, marqellipse-adjacent polylasso (Mask Polygon), marker,
 *     loopin, loopout.
 *   - LUCIDE (ISC, vendored path data — see VENDORED LUCIDE ICONS below):
 *     transform (Select=cursor-arrow), text (Text=type, kept unwired — no
 *     Text CursorTool exists yet), slide, lasso (Mask Lasso), keypicker
 *     (Key Picker=pipette), hand + zoom (kept unwired — no Hand/Zoom
 *     CursorTool exists yet).
 *   - Native SVG primitive (not vendored artwork — a dashed <rect>/<ellipse>
 *     IS the simplest correct rendering of "Mask Rect/Ellipse dashed"):
 *     marqrect, marqellipse.
 *
 * WAND RESOLUTION (proposal.md, user pick "G2", 2026-07-30 — LOCKED,
 * supersedes the OD-3 Block-wand exception): rod + star + dotted-region
 * wake, exact 24x24 path data reproduced verbatim below.
 *
 * marker/loopin/loopout are NEW glyphs (no prior Block art existed for
 * these three — TOOL_ICON in EffectBrowser.tsx previously left them
 * unmapped and they fell back to their text label). PK.H1 adds the art and
 * wires them into TOOL_ICON so all 14 CursorTool ids render a real glyph.
 *
 * 24x24 grid, currentColor only — the button supplies state color, never
 * the icon itself.
 */
export type ToolName =
  | 'transform'
  | 'text'
  | 'razor'
  | 'slip'
  | 'slide'
  | 'rippledel'
  | 'marqrect'
  | 'marqellipse'
  | 'lasso'
  | 'polylasso'
  | 'wand'
  | 'keypicker'
  | 'hand'
  | 'zoom'
  | 'marker'
  | 'loopin'
  | 'loopout'

interface ToolIconProps {
  name: ToolName
  size?: number
}

/**
 * VENDORED LUCIDE ICONS (lucide-static v1.28.0, ISC license) — path data
 * copied verbatim from https://unpkg.com/lucide-static@1.28.0/icons/, NOT an
 * npm dependency (Frontend UI Law / PK.H1 contract: vendored, not installed).
 *
 * ISC License — Copyright (c) for portions Lucide Contributors 2022.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * Icons used (source name -> tool):
 *   mouse-pointer-2 -> transform (Select)
 *   type            -> text (kept unwired)
 *   zoom-in         -> zoom (kept unwired)
 *   hand            -> hand (kept unwired)
 *   lasso           -> lasso (Mask Lasso freehand)
 *   pipette         -> keypicker (Key Picker)
 *   move-horizontal -> slide (no exact "slide-tool" icon exists in Lucide;
 *                       this is the closest semantic match — bidirectional
 *                       horizontal shift, matching the Slide tool's "shift
 *                       the whole clip along the track" behavior. Flag for
 *                       the orchestrator's visual pass per STOP semantics:
 *                       every other swap here has an exact-named Lucide
 *                       source icon, this one is a best-fit pick.)
 */
const ICON_BODY: Record<ToolName, ReactElement> = {
  // LUCIDE mouse-pointer-2 (Select=cursor-arrow, OD-3 FINAL GLYPH MANIFEST)
  transform: <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />,
  // LUCIDE type (kept unwired — no Text CursorTool exists yet)
  text: (
    <>
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </>
  ),
  // OURS — Razor R2c: angled classic double-edge blade, wire (proposal.md
  // "OD-3 RAZOR LOCKED"). Outline of the same angled-blade silhouette the
  // prior Block art used, opened from a solid fill to a stroke per the
  // ROUND-2 "fills opened" verdict, plus one inner facet line suggesting
  // the blade's second (double) edge.
  razor: (
    <>
      <path d="M4.5 15.5L14 6l4 4-9.5 9.5H4.5v-4z" />
      <path d="M7 15L14 8" />
    </>
  ),
  // OURS — Slip (fixed-frame+inner-arrows, unchanged from Block art — already
  // stroke-only, no fill to open; inherits the wire params below).
  slip: (
    <>
      <path d="M5.5 5v14M18.5 5v14" />
      <path d="M11.5 12H8.5M10 9.8L7.8 12l2.2 2.2" />
      <path d="M12.5 12h3M14 9.8l2.2 2.2-2.2 2.2" />
    </>
  ),
  // LUCIDE move-horizontal (Slide — best-fit, see VENDORED LUCIDE ICONS note above)
  slide: (
    <>
      <path d="m18 8 4 4-4 4" />
      <path d="M2 12h20" />
      <path d="m6 8-4 4 4 4" />
    </>
  ),
  // OURS — Ripple Delete D5 LOCKED: X between timeline brackets, wire.
  rippledel: (
    <>
      <path d="M7 5v14M17 5v14" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </>
  ),
  // Native SVG primitive (dashed rect) — "Mask Rect dashed"
  marqrect: <rect x={5} y={6} width={14} height={12} strokeDasharray="3 2.4" />,
  // Native SVG primitive (dashed ellipse) — "Mask Ellipse dashed"
  marqellipse: <ellipse cx={12} cy={12} rx={7.2} ry={6} strokeDasharray="3 2.4" />,
  // LUCIDE lasso (Mask Lasso freehand)
  lasso: (
    <>
      <path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" />
      <path d="M7 22a5 5 0 0 1-2-3.994" />
      <circle cx={5} cy={16} r={2} />
    </>
  ),
  // OURS — Mask Polygon (unchanged silhouette, wire restyle applied via the
  // shared stroke params below — already stroke-only, no fill to open).
  polylasso: (
    <>
      <path d="M12 4l7.5 3.5-1.8 7-7.2 3-5.5-5.5L7.5 6z" />
      <path d="M10 17.5c-1.5 1.2-1.7 2.8-.7 4" />
    </>
  ),
  // WAND RESOLUTION G2 (proposal.md, LOCKED 2026-07-30) — rod + star +
  // dotted-region wake. Exact 24x24 path data reproduced verbatim.
  wand: (
    <>
      <path d="M5 19l6.5-6.5" strokeWidth={2.4} strokeLinecap="round" />
      <path
        d="M15.5 3.5l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx={13.3} cy={20.6} r={1.2} fill="currentColor" stroke="none" />
      <circle cx={16.7} cy={19.7} r={1.05} fill="currentColor" stroke="none" />
      <circle cx={19.4} cy={17.5} r={0.95} fill="currentColor" stroke="none" />
      <circle cx={21} cy={14.5} r={0.85} fill="currentColor" stroke="none" />
    </>
  ),
  // LUCIDE pipette (Key Picker=pipette)
  keypicker: (
    <>
      <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" />
      <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" />
      <path d="m2 22 .414-.414" />
    </>
  ),
  // LUCIDE hand (kept unwired — no Hand CursorTool exists yet)
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  // LUCIDE zoom-in (kept unwired — no Zoom CursorTool exists yet)
  zoom: (
    <>
      <circle cx={11} cy={11} r={8} />
      <path d="M21 21l-4.35-4.35" />
      <path d="M11 8v6M8 11h6" />
    </>
  ),
  // OURS — Marker flag (new; no Block-era art existed). Pole + a small
  // filled pennant near the top — a thin outline pennant disappears at
  // 16px rail size (same "mass" problem the wand's star solves via fill),
  // so the pennant stays filled per the wire set's established grammar of
  // thin-line body + solid accent (wand star, transform corner mass).
  marker: (
    <>
      <path d="M6 3.5v17" />
      <path d="M6 4.5h10.5l-3 3.2 3 3.2H6z" fill="currentColor" stroke="none" />
    </>
  ),
  // OURS — Loop In bracket (new). Literal bracket per the locked pick name:
  // a "[" shape open to the right, matching the Premiere/Resolve in-point
  // bracket convention.
  loopin: <path d="M15 5H9v14h6" />,
  // OURS — Loop Out bracket (new). Mirrored "]" shape open to the left,
  // matching the Premiere/Resolve out-point bracket convention.
  loopout: <path d="M9 5h6v14H9" />,
}

/** Full ordered list of the 17 tool names — mirrors the ICON_BODY keys. */
export const TOOL_NAMES = Object.keys(ICON_BODY) as ToolName[]

/**
 * Inline wire-style tool icon. Renders at `currentColor` (stroke, and fill
 * for the wand's star/dots and the razor/marker accent sub-paths) — never a
 * hardcoded hex — so the enclosing button controls rest/hover/active/
 * disabled color per the design system.
 */
export default function ToolIcon({ name, size = 24 }: ToolIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_BODY[name]}
    </svg>
  )
}
