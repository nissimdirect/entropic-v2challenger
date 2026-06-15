/**
 * MemoryStatus — P5b.2 (SG-8 frontend).
 *
 * Renders a persistent memory-pressure badge when level ≠ 'ok'.
 *   - `ok`          → renders nothing (null)
 *   - `warn`        → amber badge showing level + current_pct
 *   - `auto_disable`→ amber badge + disabled-feature list
 *   - `emergency`   → red badge + disabled-feature list
 *
 * Positioned `position:fixed` (never modifies the root grid).
 * Per CLAUDE.md feedback_test-layout-changes: NEVER modify grid-template-rows.
 */
import { useMemoryPressureStore } from '../../stores/memoryPressure'
import './memory-status.css'

export default function MemoryStatus() {
  const level = useMemoryPressureStore((s) => s.level)
  const current_pct = useMemoryPressureStore((s) => s.current_pct)
  const degraded_features = useMemoryPressureStore((s) => s.degraded_features)

  if (level === 'ok') return null

  const levelLabel: Record<typeof level, string> = {
    ok: 'OK',
    warn: 'Memory Warn',
    auto_disable: 'Memory Pressure',
    emergency: 'Memory Critical',
  }

  return (
    <div
      className={`memory-status memory-status--${level}`}
      role="status"
      aria-live="polite"
      aria-label={`Memory pressure: ${levelLabel[level]}`}
      data-level={level}
      data-pct={current_pct}
    >
      <span className="memory-status__label">{levelLabel[level]}</span>
      <span className="memory-status__pct">{current_pct.toFixed(0)}%</span>
      {degraded_features.length > 0 && (
        <ul className="memory-status__features" aria-label="Disabled features">
          {degraded_features.map((f) => (
            <li key={f} className="memory-status__feature">
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
