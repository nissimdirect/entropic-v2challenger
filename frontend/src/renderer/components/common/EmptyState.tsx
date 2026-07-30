/**
 * EmptyState — shared empty-state primitive (RATIFIED D7 + OD-4 override).
 *
 * Renders ONE quiet hint line. NO buttons/CTAs, ever — OD-4: "minimal hint
 * text only, no CTA" (quieter than the drafter's heading+body+button
 * default). Contrast guarantee (D7): styled via .cx-empty-state
 * (styles/empty-state.css) using the AA-verified pair --cx-text-3 on
 * panel surfaces (4.8:1, tokens.css) at --cx-text-body size.
 *
 * Skin only (zero adoption in this packet) — the F3 sweep converts the
 * existing preview/device-chain/timeline empty states to this primitive.
 */

export interface EmptyStateProps {
  /** The single quiet hint line to display. */
  hint: string
  /** Stable data-testid (COMPONENT-SPEC §2 — tests target test-ids only). */
  testId: string
  /** F3-C4: optional additive class, appended alongside `cx-empty-state` —
   *  for callers whose surrounding layout needs container-specific
   *  positioning (e.g. `position: absolute` centered over a canvas) that
   *  the shared skin's own `margin: 0 auto` centering doesn't cover. */
  className?: string
}

export default function EmptyState({ hint, testId, className }: EmptyStateProps) {
  const classes = className ? `cx-empty-state ${className}` : 'cx-empty-state'
  return (
    <p className={classes} data-testid={testId}>
      {hint}
    </p>
  )
}
