import { useMIDIStore } from '../../stores/midi';

export default function MIDISettings() {
  const devices = useMIDIStore((s) => s.devices);
  const activeDeviceId = useMIDIStore((s) => s.activeDeviceId);
  const channelFilter = useMIDIStore((s) => s.channelFilter);
  const ccMappings = useMIDIStore((s) => s.ccMappings);
  const isSupported = useMIDIStore((s) => s.isSupported);

  if (!isSupported) {
    return (
      <div className="midi-settings">
        <div className="midi-settings__unsupported">
          MIDI not available in this browser
        </div>
      </div>
    );
  }

  return (
    <div className="midi-settings">
      <div className="midi-settings__section">
        <label className="midi-settings__label">Device</label>
        <select
          className="param-choice__select"
          value={activeDeviceId ?? ''}
          onChange={(e) => useMIDIStore.getState().setActiveDevice(e.target.value || null)}
        >
          <option value="">All devices</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.manufacturer})
            </option>
          ))}
        </select>
      </div>

      <div className="midi-settings__section">
        <label className="midi-settings__label">Channel</label>
        <select
          className="param-choice__select"
          value={channelFilter ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            useMIDIStore.getState().setChannelFilter(val === '' ? null : Number(val));
          }}
        >
          <option value="">All</option>
          {Array.from({ length: 16 }, (_, i) => (
            <option key={i} value={i}>{i + 1}</option>
          ))}
        </select>
      </div>

      <div className="midi-settings__section">
        <div className="midi-settings__section-header">
          <label className="midi-settings__label">CC Mappings</label>
          {ccMappings.length > 0 && (
            <button
              className="midi-settings__clear-btn"
              onClick={() => useMIDIStore.getState().clearCCMappings()}
            >
              Clear All
            </button>
          )}
        </div>
        {ccMappings.length === 0 ? (
          <div className="midi-settings__empty">
            No CC mappings — right-click a knob to learn
          </div>
        ) : (
          <div className="midi-settings__mapping-list">
            {ccMappings.map((m, idx) => (
              <div key={`cc-${m.cc}`} className="midi-settings__mapping-row">
                <span className="midi-settings__mapping-cc">CC {m.cc}</span>
                <span className="midi-settings__mapping-target">→ {m.paramKey}</span>
                <button
                  className="effect-card__remove"
                  onClick={() => useMIDIStore.getState().removeCCMapping(idx)}
                  title="Remove mapping"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
