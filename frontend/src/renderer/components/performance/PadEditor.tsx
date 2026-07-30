import { useState, useCallback } from 'react';
import { usePerformanceStore } from '../../stores/performance';
import { useMIDIStore } from '../../stores/midi';
import { ADSR_PRESETS, RESERVED_KEYS, codeToLabel } from '../../../shared/constants';
import { midiNoteToName } from '../../../shared/midi-utils';
import { useStableListener } from '../../hooks/useStableListener';
import Icon, { CloseButton } from '../../assets/icon-kit';
import Slider from '../common/Slider';
import Select from '../common/Select';
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
  useStableListener(window, 'keydown', (e: Event) => {
    const ke = e as KeyboardEvent;
    ke.preventDefault();
    ke.stopPropagation();
    setIsCapturingKey(false);

    if (ke.code === 'Escape') {
      setKeyError(null);
      return;
    }

    if (RESERVED_KEYS.has(ke.code)) {
      setKeyError(`${codeToLabel(ke.code)} is reserved`);
      return;
    }

    setKeyError(null);
    setPadKeyBinding(padId, ke.code);
  }, isCapturingKey, { capture: true });

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
          <CloseButton className="export-dialog__close" onClick={onClose} ariaLabel="Close pad editor" />
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
              ><Icon name="unlink" size={12} /></button>
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
              ><Icon name="unlink" size={12} /></button>
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
            <Select
              className="param-choice__select"
              value={pad.chokeGroup ?? ''}
              onChange={(e) => setChokeGroup(padId, e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">None</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>Group {n}</option>
              ))}
            </Select>
          </div>

          {/* ADSR */}
          <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' }}>ADSR</span>
              <Select
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
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {(['attack', 'decay', 'sustain', 'release'] as const).map((param) => (
                <div key={param} className="param-slider">
                  <Slider
                    value={pad.envelope[param]}
                    min={0}
                    max={param === 'sustain' ? 1 : 300}
                    default={param === 'sustain' ? 1 : 0}
                    label={param[0].toUpperCase()}
                    type="float"
                    onChange={(v) => {
                      updatePad(padId, {
                        envelope: { ...pad.envelope, [param]: v },
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
            {pad.modRoutes.length === 0 && (
              <div style={{ fontSize: 11, color: '#666', textAlign: 'center', padding: 8 }}>
                No modRoutes — add one to connect this pad to an effect parameter
              </div>
            )}
            {pad.modRoutes.map((mapping, idx) => {
              const isBroken = mapping.effectId && !isEffectInChain(mapping.effectId);
              const effect = effectChain.find((e) => e.id === mapping.effectId);
              const effectInfo = effect ? registry.find((r) => r.id === effect.effectId) : null;

              return (
                <div
                  key={`${mapping.effectId}-${mapping.paramKey}-${idx}`}
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
                  <Select
                    className="param-choice__select"
                    style={{ flex: 1, fontSize: 10 }}
                    value={mapping.effectId ?? ''}
                    onChange={(e) => {
                      const newMappings = [...pad.modRoutes];
                      newMappings[idx] = { ...mapping, effectId: e.target.value };
                      updatePad(padId, { modRoutes: newMappings });
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
                  </Select>
                  <Select
                    className="param-choice__select"
                    style={{ flex: 1, fontSize: 10 }}
                    value={mapping.paramKey ?? ''}
                    onChange={(e) => {
                      const newMappings = [...pad.modRoutes];
                      newMappings[idx] = { ...mapping, paramKey: e.target.value };
                      updatePad(padId, { modRoutes: newMappings });
                    }}
                  >
                    <option value="">Param...</option>
                    {effectInfo && Object.entries(effectInfo.params)
                      .filter(([, def]) => def.type === 'float' || def.type === 'int')
                      .map(([key, def]) => (
                        <option key={key} value={key}>{def.label}</option>
                      ))}
                  </Select>
                  <div style={{ width: 50 }}>
                    <Slider
                      value={mapping.depth}
                      min={0}
                      max={1}
                      default={0}
                      label="Depth"
                      description={`Depth: ${mapping.depth.toFixed(2)}`}
                      type="float"
                      showHeader={false}
                      onChange={(v) => {
                        const newMappings = [...pad.modRoutes];
                        newMappings[idx] = { ...mapping, depth: v };
                        updatePad(padId, { modRoutes: newMappings });
                      }}
                    />
                  </div>
                  <button
                    className="effect-card__remove"
                    onClick={() => removePadMapping(padId, idx)}
                  >
                    <Icon name="unlink" size={12} />
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
