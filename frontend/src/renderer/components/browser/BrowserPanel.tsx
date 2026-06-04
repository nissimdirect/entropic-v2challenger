/**
 * Creatrix 5-tab browser (PLAN.md §3.5/§3.6) — PR-A.
 *
 * search + tab row (fx/op/composite/tool/instruments) + entry list. Entries are
 * draggable (payload + session nonce) and double-click adds to the selected
 * track's chain. Presentational + prop-driven so it unit-tests without stores;
 * `useBrowserData` assembles the real entries at the call site.
 */
import { useMemo, useState } from 'react'

import {
  NONCE_MIME,
  PAYLOAD_MIME,
  TAB_LABELS,
  TAB_ORDER,
  type BrowserEntry,
  type DragPayload,
  type TabKey,
} from './types'

interface BrowserPanelProps {
  tabs: Record<TabKey, BrowserEntry[]>
  onAdd: (payload: DragPayload) => void
  sessionNonce: string
  initialTab?: TabKey
}

export default function BrowserPanel({
  tabs,
  onAdd,
  sessionNonce,
  initialTab = 'fx',
}: BrowserPanelProps) {
  const [active, setActive] = useState<TabKey>(initialTab)
  const [query, setQuery] = useState('')

  const entries = useMemo(() => {
    const all = tabs[active] ?? []
    const q = query.trim().toLowerCase()
    return q ? all.filter((e) => e.label.toLowerCase().includes(q)) : all
  }, [tabs, active, query])

  return (
    <div className="creatrix-browser" data-testid="creatrix-browser">
      <div className="creatrix-browser__search">
        <input
          type="text"
          data-testid="browser-search"
          className="creatrix-browser__search-input"
          placeholder="search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQuery('')
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {query && (
          <button
            type="button"
            data-testid="browser-search-clear"
            className="creatrix-browser__search-clear"
            aria-label="clear search"
            onClick={() => setQuery('')}
          >
            ×
          </button>
        )}
      </div>

      <div className="creatrix-browser__tabs" role="tablist">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            data-testid={`browser-tab-${tab}`}
            className={`creatrix-browser__tab${
              active === tab ? ' creatrix-browser__tab--active' : ''
            }`}
            onClick={() => setActive(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <ul className="creatrix-browser__list" data-testid={`browser-list-${active}`}>
        {entries.length === 0 ? (
          <li className="creatrix-browser__empty" data-testid="browser-empty">
            no matches
          </li>
        ) : (
          entries.map((entry) => (
            <li
              key={entry.id}
              data-testid={`browser-entry-${entry.id}`}
              className={`creatrix-browser__entry${
                entry.disabled ? ' creatrix-browser__entry--disabled' : ''
              }`}
              title={entry.disabled ? entry.disabledReason : undefined}
              draggable={!entry.disabled}
              onDragStart={(e) => {
                if (entry.disabled) {
                  e.preventDefault()
                  return
                }
                const payload: DragPayload = { kind: entry.kind, id: entry.id }
                e.dataTransfer.setData(PAYLOAD_MIME, JSON.stringify(payload))
                e.dataTransfer.setData(NONCE_MIME, sessionNonce)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onDoubleClick={() => {
                if (!entry.disabled) onAdd({ kind: entry.kind, id: entry.id })
              }}
            >
              {entry.label}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
