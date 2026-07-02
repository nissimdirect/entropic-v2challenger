import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { randomUUID } from '../../utils'
import type { EffectInfo, EffectInstance } from '../../../shared/types'
import { LIMITS } from '../../../shared/limits'
import { useBrowserStore, type BrowserTab, BROWSER_TABS } from '../../stores/browser'
import { useToastStore } from '../../stores/toast'
import { useTimelineStore } from '../../stores/timeline'
import { useLayoutStore } from '../../stores/layout'
// P3.5: instruments tab now renders the real InstrumentsBrowser (INJ-4 fill).
import InstrumentsBrowser from '../instruments/InstrumentsBrowser'
// P4.6: op-tab operator entries (grouped) + drag-source handler.
import { OPERATOR_GROUPS, startOperatorDrag } from './operator-drag'

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
  // P4.6: 'operator' added — operator entries dragged from the op tab reuse this
  // exact payload channel (EFFECT_DRAG_TYPE + CREATRIX_NONCE_TYPE + SESSION_NONCE).
  // id format for operators is "builtin:<operatorType>" (e.g. "builtin:lfo").
  kind: 'fx' | 'op' | 'composite' | 'instruments' | 'operator'
  id: string  // format: "builtin:<effectId|operatorType>" | "user:<name>"
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
    if (!['fx', 'op', 'composite', 'instruments', 'operator'].includes(kind as string)) return null
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
 *
 * MK.13: mask tools are added here following the existing P3.2 cursor-mode
 * stack pattern. Selecting a mask tool also calls setPreviewToolMode on the
 * timeline store so MaskSelectOverlay activates the correct drawing mode.
 * Non-mask tools clear previewToolMode (null = normal pointer).
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
  // MK.13: mask tool modes (mirror previewToolMode values in timeline store)
  | 'mask-marquee-rect'
  | 'mask-marquee-ellipse'
  | 'mask-lasso-freehand'
  | 'mask-lasso-polygon'
  | 'mask-wand'
  | 'mask-key-picker'

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
 * MK.13: Mask tool registrations in the P3.2 cursor-mode stack.
 * Listed separately so tests can enumerate them with a stable reference.
 *
 * Maps each mask CursorTool id → the previewToolMode value the timeline store
 * expects. 'mask-key-picker' = eyedropper (MK.6 color-range / key selection).
 */
