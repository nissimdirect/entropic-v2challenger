interface EffectSearchProps {
  query: string
  onQueryChange: (query: string) => void
}

export default function EffectSearch({ query, onQueryChange }: EffectSearchProps) {
  return (
    <div className="effect-search">
      <input
        type="text"
        className="effect-search__input"
        placeholder="Search effects..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
    </div>
  )
}
