import { useCallback } from 'react'
import { useUndoStore } from '../../stores/undo'

export default function HistoryPanel() {
  const past = useUndoStore((s) => s.past)
  const future = useUndoStore((s) => s.future)

  const handleJump = useCallback(
    (targetIndex: number) => {
      const undoStore = useUndoStore.getState()
      const currentIndex = undoStore.past.length - 1

      if (targetIndex < currentIndex) {
        // Undo to reach target
        const steps = currentIndex - targetIndex
        for (let i = 0; i < steps; i++) {
          undoStore.undo()
        }
      } else if (targetIndex > currentIndex) {
        // Redo to reach target
        const steps = targetIndex - currentIndex
        for (let i = 0; i < steps; i++) {
          undoStore.redo()
        }
      }
    },
    [],
  )

  const allEntries = [...past, ...future]
  const currentIndex = past.length - 1

  if (allEntries.length === 0) {
    return (
      <div className="history-panel">
        <div className="history-panel__header">History</div>
        <div className="history-panel__empty">No actions yet</div>
      </div>
    )
  }

  return (
    <div className="history-panel">
      <div className="history-panel__header">History</div>
      <div className="history-panel__list">
        {allEntries.map((entry, i) => {
          const isCurrent = i === currentIndex
          const isFuture = i > currentIndex
          return (
            <button
              key={`${entry.description}-${entry.timestamp}`}
              className={`history-panel__entry${isCurrent ? ' history-panel__entry--current' : ''}${isFuture ? ' history-panel__entry--future' : ''}`}
              onClick={() => handleJump(i)}
            >
              <span className="history-panel__description">{entry.description}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
