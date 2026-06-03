import { useProjectStore } from '../../stores/project'
import { useTimelineStore } from '../../stores/timeline'

interface ABSwitchProps {
  effectId: string
  isActive: boolean
  activeSlot: 'a' | 'b'
}

export default function ABSwitch({ effectId, isActive, activeSlot }: ABSwitchProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // TODO(Epic02): use active track — mechanical migration for Epic 01 compatibility.
    const trackId = useTimelineStore.getState().selectedTrackId
    if (!trackId) return
    const store = useProjectStore.getState()
    if (!isActive) {
      store.activateAB(trackId, effectId)
    } else if (e.shiftKey) {
      store.copyToInactiveAB(trackId, effectId)
    } else {
      store.toggleAB(trackId, effectId)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // TODO(Epic02): use active track — mechanical migration for Epic 01 compatibility.
    const trackId = useTimelineStore.getState().selectedTrackId
    if (!trackId) return
    useProjectStore.getState().deactivateAB(trackId, effectId)
  }

  if (!isActive) {
    return (
      <button
        className="ab-switch"
        data-testid="ab-switch"
        onClick={handleClick}
        title="Enable A/B comparison"
      >
        AB
      </button>
    )
  }

  return (
    <button
      className="ab-switch ab-switch--active"
      data-testid="ab-switch"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={`${activeSlot === 'a' ? 'A active' : 'B active'} — Click to toggle, Shift+click to copy, Right-click to deactivate`}
    >
      <span className={activeSlot === 'a' ? 'ab-switch__slot--active' : 'ab-switch__slot--dim'}>A</span>
      <span className={activeSlot === 'b' ? 'ab-switch__slot--active' : 'ab-switch__slot--dim'}>B</span>
    </button>
  )
}
