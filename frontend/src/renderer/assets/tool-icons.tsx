import type { ReactElement } from 'react'

/**
 * Creatrix tool-rail icon set — WIRE direction (PK.H1).
 *
 * OD-3 ROUND-2 VERDICTS (proposal.md, user dictation 2026-07-15, LOCKED):
 * icon direction = wire restyle set-wide (1.9 stroke, round caps, fills
 * opened). Supersedes the earlier BLOCK direction (2.7 stroke, square caps,
 * miter joins, solid fills) that shipped with PK.B/PK.B2.
 *
 * GROUND TRUTH: `openspec/changes/ui-foundation/tool-glyphs-locked.js`
 * (recovered verbatim from the user-reviewed "Creatrix — final tool glyphs"
 * artifact, locked 2026-07-18 — PK.H1 lesson: glyph decisions must be
 * repo-canonical, never only in a claude.ai artifact). Every path 'd' below
 * is transcribed from that file. The ONE exception is wand: the locked file
 * still has the pre-G2 Block wand for historical record; WAND RESOLUTION
 * (proposal.md, "G2", 2026-07-30) supersedes it and is what ships here.
 * Render params stay the packet's explicit 1.9/round/round (the locked
 * file's own render-params comment says 2.0 — that describes how the
 * artifact mockup rendered it; proposal.md's OD-3 ROUND-2 VERDICTS is the
 * actual locked stroke-width contract for this component).
 *
 * OD-3 FINAL GLYPH MANIFEST (proposal.md, 2026-07-18) assigns each of the 14
 * live CursorTool ids (EffectBrowser.tsx) one of:
 *   - OURS (custom, hand-drawn on this 24x24 grid): razor, slip, rippledel,
 *     polylasso (Mask Polygon), marker, loopin, loopout.
 *   - LUCIDE (ISC, vendored path data — see VENDORED LUCIDE ICONS below):
 *     transform (Select=cursor-arrow), text (Text=type, kept unwired — no
 *     Text CursorTool exists yet), slide, marqrect, marqellipse, lasso
 *     (Mask Lasso), keypicker (Key Picker=pipette), hand + zoom (kept
 *     unwired — no Hand/Zoom CursorTool exists yet).
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
 *   square-dashed   -> marqrect (Mask Rect)
 *   circle-dashed   -> marqellipse (Mask Ellipse)
 *   move-horizontal -> slide (no exact "slide-tool" icon exists in Lucide;
 *                       this is the closest semantic match — bidirectional
 *                       horizontal shift, matching the Slide tool's "shift
 *                       the whole clip along the track" behavior. The only
 *                       Lucide swap in this file without an exact-named
 *                       source icon — confirmed exact-match against the
 *                       recovered ground truth for every other Lucide pick.)
 */
