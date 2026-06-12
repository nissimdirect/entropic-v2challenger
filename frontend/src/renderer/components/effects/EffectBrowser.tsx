import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { randomUUID } from '../../utils'
import type { EffectInfo, EffectInstance } from '../../../shared/types'
import { LIMITS } from '../../../shared/limits'
import { useBrowserStore, type BrowserTab, BROWSER_TABS } from '../../stores/browser'
import { useToastStore } from '../../stores/toast'

/**
 * MIME-style identifier used to ferry an effect ID from the browser to the
 * DeviceChain drop target via the HTML5 drag-and-drop dataTransfer payload.
 * Custom type (not text/plain) so accidental drags from outside the app
 * cannot inject a fake effect into the chain. F-0514-7.
 */
export const EFFECT_DRAG_TYPE = 'application/x-entropic-effect-id'

/**
 * MIME type for the session-bound nonce used to reject external drag sources.
 * qa-redteam H1: the drop validator checks for a matching nonce; external
 * drags (which cannot know the session nonce) are rejected by construction.
 */
export const CREATRIX_NONCE_TYPE = 'application/x-creatrix-nonce'

/**
 * Session nonce — generated once per renderer lifetime. Used to authenticate
 * internal drag payloads vs external spoofed ones (qa-redteam H1).
 */
export const SESSION_NONCE = randomUUID()

/**
 * Drag payload shape for the upgraded P3.2 browser.
 * qa-redteam H2: `kind` is enum-validated; `id` is namespace-checked via regex.
 */
export interface DragPayload {
  kind: 'fx' | 'op' | 'composite' | 'instruments'
  id: string  // format: "builtin:<effectId>" | "user:<name>"
}

/**
 * Validate a drag payload from dataTransfer. Returns the payload if valid,
 * or null if the payload is malformed, the nonce is missing/mismatched, or
 * the id namespace does not match the allowed regex.
 *
 * Does NOT accept legacy plain-string payloads (back-compat for DeviceChain
 * is handled in DeviceChain.tsx, not here).
 */
export function parseDragPayload(
  dataTransfer: DataTransfer,
  expectedNonce: string,
): DragPayload | null {
  // Nonce check (qa-redteam H1): must be present AND match session nonce.
  const nonce = dataTransfer.getData(CREATRIX_NONCE_TYPE)
  if (!nonce || nonce !== expectedNonce) return null

  const raw = dataTransfer.getData(EFFECT_DRAG_TYPE)
  if (!raw || raw.length > 256) return null

  // Try JSON (P3.2+ payload)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { kind, id } = parsed as { kind: unknown; id: unknown }
    // qa-redteam H2: kind must be one of the enum values
    if (!['fx', 'op', 'composite', 'instruments'].includes(kind as string)) return null
    if (typeof id !== 'string') return null
    // qa-redteam H2: id must match builtin: or user: namespace
    if (!/^(builtin:|user:)/.test(id)) return null
    return { kind: kind as DragPayload['kind'], id: id as string }
  } catch {
    return null
  }
}

/**
 * Cursor tools for the [tool] tab (PLAN §3.7).
 */
export type CursorTool =
  | 'select'
  | 'razor'
  | 'slip'
  | 'slide'
  | 'ripple-delete'
  | 'marker'
  | 'loop-in'
  | 'loop-out'
  | 'range-select'

const TOOL_ENTRIES: Array<{ id: CursorTool; label: string }> = [
  { id: 'select', label: 'Select' },
  { id: 'razor', label: 'Razor' },
  { id: 'slip', label: 'Slip' },
  { id: 'slide', label: 'Slide' },
  { id: 'ripple-delete', label: 'Ripple Delete' },
  { id: 'marker', label: 'Marker' },
  { id: 'loop-in', label: 'Loop In' },
  { id: 'loop-out', label: 'Loop Out' },
  { id: 'range-select', label: 'Range Select' },
]

