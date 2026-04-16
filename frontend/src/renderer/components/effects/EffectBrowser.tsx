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

export default function EffectBrowser({
  registry,
  isLoading,
  onAddEffect,
  chainLength,
  onAddTextTrack,
}: EffectBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const cats = new Set(registry.map((e) => e.category))
    return Array.from(cats).sort()
  }, [registry])

  const filteredEffects = useMemo(() => {
    let effects = registry
    if (selectedCategory) {
      effects = effects.filter((e) => e.category === selectedCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      // Subsequence match: all chars of query appear in order in target
      // e.g. "dtmsh" matches "datamosh" (d-a-t-a-m-o-s-h)
      const subseqMatch = (target: string, query: string): boolean => {
        let qi = 0
        for (let i = 0; i < target.length && qi < query.length; i++) {
          if (target[i] === query[qi]) qi++
        }
        return qi === query.length
      }
      effects = effects.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          subseqMatch(e.name.toLowerCase(), q) ||
          subseqMatch(e.id.toLowerCase(), q),
      )
    }
    return effects
  }, [registry, selectedCategory, searchQuery])

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

  // Reset category filter if it disappears from registry
  useEffect(() => {
    if (selectedCategory && !categories.includes(selectedCategory)) {
      setSelectedCategory(null)
    }
  }, [categories, selectedCategory])

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
        <div className="effect-browser__categories">
          <button
            className={`effect-browser__cat-btn ${selectedCategory === null ? 'effect-browser__cat-btn--active' : ''}`}
            onClick={() => setSelectedCategory(null)}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`effect-browser__cat-btn ${selectedCategory === cat ? 'effect-browser__cat-btn--active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="effect-browser__list">
          {filteredEffects.map((info) => (
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
          {filteredEffects.length === 0 && (
            <div className="effect-browser__empty">No effects found</div>
          )}
        </div>
      </div>
    </div>
  )
}
