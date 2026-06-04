/**
 * I3 Inline Action Menu (Vision §6 I3).
 *
 * Right-click a param row → action menu (recent · browse categorized ·
 * search · tools). Same gesture handles probe-only (⌥-click), map+probe
 * (click), edit (⇧-click), delete (✕). Browsable categories, no smart
 * suggestions (Vision Round-1 decision).
 *
 * Follows the existing renderer/components/timeline/ContextMenu.tsx pattern
 * (refs + effects, no Radix). Adds sectioned items + search.
 *
 * Backend contract: action list comes from inspector/inline_actions.py
 * registry (PR #143). IPC bridge in useInlineActions.ts; this component
 * is presentation-only.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

export interface InlineAction {
  id: string
  label: string
  category: 'recent' | 'browse' | 'tools'
  shortcut?: string
  disabled?: boolean
  onSelect: () => void
}

interface InlineActionMenuProps {
  x: number
  y: number
  paramId: string
  actions: InlineAction[]
  onClose: () => void
}

const SECTION_TITLES: Record<InlineAction['category'], string> = {
  recent: 'Recent',
  browse: 'Browse',
  tools: 'Tools',
}

const SECTION_ORDER: InlineAction['category'][] = ['recent', 'browse', 'tools']

export default function InlineActionMenu({
  x,
  y,
  paramId,
  actions,
  onClose,
}: InlineActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)

  // Filter by search query (case-insensitive substring).
  const filtered = useMemo(() => {
    if (!query.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter((a) => a.label.toLowerCase().includes(q))
  }, [actions, query])

  // Group by category for sectioned rendering.
  const sections = useMemo(() => {
    const map: Record<string, InlineAction[]> = {}
    for (const cat of SECTION_ORDER) map[cat] = []
    for (const a of filtered) map[a.category]?.push(a)
    return SECTION_ORDER.filter((cat) => (map[cat] ?? []).length > 0).map((cat) => ({
      category: cat,
      title: SECTION_TITLES[cat],
      items: map[cat] ?? [],
    }))
  }, [filtered])

  // Flat list for keyboard nav.
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])

  // Viewport clamping (same as timeline/ContextMenu).
  const menuW = 260
  const menuH = Math.min(360, 60 + flat.length * 28)
  const clampedX = Math.min(x, window.innerWidth - menuW - 8)
  const clampedY = Math.min(y, window.innerHeight - menuH - 8)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusIdx((i) => Math.min(i + 1, flat.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const action = flat[focusIdx]
        if (action && !action.disabled) {
          action.onSelect()
          onClose()
        }
      }
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('pointerdown', handleClick)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('pointerdown', handleClick)
    }
  }, [onClose, flat, focusIdx])

  // Reset focus when filter changes.
  useEffect(() => {
    setFocusIdx(0)
  }, [query])

  let runningIdx = 0

  return (
    <div
      ref={ref}
      data-testid="inline-action-menu"
      data-param-id={paramId}
      className="inline-action-menu"
      style={{
        position: 'fixed',
        left: `${clampedX}px`,
        top: `${clampedY}px`,
        width: `${menuW}px`,
        maxHeight: '360px',
        overflowY: 'auto',
        zIndex: 1000,
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        padding: '4px 0',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search actions…"
        autoFocus
        data-testid="inline-action-menu-search"
        style={{
          width: 'calc(100% - 16px)',
          margin: '4px 8px 8px',
          padding: '4px 6px',
          background: '#0d0d0d',
          border: '1px solid #2a2a2a',
          color: '#e0e0e0',
          fontSize: '12px',
        }}
      />
      {sections.length === 0 ? (
        <div
          data-testid="inline-action-menu-empty"
          style={{ padding: '12px', color: '#888', fontSize: '12px' }}
        >
          No matching actions
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.category} data-testid={`section-${section.category}`}>
            <div
              style={{
                padding: '4px 10px',
                color: '#888',
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {section.title}
            </div>
            {section.items.map((action) => {
              const isFocused = runningIdx === focusIdx
              const myIdx = runningIdx
              runningIdx += 1
              return (
                <button
                  key={action.id}
                  data-testid={`action-${action.id}`}
                  className={`inline-action-menu__item${
                    action.disabled ? ' inline-action-menu__item--disabled' : ''
                  }${isFocused ? ' inline-action-menu__item--focused' : ''}`}
                  onMouseEnter={() => setFocusIdx(myIdx)}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!action.disabled) {
                      action.onSelect()
                      onClose()
                    }
                  }}
                  disabled={action.disabled}
                  style={{
                    display: 'flex',
                    width: '100%',
                    padding: '6px 12px',
                    background: isFocused ? '#2a2a2a' : 'transparent',
                    border: 'none',
                    color: action.disabled ? '#555' : '#e0e0e0',
                    fontSize: '12px',
                    textAlign: 'left',
                    cursor: action.disabled ? 'not-allowed' : 'pointer',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{action.label}</span>
                  {action.shortcut && (
                    <span style={{ color: '#666', fontSize: '11px' }}>{action.shortcut}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