export const MASK_TOOL_ENTRIES: Array<{
  id: CursorTool
  label: string
  previewMode: 'marquee-rect' | 'marquee-ellipse' | 'lasso-freehand' | 'lasso-polygon' | 'wand' | 'eyedropper'
}> = [
  { id: 'mask-marquee-rect',    label: 'Mask Rect',     previewMode: 'marquee-rect' },
  { id: 'mask-marquee-ellipse', label: 'Mask Ellipse',  previewMode: 'marquee-ellipse' },
  { id: 'mask-lasso-freehand',  label: 'Mask Lasso',    previewMode: 'lasso-freehand' },
  { id: 'mask-lasso-polygon',   label: 'Mask Polygon',  previewMode: 'lasso-polygon' },
  { id: 'mask-wand',            label: 'Mask Wand',     previewMode: 'wand' },
  { id: 'mask-key-picker',      label: 'Key Picker',    previewMode: 'eyedropper' },
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

// P4.6: op-tab operator entries + drag helpers live in operator-drag.ts.
// Instrument racks list is now owned by InstrumentsBrowser (P3.5 fill).

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
  // T1 (2026-07-02): promoted from local useState to useLayoutStore.cursorTool
  // so keyboard shortcuts (App.tsx) and click handlers (Clip.tsx, TimeRuler.tsx)
  // read/write the same single source of truth. The store subscription re-renders
  // this component on change exactly like useState did — no other behavior change.
  const cursorTool = useLayoutStore((s) => s.cursorTool)
  const setCursorTool = useLayoutStore((s) => s.setCursorTool)
  const cursorStackRef = useRef<CursorTool[]>([])

  // MK.6: wand tolerance — read by MaskSelectOverlay's wand-sample IPC. The slider
  // below (shown while the wand tool is active) is the only writer of setWandTolerance.
  const wandTolerance = useTimelineStore((s) => s.wandTolerance)
  const setWandTolerance = useTimelineStore((s) => s.setWandTolerance)

  // Expose cursor tool on body for statusbar chip reads
  useEffect(() => {
    document.body.setAttribute('data-cursor-tool', cursorTool)
    return () => {
      document.body.removeAttribute('data-cursor-tool')
    }
  }, [cursorTool])

  const handleToolSelect = useCallback((tool: CursorTool) => {
    // Guard: do not fire if a text input is focused (qa-redteam H5 + MK.13 bare-letter guard)
    // This guard is inherited verbatim from P3.2 §3.7 — isTextInputActive() definition above.
    if (isTextInputActive()) return
    cursorStackRef.current = [...cursorStackRef.current, cursorTool]
    setCursorTool(tool)

    // MK.13: wire mask tools → timeline previewToolMode.
    // Non-mask tools clear the mode so MaskSelectOverlay deactivates.
    const maskEntry = MASK_TOOL_ENTRIES.find((e) => e.id === tool)
    if (maskEntry) {
      useTimelineStore.getState().setPreviewToolMode(maskEntry.previewMode)
    } else {
      useTimelineStore.getState().setPreviewToolMode(null)
    }
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
          // [op] tab: implemented operator types, grouped, drag-to-add (P4.6).
          // Each entry is a drag source on the EXISTING EffectBrowser DnD channel
          // (EffectBrowser.tsx:17-74) via startOperatorDrag — no new drag system.
          <div data-testid="op-tab-content">
            {OPERATOR_GROUPS.map(({ group, entries }) => (
              <div key={group} className="effect-browser__folder" data-testid={`op-group-${group}`}>
                <div className="effect-browser__folder-header effect-browser__folder-header--static">
                  <span>{group}</span>
                  <span className="effect-browser__folder-count">{entries.length}</span>
                </div>
                <div className="effect-browser__folder-list">
                  {entries.map((entry) => (
                    <button
                      key={entry.type}
                      className="effect-browser__item effect-browser__item--operator"
                      draggable
                      onDragStart={(e) => startOperatorDrag(e, entry)}
                      title={`Drag ${entry.label} onto a track header or a param knob`}
                      data-testid={`op-item-${entry.type}`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
          // [tool] tab: cursor mode tools (PLAN §3.7) + MK.13 mask tools
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
            {/* MK.13: Mask tool registrations in the P3.2 cursor-mode stack.
                Selecting a mask tool activates the corresponding previewToolMode so
                MaskSelectOverlay begins accepting pointer events on the preview canvas.
                isTextInputActive guard is inherited via handleToolSelect. */}
            <div className="effect-browser__folder-header effect-browser__folder-header--static masking__tool-section-header">
              <span>Mask Tools</span>
            </div>
            <div className="effect-browser__folder-list" data-testid="mask-tool-list">
              {MASK_TOOL_ENTRIES.map(({ id, label }) => (
                <button
                  key={id}
                  className={`effect-browser__item effect-browser__item--tool masking__tool-item${cursorTool === id ? ' effect-browser__item--tool-active masking__tool-item--active' : ''}`}
                  onClick={() => handleToolSelect(id)}
                  title={`Switch to ${label} mode`}
                  data-testid={`tool-item-${id}`}
                >
                  {label}
                  {cursorTool === id && (
                    <span className="effect-browser__tool-active-badge">●</span>
                  )}
                </button>
              ))}
            </div>
            {/* MK.6: Wand tolerance — RGB Euclidean distance [0, 441.67], default 30.
                Read by MaskSelectOverlay's wand-sample IPC; shown only while the Mask
                Wand tool is active. This is the sole writer of setWandTolerance. */}
            {cursorTool === 'mask-wand' && (
              <label
                className="effect-browser__tool-param masking__wand-tolerance"
                data-testid="wand-tolerance-control"
              >
                <span>Tolerance</span>
                <input
                  type="range"
                  data-testid="wand-tolerance"
                  value={wandTolerance}
                  min={0}
                  max={441.67}
                  step={1}
                  onChange={(e) => setWandTolerance(Number(e.target.value))}
                />
                <span data-testid="wand-tolerance-readout">{Math.round(wandTolerance)}</span>
              </label>
            )}
          </div>
        ) : (
          // [instruments] tab: P3.5 — real InstrumentsBrowser (INJ-4 fill).
          // Constraint (PR #154): modified IN PLACE — no new sibling browser component.
          <InstrumentsBrowser />
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