/**
 * isTextInputActive — verbatim from PLAN.md §3.7 (qa-redteam H5 + CTO C3).
 * Guards bare-letter tool shortcuts from firing when the user is typing.
 */
export function isTextInputActive(): boolean {
  const el = document.activeElement
  if (!el || el === document.body) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true
  if ((el as HTMLElement).isContentEditable) return true
  if (el.getAttribute('role') === 'textbox') return true
  if (el.hasAttribute('data-no-shortcut')) return true
  return false
}

// Operator stub list (PLAN §3.5 — frontend-only display)
const OPERATOR_STUBS = [
  'LFO', 'Env Follower', 'S&H', 'Random', 'Add', 'Multiply',
  'Clamp', 'Curve', 'Audio Amplitude', 'MIDI CC', 'Playhead Time',
  'Sidechain', 'Gate', 'MIDI Envelope Stutter', 'Kentaro Cluster',
]

// Instrument racks placeholder (P3.5 owns full content)
const INSTRUMENT_RACKS = ['Drum Rack', 'Sampler', 'Wavetable']

interface EffectBrowserProps {
  registry: EffectInfo[]
  isLoading: boolean
  onAddEffect: (effect: EffectInstance) => void
  chainLength: number
  onAddTextTrack?: () => void
}

const EXPANDED_STORAGE_KEY = 'entropic-effect-browser-expanded'

function loadExpanded(): { value: Set<string>; hasStored: boolean } {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
    if (!raw) return { value: new Set<string>(), hasStored: false }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return {
        value: new Set(parsed.filter((s): s is string => typeof s === 'string')),
        hasStored: true,
      }
    }
  } catch {
    // Best-effort
  }
  return { value: new Set<string>(), hasStored: false }
}

function persistExpanded(expanded: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(expanded)))
  } catch {
    // Best-effort
  }
}

