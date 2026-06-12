/**
 * InspectorHoverHelp — placeholder slot for P3.4's hover delegation.
 * Mounted OUTSIDE the selection state subtree so it survives key= remounts.
 * P3.4 fills the real delegation logic (300ms settle, 200ms fade, WCAG 1.4.13).
 */
import React from 'react'

export default function InspectorHoverHelp(): React.ReactElement {
  return (
    <div
      className="cx-inspector-hover-help"
      data-testid="inspector-hover-help"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* P3.4: hover delegation fills this slot */}
    </div>
  )
}
