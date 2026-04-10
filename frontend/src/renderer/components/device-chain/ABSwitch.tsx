import { useProjectStore } from '../../stores/project'

interface ABSwitchProps {
  effectId: string
  isActive: boolean
  activeSlot: 'a' | 'b'
}

export default function ABSwitch({ effectId, isActive, activeSlot }: ABSwitchProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const store = useProjectStore.getState()
    if (!isActive) {
      store.activateAB(effectId)
    } else if (e.shiftKey) {
      store.copyToInactiveAB(effectId)
    } else {
      store.toggleAB(effectId)
    }
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
      title={`${activeSlot === 'a' ? 'A active' : 'B active'} — Click to toggle, Shift+click to copy`}
    >
      <span className={activeSlot === 'a' ? 'ab-switch__slot--active' : 'ab-switch__slot--dim'}>A</span>
      <span className={activeSlot === 'b' ? 'ab-switch__slot--active' : 'ab-switch__slot--dim'}>B</span>
    </button>
  )
}
