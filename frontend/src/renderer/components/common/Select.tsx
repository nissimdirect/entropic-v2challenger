import React from 'react'

/**
 * Select — the ONE sanctioned wrapper around native <select> (COMPONENT-SPEC §3
 * "Select skin", packet UC3). Skin only: keeps native dropdown behavior and
 * accessibility (keyboard, screen reader, OS popup) and restyles the closed
 * control with Live Signal tokens. The chevron affordance is pure CSS
 * (`.cx-select::after` in styles/select.css) — no new deps.
 *
 * State contract (COMPONENT-SPEC §1, interactive-control enum):
 *   rest          → base `.cx-select` / `.cx-select__control`
 *   hover         → `:hover` on the control (skin-only, no JS state)
 *   focus-visible → `:focus-visible` ring via --cx-focus-ring
 *   disabled      → `.cx-select--disabled` BEM modifier + native disabled attr
 * (`active` is the OS-native open popup — not skinnable, deliberately absent.)
 *
 * Selector contract (§2): `data-testid` passes through to the native <select>
 * (the interactive element) so tests fire events on it directly.
 *
 * This file is grep-excluded from the `tsx_native_select` ratchet counter in
 * scripts/ui-ratchets.sh — the primitive is the one legal home for a native
 * <select>; every other .tsx still counts toward the 56 → 0 ratchet.
 */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Stable selector for tests — lands on the native <select>. */
  'data-testid'?: string
}

export default function Select({ className, disabled, children, ...rest }: SelectProps) {
  const rootClasses = ['cx-select']
  if (disabled) rootClasses.push('cx-select--disabled')
  if (className) rootClasses.push(className)

  return (
    <span className={rootClasses.join(' ')}>
      <select className="cx-select__control" disabled={disabled} {...rest}>
        {children}
      </select>
    </span>
  )
}
