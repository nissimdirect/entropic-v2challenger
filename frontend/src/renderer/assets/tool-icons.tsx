import type { ReactElement } from 'react'

/**
 * Creatrix tool-rail icon set — BLOCK direction.
 * Source of truth: entropic-layout-mockup/challengers/icon-directions.html
 * (DIRS[1] 'block': stroke-width 2.7, square caps, miter joins, solid fills
 * on the `fillme`-marked sub-paths). 24x24 grid, currentColor only — the
 * button supplies state color, never the icon.
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

interface ToolIconProps {
  name: ToolName
  size?: number
}

const ICON_BODY: Record<ToolName, ReactElement> = {
  transform: (
    <>
      <rect x={6.5} y={6.5} width={11} height={11} />
      <rect x={4.5} y={4.5} width={4} height={4} fill="currentColor" stroke="none" />
      <rect x={15.5} y={4.5} width={4} height={4} fill="currentColor" stroke="none" />
      <rect x={4.5} y={15.5} width={4} height={4} fill="currentColor" stroke="none" />
      <rect x={15.5} y={15.5} width={4} height={4} fill="currentColor" stroke="none" />
      <circle cx={12} cy={2.8} r={1.3} />
    </>
  ),
  text: <path d="M6 6.5h12M6 6.5v2.5M18 6.5v2.5M12 6.5v12M9.5 18.5h5" />,
  razor: (
    <>
      <path d="M4.5 15.5L14 6l4 4-9.5 9.5H4.5v-4z" fill="currentColor" stroke="none" />
      <path d="M12.5 7.5l4 4" />
    </>
  ),
  slip: (
    <>
      <path d="M5.5 5v14M18.5 5v14" />
      <path d="M11.5 12H8.5M10 9.8L7.8 12l2.2 2.2" />
      <path d="M12.5 12h3M14 9.8l2.2 2.2-2.2 2.2" />
    </>
  ),
  slide: (
    <>
      <path d="M4 6.5h16M4 17.5h16" />
      <rect x={9} y={9.5} width={6} height={5} fill="currentColor" stroke="none" />
      <path d="M5 12h2.2M16.8 12H19" />
    </>
  ),
  rippledel: (
    <>
      <path d="M12.5 6l-6 6 6 6M6.5 12h8" />
      <path d="M18.5 5.5v13" />
    </>
  ),
  marqrect: <rect x={5} y={6} width={14} height={12} strokeDasharray="3 2.4" />,
  marqellipse: <ellipse cx={12} cy={12} rx={7.2} ry={6} strokeDasharray="3 2.4" />,
  lasso: (
    <>
      <path d="M12 4.5c4.7 0 8.5 2.2 8.5 5s-3.8 5-8.5 5c-1.2 0-2.3-.14-3.3-.4M6.2 13.2C4.5 12.3 3.5 11 3.5 9.5c0-2.8 3.8-5 8.5-5" />
      <path d="M8.7 14.1c-1.6 1.5-1.6 3.7-.2 5.4" />
    </>
  ),
  polylasso: (
    <>
      <path d="M12 4l7.5 3.5-1.8 7-7.2 3-5.5-5.5L7.5 6z" />
      <path d="M10 17.5c-1.5 1.2-1.7 2.8-.7 4" />
    </>
  ),
  wand: (
    <>
      <path d="M4.5 19.5L14 10" />
      <path d="M13 8l2.6-1 1-2.6 1 2.6 2.6 1-2.6 1-1 2.6-1-2.6z" fill="currentColor" stroke="none" />
      <path d="M19.5 13.5v3M18 15h3" />
    </>
  ),
  keypicker: (
    <>
      <path d="M12.5 8.5l3 3L7.5 19.5H4.5v-3z" />
      <path d="M14 4.5L19.5 10l-2.6 2.6-5.5-5.5z" fill="currentColor" stroke="none" />
    </>
  ),
  hand: (
    <>
      <path d="M17.5 11V6.5a1.8 1.8 0 00-3.6 0V10M13.9 9.5V4.8a1.8 1.8 0 00-3.6 0V10M10.3 10.3V6.3a1.8 1.8 0 00-3.6 0v7.2" />
      <path d="M17.5 8.3a1.8 1.8 0 013.6 0v5.2c0 3.9-2.6 6.9-6.6 6.9h-1.6c-2.4 0-3.9-.8-5.2-2.2l-3-3.4a1.7 1.7 0 012.5-2.3l1.5 1.4" />
    </>
  ),
  zoom: (
    <>
      <circle cx={11} cy={11} r={6} />
      <path d="M15.4 15.4L20 20M8.8 11h4.4M11 8.8v4.4" />
    </>
  ),
}

/** Full ordered list of the 14 tool names — mirrors the ICON_BODY keys. */
export const TOOL_NAMES = Object.keys(ICON_BODY) as ToolName[]

/**
 * Inline Block-style tool icon. Renders at `currentColor` (stroke, and fill
 * for the solid-fill sub-paths) — never a hardcoded hex — so the enclosing
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
