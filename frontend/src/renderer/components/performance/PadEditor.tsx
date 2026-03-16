import { useState, useEffect, useCallback } from 'react';
import { usePerformanceStore } from '../../stores/performance';
import { useMIDIStore } from '../../stores/midi';
import { ADSR_PRESETS, RESERVED_KEYS, codeToLabel } from '../../../shared/constants';
import { midiNoteToName } from '../../../shared/midi-utils';
import type { EffectInstance, EffectInfo, ModulationRoute, PadMode } from '../../../shared/types';

interface PadEditorProps {
  padId: string;
  effectChain: EffectInstance[];
  registry: EffectInfo[];
  onClose: () => void;
}

const PAD_MODES: PadMode[] = ['gate', 'toggle', 'one-shot'];
const PRESET_NAMES = Object.keys(ADSR_PRESETS);

export default function PadEditor({ padId, effectChain, registry, onClose }: PadEditorProps) {
  const pad = usePerformanceStore((s) => s.drumRack.pads.find((p) => p.id === padId));
  const updatePad = usePerformanceStore((s) => s.updatePad);
  const addPadMapping = usePerformanceStore((s) => s.addPadMapping);
  const removePadMapping = usePerformanceStore((s) => s.removePadMapping);
  const setPadKeyBinding = usePerformanceStore((s) => s.setPadKeyBinding);
  const setChokeGroup = usePerformanceStore((s) => s.setChokeGroup);

  const [isCapturingKey, setIsCapturingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Capture next keypress for key binding
  useEffect(() => {
    if (!isCapturingKey) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsCapturingKey(false);

      if (e.code === 'Escape') {
        setKeyError(null);
        return;
      }

      if (RESERVED_KEYS.has(e.code)) {
        setKeyError(`${codeToLabel(e.code)} is reserved`);
        return;
      }

      setKeyError(null);
      setPadKeyBinding(padId, e.code);
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [isCapturingKey, padId, setPadKeyBinding]);

  const handleAddMapping = useCallback(() => {
    if (effectChain.length === 0) return;

    const effect = effectChain[0];
    const effectInfo = registry.find((r) => r.id === effect.effectId);
    const firstParam = effectInfo
      ? Object.keys(effectInfo.params)[0]
      : Object.keys(effect.parameters)[0];

    if (!firstParam) return;

    const paramDef = effectInfo?.params[firstParam];

    const mapping: ModulationRoute = {
      sourceId: padId,
      depth: 1.0,
      min: paramDef?.min ?? 0,
      max: paramDef?.max ?? 1,
      curve: 'linear',
      effectId: effect.id,
      paramKey: firstParam,
    };

    addPadMapping(padId, mapping);
  }, [effectChain, registry, padId, addPadMapping]);

  if (!pad) return null;

  const isEffectInChain = (effectId: string) =>
    effectChain.some((e) => e.id === effectId);

  return (
    <div className="export-dialog__overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="export-dialog__header">
          <span>Edit Pad — {pad.label}</span>
          <button className="export-dialog__close" onClick={onClose}>×</button>
        </div>
        <div className="export-dialog__body">
          {/* Key Binding */}
          <div className="export-dialog__field">
            <label style={{ color: '#aaa', fontSize: 12, minWidth: 70 }}>Key:</label>
            <button
              className="file-dialog-btn"
              onClick={() => setIsCapturingKey(true)}
              style={{ flex: 1, textAlign: 'center' }}
            >
              {isCapturingKey
                ? 'Press a key...'
                : pad.keyBinding
                  ? codeToLabel(pad.keyBinding)
                  : '(none)'}
            </button>
            {pad.keyBinding && (
              <button
                className="effect-card__remove"
                onClick={() => setPadKeyBinding(padId, null)}
                title="Unbind"
              >×</button>
            )}
          </div>
          {keyError && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: -4 }}>{keyError}</div>
          )}

          {/* MIDI Note */}
          <div className="export-dialog__field">
            <label style={{ color: '#aaa', fontSize: 12, minWidth: 70 }}>MIDI:</label>
            <button
              className="file-dialog-btn"
              onClick={() => {
                useMIDIStore.getState().setLearnTarget({ type: 'pad', padId });
              }}
              style={{ flex: 1, textAlign: 'center' }}
            >
              {pad.midiNote !== null && pad.midiNote !== undefined
                ? midiNoteToName(pad.midiNote)
                : 'Learn...'}
            </button>
            {pad.midiNote !== null && pad.midiNote !== undefined && (
              <button
                className="effect-card__remove"
                onClick={() => updatePad(padId, { midiNote: null })}
                title="Clear MIDI note"
              >×</button>
            )}
          </div>

          {/* Mode */}
          <div className="export-dialog__field">
            <label style={{ color: '#aaa', fontSize: 12, minWidth: 70 }}>Mode:</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {PAD_MODES.map((mode) => (
                <button
                  key={mode}
                  className={`effect-browser__cat-btn${pad.mode === mode ? ' effect-browser__cat-btn--active' : ''}`}
                  onClick={() => updatePad(padId, { mode })}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Choke Group */}
          <div className="export-dialog__field">
            <label style={{ color: '#aaa', fontSize: 12, minWidth: 70 }}>Choke:</label>
            <select
              className="param-choice__select"
              value={pad.chokeGroup ?? ''}
              onChange={(e) => setChokeGroup(padId, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">None</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>Group {n}</option>
              ))}
            </select>
          </div>

          {/* ADSR */}
          <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>ADSR</span>
              <select
                className="param-choice__select"
                style={{ fontSize: 10, padding: '2px 4px' }}
                value=""
                onChange={(e) => {
                  const preset = ADSR_PRESETS[e.target.value];
                  if (preset) updatePad(padId, { envelope: { ...preset } });
                }}
              >
                <option value="">Presets...</option>
                {PRESET_NAMES.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {(['attack', 'decay', 'sustain', 'release'] as const).map((param) => (
                <div key={param} className="param-slider">
                  <div className="param-slider__label">
                    <span>{param[0].toUpperCase()}</span>
                    <span className="param-slider__value">
                      {param === 'sustain' ? pad.envelope[param].toFixed(2) : pad.envelope[param].toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    className="param-slider__input"
                    min={0}
                    max={param === 'sustain' ? 1 : 300}
                    step={param === 'sustain' ? 0.01 : 0.1}
                    value={pad.envelope[param]}
                    onChange={(e) => {
                      updatePad(padId, {
                        envelope: { ...pad.envelope, [param]: parseFloat(e.target.value) },
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Mappings */}
          <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>Mappings</span>
              <button
                className="file-dialog-btn"
                onClick={handleAddMapping}
                disabled={effectChain.length === 0}
                style={{ fontSize: 10, padding: '2px 8px' }}
              >
                + Add
              </button>
            </div>
            {pad.mappings.length === 0 && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: 8 }}>
                No mappings — add one to connect this pad to an effect parameter
              </div>
            )}
            {pad.mappings.map((mapping, idx) => {
              const isBroken = mapping.effectId && !isEffectInChain(mapping.effectId);
              const effect = effectChain.find((e) => e.id === mapping.effectId);
              const effectInfo = effect ? registry.find((r) => r.id === effect.effectId) : null;

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 0',
                    borderLeft: isBroken ? '2px solid #ef4444' : '2px solid transparent',
                    paddingLeft: 6,
                    marginBottom: 2,
                  }}
                >
                  <select
                    className="param-choice__select"
                    style={{ flex: 1, fontSize: 10 }}
                    value={mapping.effectId ?? ''}
                    onChange={(e) => {
                      const newMappings = [...pad.mappings];
                      newMappings[idx] = { ...mapping, effectId: e.target.value };
                      updatePad(padId, { mappings: newMappings });
                    }}
                  >
                    <option value="">Effect...</option>
                    {effectChain.map((eff) => {
                      const info = registry.find((r) => r.id === eff.effectId);
                      return (
                        <option key={eff.id} value={eff.id}>
                          {info?.name ?? eff.effectId}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    className="param-choice__select"
                    style={{ flex: 1, fontSize: 10 }}
                    value={mapping.paramKey ?? ''}
                    onChange={(e) => {
                      const newMappings = [...pad.mappings];
                      newMappings[idx] = { ...mapping, paramKey: e.target.value };
                      updatePad(padId, { mappings: newMappings });
                    }}
                  >
                    <option value="">Param...</option>
                    {effectInfo && Object.entries(effectInfo.params)
                      .filter(([, def]) => def.type === 'float' || def.type === 'int')
                      .map(([key, def]) => (
                        <option key={key} value={key}>{def.label}</option>
                      ))}
                  </select>
                  <input
                    type="range"
                    style={{ width: 50 }}
                    className="param-slider__input"
                    min={0}
                    max={1}
                    step={0.01}
                    value={mapping.depth}
                    title={`Depth: ${mapping.depth.toFixed(2)}`}
                    onChange={(e) => {
                      const newMappings = [...pad.mappings];
                      newMappings[idx] = { ...mapping, depth: parseFloat(e.target.value) };
                      updatePad(padId, { mappings: newMappings });
                    }}
                  />
                  <button
                    className="effect-card__remove"
                    onClick={() => removePadMapping(padId, idx)}
                  >
                    ×
                  </button>
                  {isBroken && (
                    <span style={{ fontSize: 9, color: '#ef4444' }} title="Effect not in chain">!</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="export-dialog__footer">
          <button className="export-dialog__cancel-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
