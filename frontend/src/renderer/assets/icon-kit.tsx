import type { ReactElement } from 'react'

/**
 * Creatrix app-wide icon kit — PK.H2 (icon unification sweep, manifest v4.1).
 *
 * Implements the CONVENTION-GROUNDED MANIFEST v4 + v4.1 addendum
 * (openspec/changes/ui-foundation/proposal.md): every non-tool glyph swapped
 * off emoji/bare-unicode in this sweep renders through this kit. Tool-rail
 * glyphs are `tool-icons.tsx` (PK.H1) — separate module, separate contract.
 *
 * SOURCE ORDER (GLYPH GUIDELINES v1, rule 8): Lucide (ISC) -> Tabler (MIT) ->
 * custom. This kit is Lucide + 2 customs; no Tabler icon was needed for the
 * PK.H2 file set. Vendored path data, NOT an npm dependency (Frontend UI Law
 * / PK.H1 precedent — ground truth lives in the repo, never only in a
 * node_modules copy or a claude.ai artifact).
 *
 * VENDORED LUCIDE ICONS (lucide-static v1.27/1.28, ISC license) — path data
 * fetched verbatim from https://cdn.jsdelivr.net/npm/lucide-static/icons/.
 *
 * ISC License — Copyright (c) for portions Lucide Contributors 2022.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * Icons used (source name -> meaning, per manifest ruling):
 *   x               -> close (dialog/panel dismiss, one shared component)
 *   plus            -> add (rotates 45deg open via CSS, not a second glyph)
 *   chevron-right/-down -> disclosure pair (expand/collapse)
 *   chevron-up/-down    -> reorder (move item up/down in a list — distinct
 *                          meaning from disclosure, rule 2 one-glyph-one-meaning)
 *   chevron-left/-right -> page nav pair (bank paging)
 *   arrow-up        -> up-one-level (re-ruling 1, breadcrumb/browser only)
 *   corner-up-left  -> back-reference-to-origin (re-ruling 1, LAYER panel only)
 *   external-link   -> pop-out (re-ruling, overturns earlier pip-2 pick)
 *   link / unlink   -> aspect-lock pair; unlink doubles as unroute/unmap
 *                      (re-ruling 2: "kills the lucide:x verdicts on sub-LFO
 *                      removal" — modulation-route/mapping detach actions)
 *   lock / unlock   -> track/clip lock state pair
 *   eye / eye-off   -> track-visibility pair
 *   volume-1/-2/-x  -> mute/level tri-state (replaces raw speaker emoji)
 *   settings        -> gear (MIDI settings)
 *   triangle-alert  -> warning/error media indicator
 *   flask-conical   -> research-mode toggle
 *   flag            -> experimental-axis marker
 *   star            -> favorite toggle (fill-state pair via `filled` prop)
 *   trash-2         -> destroy (rule 7: destroy(trash) != dismiss(x) != detach(unlink))
 *   circle          -> record-arm dot (fill-state pair via `filled` prop —
 *                      resolves the R-collision: automation Read-mode keeps
 *                      the text "R"; record-arm is now this glyph, never text)
 *   magnet          -> snap-to-grid toggle (W1-3; replaces the bare text "S",
 *                      which collided with the Solo "S" button on tracks)
 *   video           -> track type badge: Video (W1.5b PK.B1, lucide-static v0.462.0)
 *   music           -> track type badge: MIDI/Performance, exposed as 'midi'
 *                      (W1.5b PK.B1, lucide-static v0.462.0)
 *   type            -> track type badge: Text, exposed as 'text' (W1.5b PK.B1,
 *                      lucide-static v0.462.0) — distinct from the KitIconName
 *                      union member name, which is also 'text' (no collision:
 *                      this is the SOURCE glyph name, matches by coincidence)
 *   activity        -> track type badge: Inspector, exposed as 'scope' (it
 *                      renders live signal scopes — W1.5b PK.B1, OD-1 pending;
 *                      badge glyph choice is independent of the track's
 *                      displayed name, which stays "Inspector" until OD-1
 *                      rules) (lucide-static v0.462.0)
 *   disc            -> track type badge: Master, exposed as 'master' (final
 *                      mixdown/bounce-to-disc metaphor — W1.5b PK.B1,
 *                      lucide-static v0.462.0)
 *
 * CUSTOMS (2 of the manifest's 13, scoped to this packet's file set):
 *   snowflake -> freeze state pair (fill-state pair via `filled` prop —
 *                fixes the same-glyph-both-states bug: current code used
 *                the identical ❄ character for frozen AND unfrozen)
 *   mask-stack -> clip mask-count badge glyph (Fable adjudication: KEEP-TEXT
 *                 "M{n}" overturned — collides with the Mute "M" button on
 *                 the same clip row). Exported as <MaskCountBadge count={n}/>,
 *                 not a bare Icon name, since it always pairs glyph + count.
 *
 * 24x24 grid, stroke-2, currentColor only (GLYPH GUIDELINES v1 rule 4) — the
 * enclosing button/element supplies state color, never the icon itself.
 */
