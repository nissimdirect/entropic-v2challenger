import { useState, useMemo, useEffect } from 'react'
import { randomUUID } from '../../utils'
import type { EffectInfo, EffectInstance } from '../../../shared/types'
import { LIMITS } from '../../../shared/limits'
import EffectSearch from './EffectSearch'

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
  const initial = useMemo(() => loadExpanded(), [])
  const [expanded, setExpanded] = useState<Set<string>>(initial.value)
  const [hasInitialized, setHasInitialized] = useState(initial.hasStored)

  const categories = useMemo(() => {
    const cats = new Set(registry.map((e) => e.category))
    return Array.from(cats).sort()
  }, [registry])

  // First load without persisted state: expand all categories by default
  useEffect(() => {
    if (!hasInitialized && categories.length > 0) {
      setExpanded(new Set(categories))
      setHasInitialized(true)
    }
  }, [hasInitialized, categories])

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

  const toggleCategory = (cat: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      persistExpanded(next)
      return next
    })
    setHasInitialized(true)
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