const ICON_BODY: Record<ToolName, ReactElement> = {
  // LUCIDE mouse-pointer-2 (Select=cursor-arrow) — exact match vs ground truth.
  transform: <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />,
  // LUCIDE type (kept unwired — no Text CursorTool exists yet) — exact match vs ground truth.
  text: (
    <>
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </>
  ),
  // OURS — Razor R2c (ground truth): a rotated double-edge blade — a
  // rounded bar rotated -24deg with a center rivet and two smaller end
  // rivets, reading as a classic double-edge razor blade at an angle.
  razor: (
    <g transform="rotate(-24 12 12)">
      <rect x={4.5} y={8.6} width={15} height={6.8} rx={1} />
      <circle cx={12} cy={12} r={1.4} />
      <circle cx={7.4} cy={12} r={0.9} />
      <circle cx={16.6} cy={12} r={0.9} />
    </g>
  ),
  // OURS — Slip (ground truth): fixed-frame rect + bidirectional inner arrows.
  slip: (
    <>
      <rect x={4.5} y={7} width={15} height={10} />
      <path d="M9 12h6M10.8 9.8L8.5 12l2.3 2.2M13.2 9.8l2.3 2.2-2.3 2.2" />
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
  // OURS — Ripple Delete D5 (ground truth): X between timeline brackets,
  // plus a dashed connector suggesting the ripple-closing gap.
  rippledel: (
    <>
      <path d="M6 6.5v11M18 6.5v11" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
      <path d="M8 12h8" strokeDasharray="1.6 2" strokeWidth={1.2} />
    </>
  ),
  // LUCIDE square-dashed (Mask Rect dashed) — exact match vs ground truth.
  marqrect: (
    <>
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M9 21h1" />
      <path d="M14 3h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M21 9v1" />
      <path d="M3 14v1" />
      <path d="M21 14v1" />
    </>
  ),
  // LUCIDE circle-dashed (Mask Ellipse dashed) — exact match vs ground truth.
  marqellipse: (
    <>
      <path d="M10.1 2.182a10 10 0 0 1 3.8 0" />
      <path d="M13.9 21.818a10 10 0 0 1-3.8 0" />
      <path d="M17.609 3.721a10 10 0 0 1 2.69 2.7" />
      <path d="M2.182 13.9a10 10 0 0 1 0-3.8" />
      <path d="M20.279 17.609a10 10 0 0 1-2.7 2.69" />
      <path d="M21.818 10.1a10 10 0 0 1 0 3.8" />
      <path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" />
      <path d="M6.391 20.279a10 10 0 0 1-2.69-2.7" />
    </>
  ),
  // LUCIDE lasso (Mask Lasso freehand) — exact match vs ground truth.
  lasso: (
    <>
      <path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" />
      <path d="M7 22a5 5 0 0 1-2-3.994" />
      <circle cx={5} cy={16} r={2} />
    </>
  ),
  // OURS — Mask Polygon (ground truth): dashed polygon outline + filled
  // vertex dots (marching-ants style).
  polylasso: (
    <>
      <path d="M12 4l7.5 3.5-1.8 7-7.2 3-5.5-5.5L7.5 6z" strokeDasharray="2.4 2.6" />
      <circle cx={12} cy={4} r={1.2} />
      <circle cx={19.5} cy={7.5} r={1.2} />
      <circle cx={17.7} cy={14.5} r={1.2} />
      <circle cx={10.5} cy={17.5} r={1.2} />
      <circle cx={5} cy={12} r={1.2} />
      <circle cx={7.5} cy={6} r={1.2} />
    </>
  ),
  // WAND RESOLUTION G2 (proposal.md, LOCKED 2026-07-30) — rod + star +
  // dotted-region wake. Exact 24x24 path data reproduced verbatim.
  // Supersedes the ground-truth file's historical pre-G2 Block wand entry.
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
  // LUCIDE pipette (Key Picker=pipette) — exact match vs ground truth.
  keypicker: (
    <>
      <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12" />
      <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z" />
      <path d="m2 22 .414-.414" />
    </>
  ),
  // LUCIDE hand (kept unwired — no Hand CursorTool exists yet) — exact match vs ground truth.
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  // LUCIDE zoom-in (kept unwired — no Zoom CursorTool exists yet). Ground
  // truth uses <line> elements for the crosshair/handle; matched verbatim.
  zoom: (
    <>
      <circle cx={11} cy={11} r={8} />
      <line x1={21} x2={16.65} y1={21} y2={16.65} />
      <line x1={11} x2={11} y1={8} y2={14} />
      <line x1={8} x2={14} y1={11} y2={11} />
    </>
  ),
  // OURS — Marker flag (ground truth): pole + STROKE-outline pennant (not
  // filled — corrected from this executor's first pass, which filled it).
  marker: (
    <>
      <path d="M7 3.5v17" />
      <path d="M7 4.5h9.5L14 7.8l2.5 3.3H7z" />
    </>
  ),
  // OURS — Loop In bracket (ground truth): left-side "[" bracket + a flow
  // arrow pointing INTO the loop region from the right.
  loopin: (
    <>
      <path d="M9 4.5H4.5v15H9" />
      <path d="M19 12h-8.5M13.5 8.5L10 12l3.5 3.5" />
    </>
  ),
  // OURS — Loop Out bracket (ground truth): right-side "]" bracket + a flow
  // arrow pointing OUT of the loop region to the right.
  loopout: (
    <>
      <path d="M15 4.5h4.5v15H15" />
      <path d="M5 12h8.5M10.5 8.5L14 12l-3.5 3.5" />
    </>
  ),
}

/** Full ordered list of the 17 tool names — mirrors the ICON_BODY keys. */
export const TOOL_NAMES = Object.keys(ICON_BODY) as ToolName[]

/**
 * Inline wire-style tool icon. Renders at `currentColor` (stroke, and fill
 * for the wand's star/dots) — never a hardcoded hex — so the enclosing
 * button controls rest/hover/active/disabled color per the design system.
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