export type KitIconName =
  | 'x'
  | 'plus'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'arrow-up'
  | 'corner-up-left'
  | 'external-link'
  | 'link'
  | 'unlink'
  | 'lock'
  | 'unlock'
  | 'eye'
  | 'eye-off'
  | 'volume-1'
  | 'volume-2'
  | 'volume-x'
  | 'settings'
  | 'triangle-alert'
  | 'flask-conical'
  | 'flag'
  | 'star'
  | 'trash-2'
  | 'circle'
  | 'snowflake'
  | 'magnet'
  // W1.5b PK.B1 — track-header type badges (audio reuses 'volume-2' above,
  // no new glyph needed for it).
  | 'video'
  | 'midi'
  | 'text'
  | 'scope'
  | 'master'

interface IconProps {
  name: KitIconName
  size?: number
  /** Fill-state toggle for the fill-pair glyphs: star, circle, snowflake. */
  filled?: boolean
  className?: string
}

/** Shared body for the volume "cone" — identical across volume-1/-2/-x. */
const VOLUME_CONE = (
  <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
)

const ICON_BODY: Record<KitIconName, ReactElement> = {
  // LUCIDE x
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  // LUCIDE plus
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  // LUCIDE chevron-right
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  // LUCIDE chevron-down
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  // LUCIDE chevron-up
  'chevron-up': <path d="m18 15-6-6-6 6" />,
  // LUCIDE chevron-left
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  // LUCIDE arrow-up
  'arrow-up': (
    <>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </>
  ),
  // LUCIDE corner-up-left
  'corner-up-left': (
    <>
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      <path d="M9 14 4 9l5-5" />
    </>
  ),
  // LUCIDE external-link
  'external-link': (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  // LUCIDE link
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  // LUCIDE unlink
  unlink: (
    <>
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1={8} x2={8} y1={2} y2={5} />
      <line x1={2} x2={5} y1={8} y2={8} />
      <line x1={16} x2={16} y1={19} y2={22} />
      <line x1={19} x2={22} y1={16} y2={16} />
    </>
  ),
  // LUCIDE lock
  lock: (
    <>
      <rect width={18} height={11} x={3} y={11} rx={2} ry={2} />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  // LUCIDE unlock
  unlock: (
    <>
      <rect width={18} height={11} x={3} y={11} rx={2} ry={2} />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>
  ),
  // LUCIDE eye
  eye: (
    <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx={12} cy={12} r={3} />
    </>
  ),
  // LUCIDE eye-off
  'eye-off': (
    <>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </>
  ),
  // LUCIDE volume-1 (cone + one arc)
  'volume-1': (
    <>
      {VOLUME_CONE}
      <path d="M16 9a5 5 0 0 1 0 6" />
    </>
  ),
  // LUCIDE volume-2 (cone + two arcs)
  'volume-2': (
    <>
      {VOLUME_CONE}
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </>
  ),
  // LUCIDE volume-x (cone + x)
  'volume-x': (
    <>
      {VOLUME_CONE}
      <line x1={22} x2={16} y1={9} y2={15} />
      <line x1={16} x2={22} y1={9} y2={15} />
    </>
  ),
  // LUCIDE settings
  settings: (
    <>
      <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
      <circle cx={12} cy={12} r={3} />
    </>
  ),
  // LUCIDE triangle-alert
  'triangle-alert': (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  // LUCIDE flask-conical
  'flask-conical': (
    <>
      <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
      <path d="M6.453 15h11.094" />
      <path d="M8.5 2h7" />
    </>
  ),
  // LUCIDE flag
  flag: <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />,
  // LUCIDE star — fill-state pair via `filled` prop (favorite toggle)
  star: <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />,
  // LUCIDE trash-2
  'trash-2': (
    <>
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  // LUCIDE circle — fill-state pair via `filled` prop (record-arm dot; the
  // R-collision resolution — automation Read-mode keeps text "R", this dot
  // is the only "R" glyph now).
  circle: <circle cx={12} cy={12} r={9} />,
  // CUSTOM — snowflake, fill-state pair via `filled` prop. Minimal 3-axis
  // asterisk (rule 5: ~3-stroke budget, tested legible 14/16/18px) — a
  // center dot fills in when frozen so the SAME two states no longer render
  // the SAME glyph (the bug this ruling exists to fix).
  snowflake: (
    <>
      <line x1={12} y1={3} x2={12} y2={21} />
      <g transform="rotate(60 12 12)">
        <line x1={12} y1={3} x2={12} y2={21} />
      </g>
      <g transform="rotate(120 12 12)">
        <line x1={12} y1={3} x2={12} y2={21} />
      </g>
    </>
  ),
  // LUCIDE magnet (v1.28 — matches this kit's vendored source version)
  magnet: (
    <>
      <path d="m12 15 4 4" />
      <path d="M2.352 10.648a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.029-6.029a1 1 0 1 1 3 3l-6.029 6.029a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l6.365-6.367A1 1 0 0 0 8.716 4.282z" />
      <path d="m5 8 4 4" />
    </>
  ),
  // LUCIDE video (v0.462.0) — track-header type badge: Video
  video: (
    <>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect width={14} height={12} x={2} y={6} rx={2} />
    </>
  ),
  // LUCIDE music (v0.462.0) — track-header type badge: MIDI/Performance
  midi: (
    <>
      <path d="M9 18V5l12-2v13" />
      <circle cx={6} cy={18} r={3} />
      <circle cx={18} cy={16} r={3} />
    </>
  ),
  // LUCIDE type (v0.462.0) — track-header type badge: Text
  text: (
    <>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1={9} x2={15} y1={20} y2={20} />
      <line x1={12} x2={12} y1={4} y2={20} />
    </>
  ),
  // LUCIDE activity (v0.462.0) — track-header type badge: Inspector (Scope)
  scope: <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />,
  // LUCIDE disc (v0.462.0) — track-header type badge: Master
  master: (
    <>
      <circle cx={12} cy={12} r={10} />
      <circle cx={12} cy={12} r={2} />
    </>
  ),
}

/** Glyphs whose `filled` prop toggles a filled center/body instead of stroke-only. */
const FILL_PAIR_NAMES: ReadonlySet<KitIconName> = new Set(['star', 'circle', 'snowflake'])

/**
 * Inline app-wide icon. Renders at `currentColor` — never a hardcoded hex —
 * so the enclosing button/element controls rest/hover/active/disabled color
 * per the design system (Frontend UI Law rule 1).
 */
export default function Icon({ name, size = 16, filled = false, className }: IconProps) {
  const isFillPair = FILL_PAIR_NAMES.has(name)
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {ICON_BODY[name]}
      {name === 'snowflake' && filled && <circle cx={12} cy={12} r={2.2} fill="currentColor" stroke="none" />}
      {name === 'star' && filled && (
        <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" fill="currentColor" stroke="none" />
      )}
      {name === 'circle' && filled && <circle cx={12} cy={12} r={9} fill="currentColor" stroke="none" />}
    </svg>
  )
}

/**
 * Shared dialog/panel close button — the "one glyph per meaning" fix for the
 * CLOSE clash (previously x/×/✕ scattered across ~10 components). Every
 * true dialog/panel dismiss in this sweep renders THIS component (oracle:
 * "one-close-glyph test — every dialog close button renders the shared
 * close icon component").
 */
export function CloseButton({
  onClick,
  ariaLabel,
  title,
  className,
  testId,
  size = 16,
}: {
  onClick: () => void
  ariaLabel: string
  title?: string
  className?: string
  testId?: string
  size?: number
}) {
  return (
    <button
      type="button"
      className={className ? `icon-kit__close ${className}` : 'icon-kit__close'}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      data-testid={testId ?? 'icon-kit-close'}
    >
      <Icon name="x" size={size} />
    </button>
  )
}

/**
 * Clip mask-stack count badge — custom glyph + count, replacing the
 * KEEP-TEXT "M{n}" (Fable adjudication overturn: collides with the Mute "M"
 * button rendered on the same clip row). Two overlapping rounded squares
 * read as "stacked matte nodes."
 */
export function MaskCountBadge({
  count,
  className,
  testId,
  title,
}: {
  count: number
  className?: string
  testId?: string
  title?: string
}) {
  return (
    <span className={className ? `icon-kit__mask-badge ${className}` : 'icon-kit__mask-badge'} data-testid={testId} title={title}>
      <svg
        viewBox="0 0 24 24"
        width={12}
        height={12}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x={4} y={4} width={12} height={12} rx={2} />
        <rect x={8} y={8} width={12} height={12} rx={2} />
      </svg>
      {count}
    </span>
  )
}
