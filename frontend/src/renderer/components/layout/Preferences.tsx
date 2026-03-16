import { useState } from 'react'
import ShortcutEditor from './ShortcutEditor'

interface PreferencesProps {
  isOpen: boolean
  onClose: () => void
}

type PreferencesTab = 'general' | 'shortcuts' | 'performance' | 'paths'

const TAB_LABELS: Record<PreferencesTab, string> = {
  general: 'General',
  shortcuts: 'Shortcuts',
  performance: 'Performance',
  paths: 'Paths',
}

const TABS: PreferencesTab[] = ['general', 'shortcuts', 'performance', 'paths']

export default function Preferences({ isOpen, onClose }: PreferencesProps) {
  const [activeTab, setActiveTab] = useState<PreferencesTab>('general')
  const [autoFreezeThreshold, setAutoFreezeThreshold] = useState(50)
  const [maxChainLength, setMaxChainLength] = useState(20)
  const [renderQuality, setRenderQuality] = useState('medium')
  const [presetFolder, setPresetFolder] = useState('')
  const [autosaveFolder, setAutosaveFolder] = useState('')
  const [cacheFolder, setCacheFolder] = useState('')

  if (!isOpen) return null

  const renderGeneralTab = () => (
    <div className="preferences__section">
      <div className="preferences__field">
        <label>Theme</label>
        <div className="preferences__field-row">
          <span className="preferences__value">Dark</span>
          <span className="preferences__hint">Light — Coming soon</span>
        </div>
      </div>
      <div className="preferences__field">
        <label>Language</label>
        <span className="preferences__value">English</span>
      </div>
    </div>
  )

  const renderShortcutsTab = () => (
    <ShortcutEditor />
  )

  const renderPerformanceTab = () => (
    <div className="preferences__section">
      <div className="preferences__field">
        <label>Auto-freeze threshold (effects)</label>
        <input
          type="number"
          className="preferences__input preferences__input--number"
          value={autoFreezeThreshold}
          onChange={(e) => setAutoFreezeThreshold(Math.max(1, parseInt(e.target.value, 10) || 1))}
          min={1}
          max={200}
        />
      </div>
      <div className="preferences__field">
        <label>Max chain length</label>
        <input
          type="number"
          className="preferences__input preferences__input--number"
          value={maxChainLength}
          onChange={(e) => setMaxChainLength(Math.max(1, parseInt(e.target.value, 10) || 1))}
          min={1}
          max={100}
        />
      </div>
      <div className="preferences__field">
        <label>Render quality</label>
        <select
          className="preferences__select"
          value={renderQuality}
          onChange={(e) => setRenderQuality(e.target.value)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
    </div>
  )

  const renderPathsTab = () => (
    <div className="preferences__section">
      {([
        { label: 'User preset folder', value: presetFolder, setter: setPresetFolder },
        { label: 'Autosave folder', value: autosaveFolder, setter: setAutosaveFolder },
        { label: 'Cache folder', value: cacheFolder, setter: setCacheFolder },
      ] as const).map(({ label, value, setter }) => (
        <div key={label} className="preferences__field">
          <label>{label}</label>
          <div className="preferences__field-row">
            <input
              type="text"
              className="preferences__input preferences__input--path"
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder="Not set"
            />
            <button className="preferences__browse-btn" onClick={() => {}}>
              Browse
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="preferences__overlay" onClick={onClose}>
      <div className="preferences" onClick={(e) => e.stopPropagation()}>
        <div className="preferences__header">
          <span>Preferences</span>
          <button className="preferences__close" onClick={onClose}>x</button>
        </div>

        <div className="preferences__tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              className={`preferences__tab${activeTab === tab ? ' preferences__tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="preferences__body">
          {activeTab === 'general' && renderGeneralTab()}
          {activeTab === 'shortcuts' && renderShortcutsTab()}
          {activeTab === 'performance' && renderPerformanceTab()}
          {activeTab === 'paths' && renderPathsTab()}
        </div>

        <div className="preferences__footer">
          <button className="preferences__close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
