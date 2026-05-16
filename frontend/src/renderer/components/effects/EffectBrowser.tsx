import { useState, useMemo, useEffect, useRef } from 'react'
import { randomUUID } from '../../utils'
import type { EffectInfo, EffectInstance } from '../../../shared/types'
import { LIMITS } from '../../../shared/limits'
import EffectSearch from './EffectSearch'

/**
 * MIME-style identifier used to ferry an effect ID from the browser to the
 * DeviceChain drop target via the HTML5 drag-and-drop dataTransfer payload.
 * Custom type (not text/plain) so accidental drags from outside the app
 * cannot inject a fake effect into the chain. F-0514-7.
 */
export const EFFECT_DRAG_TYPE = 'application/x-entropic-effect-id'

interface EffectBrowserProps {
  registry: EffectInfo[]
  isLoading: boolean
  onAddEffect: (effect: EffectInstance) => void
  chainLength: number
  onAddTextTrack?: () => void
}

const STORAGE_KEY = 'entropic-effect-browser-expanded'

function loadExpanded(): { value: Set<string>; hasStored: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(expanded)))
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
  const [searchQuery, setSearchQuery] = useState('')

  // Ref captures whether localStorage had stored state at mount — never changes.
  const hasStoredRef = useRef<boolean>(false)

  // Lazy initializer avoids the paint-collapsed-then-paint-expanded flash on first mount.
  // If registry is populated at mount, expand all categories immediately (no flash).
  // If registry is empty at mount (async load), the useEffect below catches up when it populates.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const { value, hasStored } = loadExpanded()
    hasStoredRef.current = hasStored
    return hasStored ? value : new Set(registry.map((e) => e.category))
  })

  const categories = useMemo(() => {
    const cats = new Set(registry.map((e) => e.category))
    return Array.from(cats).sort()
  }, [registry])

  // Async-registry catch-up: if mount happened before registry loaded and user has no
  // stored state, expand all categories when they first become available.
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

  const effectsByCategory = useMemo(() => {
    const map = new Map<string, EffectInfo[]>()
    for (const e of registry) {
      const list = map.get(e.category) ?? []
      list.push(e)
      map.set(e.category, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [registry])

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
    // Ranked scoring: prefix > word-start > substring > subsequence
    const scoreEffect = (e: EffectInfo): number => {
      const name = e.name.toLowerCase()
      const id = e.id.toLowerCase()
      if (name.startsWith(q) || id.startsWith(q)) return 4
      if (name.split(/[\s_-]+/).some((w) => w.startsWith(q))) return 3
      if (name.includes(q) || id.includes(q)) return 2
      // Fuzzy only for queries >= 4 chars, to reduce noise for short queries
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

  // F-0514-7: drag-add. Source-side ferry uses our custom MIME type so the
  // DeviceChain drop target can ignore drags from outside the app.
  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, info: EffectInfo) => {
    if (chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN) {
      // Suppress drag init when chain is full so the user gets the same
      // disabled-button feel they get for click-add.
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(EFFECT_DRAG_TYPE, info.id)
    // text/plain fallback so a user dragging into a text editor sees something
    // sensible rather than a binary blob.
    e.dataTransfer.setData('text/plain', info.name)
  }

  const toggleCategory = (cat: string) => {
    // First toggle marks "user has expressed intent" — prevents async-catchup from clobbering.
    hasStoredRef.current = true
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      persistExpanded(next)
      return next
    })
  }

  if (isLoading) {
    return <div className="effect-browser effect-browser--loading">Loading effects...</div>
  }

  return (
    <div className="effect-browser">
      <div className="effect-browser__header">Effects</div>
      <EffectSearch query={searchQuery} onQueryChange={setSearchQuery} />
      {onAddTextTrack && (
        <div className="effect-browser__actions">
          <button className="effect-browser__action-btn" onClick={onAddTextTrack}>
            + Add Text Track
          </button>
        </div>
      )}
      <div className="effect-browser__body">
        {searchMatches ? (
          <>
            {searchMatches.map((info) => (
              <button
                key={info.id}
                className="effect-browser__item"
                onClick={() => handleAdd(info)}
                draggable={chainLength < LIMITS.MAX_EFFECTS_PER_CHAIN}
                onDragStart={(e) => handleDragStart(e, info)}
                disabled={chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN}
                title={chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN ? `Max ${LIMITS.MAX_EFFECTS_PER_CHAIN} effects` : `Add ${info.name}`}
              >
                {info.name}
              </button>
            ))}
            {searchMatches.length === 0 && (
              <div className="effect-browser__empty">No effects found</div>
            )}
          </>
        ) : (
          categories.map((cat) => {
            const isOpen = expanded.has(cat)
            const list = effectsByCategory.get(cat) ?? []
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
                        title={chainLength >= LIMITS.MAX_EFFECTS_PER_CHAIN ? `Max ${LIMITS.MAX_EFFECTS_PER_CHAIN} effects` : `Add ${info.name}`}
                      >
                        {info.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
