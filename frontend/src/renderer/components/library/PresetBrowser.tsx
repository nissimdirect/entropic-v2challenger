import { useEffect } from 'react'
import type { Preset } from '../../../shared/types'
import { useLibraryStore } from '../../stores/library'
import PresetCard from './PresetCard'

interface PresetBrowserProps {
  onApplyPreset: (preset: Preset) => void
}

const CATEGORIES = ['glitch', 'color', 'temporal', 'destruction', 'physics', 'subtle', 'chain']

export default function PresetBrowser({ onApplyPreset }: PresetBrowserProps) {
  const {
    searchQuery,
    categoryFilter,
    isLoading,
    loadPresets,
    deletePreset,
    toggleFavorite,
    setSearch,
    setCategory,
    filteredPresets,
  } = useLibraryStore()

  useEffect(() => {
    loadPresets()
  }, [loadPresets])

  const presets = filteredPresets()

  if (isLoading) {
    return <div className="preset-browser preset-browser--loading">Loading presets...</div>
  }

  return (
    <div className="preset-browser">
      <div className="preset-browser__header">Presets</div>

      <div className="preset-browser__search">
        <input
          className="preset-browser__search-input"
          type="text"
          placeholder="Search presets..."
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="preset-browser__categories">
        <button
          className={`preset-browser__cat-btn ${categoryFilter === null ? 'preset-browser__cat-btn--active' : ''}`}
          onClick={() => setCategory(null)}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`preset-browser__cat-btn ${categoryFilter === cat ? 'preset-browser__cat-btn--active' : ''}`}
            onClick={() => setCategory(categoryFilter === cat ? null : cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="preset-browser__grid">
        {presets.length === 0 && (
          <div className="preset-browser__empty">
            {searchQuery || categoryFilter ? 'No matching presets' : 'No presets saved yet'}
          </div>
        )}
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            onApply={onApplyPreset}
            onToggleFavorite={toggleFavorite}
            onDelete={deletePreset}
          />
        ))}
      </div>
    </div>
  )
}
