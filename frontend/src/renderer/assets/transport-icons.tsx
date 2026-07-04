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
  loop: (
    <>
      <path d="M6 8a7 7 0 0111.5-4.2" />
      <path d="M18 3.5v4.3h-4.3" />
      <path d="M18 16a7 7 0 01-11.5 4.2" />
      <path d="M6 20.5v-4.3h4.3" />
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