export default function EffectBrowser({
  registry,
  isLoading,
  onAddEffect,
  chainLength,
  onAddTextTrack,
}: EffectBrowserProps) {
  // Tab state from store (persists across mounts — P3.2)
  const activeTab = useBrowserStore((s) => s.activeTab)
  const setActiveTab = useBrowserStore((s) => s.setActiveTab)
  const addToast = useToastStore((s) => s.addToast)

  // Search query: LOCAL state so each component mount gets a fresh value.
  // (Using store-level state caused cross-test pollution since Zustand is a
  // singleton — tests render the component in isolation and expect a clean slate.)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  const clearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  // Esc on search: clear + blur (PLAN §3.5)
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      clearSearch()
      searchInputRef.current?.blur()
      e.preventDefault()
    }
  }, [clearSearch])

  // Cursor tool stack for the [tool] tab (PLAN §3.7 / qa-redteam H5)
  const [cursorTool, setCursorTool] = useState<CursorTool>('select')
  const cursorStackRef = useRef<CursorTool[]>([])

  // Expose cursor tool on body for statusbar chip reads
  useEffect(() => {
    document.body.setAttribute('data-cursor-tool', cursorTool)
    return () => {
      document.body.removeAttribute('data-cursor-tool')
    }
  }, [cursorTool])

  const handleToolSelect = useCallback((tool: CursorTool) => {
    // Guard: do not fire if a text input is focused (qa-redteam H5)
    if (isTextInputActive()) return
    cursorStackRef.current = [...cursorStackRef.current, cursorTool]
    setCursorTool(tool)
  }, [cursorTool])

  // Restore prior cursor mode (for modal close — PLAN §3.7)
  const restoreCursorTool = useCallback(() => {
    const stack = cursorStackRef.current
    if (stack.length > 0) {
      const prev = stack[stack.length - 1]
      cursorStackRef.current = stack.slice(0, -1)
      setCursorTool(prev)
    } else {
      setCursorTool('select')
    }
  }, [])
  void restoreCursorTool // exported for external callers

  // Ref captures whether localStorage had stored state at mount — never changes.
  const hasStoredRef = useRef<boolean>(false)

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const { value, hasStored } = loadExpanded()
    hasStoredRef.current = hasStored
    return hasStored ? value : new Set(registry.map((e) => e.category))
  })

  // fx effects = everything except composite category
  const fxRegistry = useMemo(() => {
    return registry.filter((e) => e.category !== 'composite')
  }, [registry])

  // composite effects = composite category only
  const compositeRegistry = useMemo(() => {
    return registry.filter((e) => e.category === 'composite')
  }, [registry])

  const categories = useMemo(() => {
    const cats = new Set(fxRegistry.map((e) => e.category))
    return Array.from(cats).sort()
  }, [fxRegistry])

  // Async-registry catch-up
  useEffect(() => {
    if (!hasStoredRef.current && expanded.size === 0 && categories.length > 0) {
      setExpanded(new Set(categories))
    }
  }, [categories, expanded.size])

  // Prune stored keys for removed categories
  useEffect(() => {
    setExpanded((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const cat of prev) {
        if (categories.includes(cat)) next.add(cat)
        else changed = true
      }
      if (changed) persistExpanded(next)
      return changed ? next : prev
    })
  }, [categories])

  const fxByCategory = useMemo(() => {
    const map = new Map<string, EffectInfo[]>()
    for (const e of fxRegistry) {
      const list = map.get(e.category) ?? []
      list.push(e)
      map.set(e.category, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [fxRegistry])

  // Global search across all effects
  const searchMatches = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.toLowerCase()
    const subseqMatch = (target: string, query: string): boolean => {
      let qi = 0
      for (let i = 0; i < target.length && qi < query.length; i++) {
        if (target[i] === query[qi]) qi++
      }
      return qi === query.length
    }
    const scoreEffect = (e: EffectInfo): number => {
      const name = e.name.toLowerCase()
      const id = e.id.toLowerCase()
      if (name.startsWith(q) || id.startsWith(q)) return 4
      if (name.split(/[\s_-]+/).some((w) => w.startsWith(q))) return 3
      if (name.includes(q) || id.includes(q)) return 2
      if (q.length >= 4 && (subseqMatch(name, q) || subseqMatch(id, q))) return 1
      return 0
    }
    return [...registry]
      .map((e) => ({ effect: e, score: scoreEffect(e) }))
      .filter((x) => x.score > 0)
      .sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.effect.name.localeCompare(b.effect.name),
      )
      .map((x) => x.effect)
  }, [registry, searchQuery])

  const handleAdd = (info: EffectInfo) => {
    if (chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN) return
    const instance: EffectInstance = {
      id: randomUUID(),
      effectId: info.id,
      isEnabled: true,
      isFrozen: false,
      parameters: Object.fromEntries(
        Object.entries(info.params).map(([key, def]) => [key, def.default]),
      ),
      modulations: {},
      mix: 1.0,
      mask: null,
    }
    onAddEffect(instance)
  }

  // F-0514-7 + P3.2: drag-add with upgraded JSON payload + session nonce.
  // Chain: drag source → setData(EFFECT_DRAG_TYPE, JSON{kind,id}) + nonce
  // DeviceChain drop handler validates nonce + JSON payload before accepting.
  const handleDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    info: EffectInfo,
    kind: DragPayload['kind'],
  ) => {
    if (chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'copy'
    // P3.2: JSON payload with kind enum + namespaced id (qa-redteam H1/H2)
    const payload: DragPayload = { kind, id: `builtin:${info.id}` }
    e.dataTransfer.setData(EFFECT_DRAG_TYPE, JSON.stringify(payload))
    e.dataTransfer.setData(CREATRIX_NONCE_TYPE, SESSION_NONCE)
    // text/plain fallback — human-readable, not machine-parsed
    e.dataTransfer.setData('text/plain', info.name)
  }

  const toggleCategory = (cat: string) => {
    hasStoredRef.current = true
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      persistExpanded(next)
      return next
    })
  }

  // USER folder import — rejects zip/bundle per qa-redteam Real Tiger 1 / PLAN §3.5
  const handleUserImport = () => {
    addToast({
      level: 'info',
      message: 'Preset import requires PR-AAA (hardening). Use the bundled racks for now.',
      source: 'browser-user-import',
    })
  }

  if (isLoading) {
    return <div className="effect-browser effect-browser--loading">Loading effects...</div>
  }

  const tabLabel: Record<BrowserTab, string> = {
    fx: 'fx',
    op: 'op',
    composite: 'composite',
    tool: 'tool',
    instruments: 'instruments',
  }

  return (
    <div className="effect-browser">
      {/* P3.2: Global search (PLAN §3.5) — X clear + Esc clears-and-blurs */}
      <div className="effect-browser__search-row">
        <div className="effect-search">
          <input
            ref={searchInputRef}
            type="text"
            className="effect-search__input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            data-testid="browser-search-input"
          />
          {searchQuery && (
            <button
              className="effect-search__clear"
              onClick={() => {
                clearSearch()
                searchInputRef.current?.blur()
              }}
              aria-label="Clear search"
              data-testid="browser-search-clear"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* P3.2: 5-tab bar (PLAN §3.5) */}
      <div className="effect-browser__tabs" role="tablist" data-testid="browser-tab-bar">
        {BROWSER_TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`effect-browser__tab${activeTab === tab ? ' effect-browser__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
            data-testid={`browser-tab-${tab}`}
          >
            {tabLabel[tab]}
          </button>
        ))}
      </div>

      {onAddTextTrack && (
        <div className="effect-browser__actions">
          <button className="effect-browser__action-btn" onClick={onAddTextTrack}>
            + Add Text Track
          </button>
        </div>
      )}

      <div className="effect-browser__body" data-testid="browser-body">
        {/* Global search overrides tab content */}
        {searchMatches ? (
          <>
            {searchMatches.map((info) => (
              <button
                key={info.id}
                className="effect-browser__item"
                onClick={() => handleAdd(info)}
                draggable={chainLength < LIMITS.MAX_EFFECTS_PER_CHAIN}
                onDragStart={(e) =>
                  handleDragStart(e, info, info.category === 'composite' ? 'composite' : 'fx')
                }
                disabled={chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN}
                title={
                  chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN
                    ? `Max ${LIMITS.MAX_EFFECTS_PER_CHAIN} effects`
                    : `Add ${info.name}`
                }
              >
                {info.name}
              </button>
            ))}
            {searchMatches.length === 0 && (
              <div className="effect-browser__empty">No effects found</div>
            )}
          </>
        ) : activeTab === 'fx' ? (
          // [fx] tab: categorized fx effects
          categories.map((cat) => {
            const isOpen = expanded.has(cat)
            const list = fxByCategory.get(cat) ?? []
            return (
              <div key={cat} className="effect-browser__folder">
                <button
                  className="effect-browser__folder-header"
                  onClick={() => toggleCategory(cat)}
                >
                  <span
                    className={`effect-browser__folder-caret${isOpen ? ' effect-browser__folder-caret--open' : ''}`}
                  >
                    ▶
                  </span>
                  <span>{cat}</span>
                  <span className="effect-browser__folder-count">{list.length}</span>
                </button>
                {isOpen && (
                  <div className="effect-browser__folder-list">
                    {list.map((info) => (
                      <button
                        key={info.id}
                        className="effect-browser__item"
                        onClick={() => handleAdd(info)}
                        disabled={chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN}
                        draggable={chainLength < LIMITS.MAX_EFFECTS_PER_CHAIN}
                        onDragStart={(e) => handleDragStart(e, info, 'fx')}
                        title={
                          chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN
                            ? `Max ${LIMITS.MAX_EFFECTS_PER_CHAIN} effects`
                            : `Add ${info.name}`
                        }
                      >
                        {info.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        ) : activeTab === 'op' ? (
          // [op] tab: operator/modulator stubs
          <div className="effect-browser__folder" data-testid="op-tab-content">
            <div className="effect-browser__folder-header effect-browser__folder-header--static">
              <span>Operators</span>
              <span className="effect-browser__folder-count">{OPERATOR_STUBS.length}</span>
            </div>
            <div className="effect-browser__folder-list">
              {OPERATOR_STUBS.map((name) => (
                <button
                  key={name}
                  className="effect-browser__item effect-browser__item--stub"
                  disabled
                  title={`${name} — coming in a future release`}
                  data-testid={`op-item-${name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : activeTab === 'composite' ? (
          // [composite] tab: blend modes
          compositeRegistry.length > 0 ? (
            compositeRegistry.map((info) => (
              <button
                key={info.id}
                className="effect-browser__item"
                onClick={() => handleAdd(info)}
                disabled={chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN}
                draggable={chainLength < LIMITS.MAX_EFFECTS_PER_CHAIN}
                onDragStart={(e) => handleDragStart(e, info, 'composite')}
                title={
                  chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN
                    ? `Max ${LIMITS.MAX_EFFECTS_PER_CHAIN} effects`
                    : `Add ${info.name}`
                }
                data-testid={`composite-item-${info.id}`}
              >
                {info.name}
              </button>
            ))
          ) : (
            <div className="effect-browser__folder" data-testid="composite-tab-content">
              <div className="effect-browser__folder-header effect-browser__folder-header--static">
                <span>Composite</span>
              </div>
              <div className="effect-browser__empty">No composite effects registered</div>
            </div>
          )
        ) : activeTab === 'tool' ? (
          // [tool] tab: cursor mode tools (PLAN §3.7)
          <div className="effect-browser__folder" data-testid="tool-tab-content">
            <div className="effect-browser__folder-header effect-browser__folder-header--static">
              <span>Cursor Tools</span>
            </div>
            <div className="effect-browser__folder-list">
              {TOOL_ENTRIES.map(({ id, label }) => (
                <button
                  key={id}
                  className={`effect-browser__item effect-browser__item--tool${cursorTool === id ? ' effect-browser__item--tool-active' : ''}`}
                  onClick={() => handleToolSelect(id)}
                  title={`Switch to ${label} tool`}
                  data-testid={`tool-item-${id}`}
                >
                  {label}
                  {cursorTool === id && (
                    <span className="effect-browser__tool-active-badge">●</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // [instruments] tab: placeholder RACKS folder (P3.5 owns full content)
          <div className="effect-browser__folder" data-testid="instruments-tab-content">
            <div className="effect-browser__folder-header effect-browser__folder-header--static">
              <span>RACKS</span>
              <span className="effect-browser__folder-count">{INSTRUMENT_RACKS.length}</span>
            </div>
            <div className="effect-browser__folder-list">
              {INSTRUMENT_RACKS.map((name) => (
                <button
                  key={name}
                  className="effect-browser__item"
                  disabled={chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN}
                  title={`Add ${name}`}
                  data-testid={`instrument-item-${name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {name}
                </button>
              ))}
            </div>
            {/* USER folder — rejects zip/bundle per qa-redteam Real Tiger 1 */}
            <div className="effect-browser__folder-header effect-browser__folder-header--static">
              <span>USER</span>
            </div>
            <div className="effect-browser__folder-list">
              <button
                className="effect-browser__item effect-browser__item--user-import"
                onClick={handleUserImport}
                title="Import preset (requires hardening PR)"
                data-testid="instruments-user-import"
              >
                + Import preset...
              </button>
            </div>
          </div>
        )}
      </div>

      {/* P3.2: Statusbar tool-mode chip (PLAN §3.7) */}
      {activeTab === 'tool' && (
        <div className="effect-browser__tool-chip" data-testid="tool-mode-chip" aria-live="polite">
          tool: {cursorTool}
        </div>
      )}
    </div>
  )
}
