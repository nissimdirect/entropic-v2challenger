import type { ReactElement } from 'react'

/**
 * Creatrix transport icon set — same Block-direction convention as
 * tool-icons.tsx (stroke-based, currentColor, square viewBox; solid fills
 * on the `fillme`-marked sub-paths). Fixes #436: transport buttons
 * previously rendered bare Unicode glyphs (▶ ⏸ ⏹ ⟳) instead of the
 * shipped icon language.
 */
export type TransportIconName = 'play' | 'pause' | 'stop' | 'loop'

interface TransportIconProps {
  name: TransportIconName
  size?: number
}

const ICON_BODY: Record<TransportIconName, ReactElement> = {
  play: <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x={7} y={5.5} width={4} height={13} fill="currentColor" stroke="none" />
      <rect x={13} y={5.5} width={4} height={13} fill="currentColor" stroke="none" />
    </>
  ),
  stop: <rect x={6.5} y={6.5} width={11} height={11} fill="currentColor" stroke="none" />,
  // PK.C1 (W1.5b, mock artifact cf8ac3c1 "draw-omitted-overdub-truth" —
  // owner: "wonky af" — the old orbit-arrows glyph read as a refresh icon,
  // not a loop). Bracketed-cycle: two rounded brackets (loop-brace family,
  // same visual idea as the timeline's loop region) with a chasing arrow at
  // each open end. Geometry ported verbatim from the mock's `svg.loopb`
  // (viewBox 0 0 16 12), scaled 1.5x into this kit's 24x24 viewBox with a
  // +3 vertical offset to center it.
  loop: (
    <>
      <path d="M4.5 12 v-3.75 a2.25 2.25 0 0 1 2.25 -2.25 h12.75" />
      <path d="M19.5 12 v3.75 a2.25 2.25 0 0 1 -2.25 2.25 h-12.75" />
      <path d="M16.5 3.75 L20.25 6 L16.5 8.25" />
      <path d="M7.5 15.75 L3.75 18 L7.5 20.25" />
    </>
  ),
}

/**
 * Inline Block-style transport icon. Renders at `currentColor` (stroke, and
 * fill for the solid-fill sub-paths) — never a hardcoded hex — so the
 * enclosing button controls rest/hover/active/disabled color per the
 * design system.
 */
export default function TransportIcon({ name, size = 14 }: TransportIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.7}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_BODY[name]}
    </svg>
  )
}
