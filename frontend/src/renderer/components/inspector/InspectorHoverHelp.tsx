/**
 * InspectorHoverHelp — P3.4 hover-help slot.
 *
 * Mounted OUTSIDE the selection state subtree (Inspector.tsx keeps this above
 * the key= remount boundary) so the sticky-window timer is not reset on
 * selection changes.
 *
 * Receives hover state from the parent Inspector via props (the delegation hook
 * lives in Inspector so that the single onMouseOver is on the inspector root —
 * NOT on this component — giving us the zero-per-target architecture).
 *
 * WCAG 1.4.13 compliance:
 *  - 300ms settle before showing (PLAN §3.10)
 *  - 400ms sticky window after mouseleave
 *  - Escape dismisses immediately (handled in useHoverDelegation)
 *  - focusin shows same help as hover (keyboard parity)
 *  - Collapsible, persisted as creatrix.inspector.hoverHelpCollapsed
 *
 * XSS guard (qa-redteam M5): body is ALWAYS rendered as plain text via
 * React children — NEVER dangerouslySetInnerHTML.
 */
import React from 'react'
import type { HelpEntry } from '../../utils/help-registry'

interface Props {
  entry: HelpEntry | null
  collapsed: boolean
  onToggle: () => void
}

export default function InspectorHoverHelp({
  entry,
  collapsed,
  onToggle,
}: Props): React.ReactElement {
  const visible = !collapsed && entry !== null

  return (
    <div
      className="cx-inspector-hover-help"
      data-testid="inspector-hover-help"
      aria-live="polite"
      aria-atomic="true"
    >
      <button
        className="cx-inspector-hover-help__toggle"
        onClick={onToggle}
        aria-label={collapsed ? 'Show hover help' : 'Hide hover help'}
        aria-expanded={!collapsed}
        data-testid="hover-help-toggle"
        type="button"
      >
        <span className="cx-inspector-hover-help__chevron" aria-hidden="true">
          {collapsed ? '▶' : '▼'}
        </span>
        <span className="cx-inspector-hover-help__label">Help</span>
      </button>
      {visible && (
        <div
          className="cx-inspector-hover-help__body"
          role="tooltip"
          data-testid="hover-help-body"
        >
          {/* Title and body are PLAINTEXT — React escapes all markup. Never dangerouslySetInnerHTML. */}
          <p className="cx-inspector-hover-help__title">{entry.title}</p>
          <p className="cx-inspector-hover-help__text">{entry.body}</p>
        </div>
      )}
    </div>
  )
}
