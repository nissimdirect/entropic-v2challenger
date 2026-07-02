import { useMIDIStore } from '../../stores/midi';

export default function MIDILearnOverlay() {
  const learnTarget = useMIDIStore((s) => s.learnTarget);
  if (!learnTarget) return null;

  const message = learnTarget.type === 'pad'
    ? 'Move a MIDI controller or press a note...'
    : 'Move a MIDI CC knob or fader...';

  return (
    <div className="midi-learn-overlay">
      <span className="midi-learn-overlay__text">{message}</span>
      <button
        className="midi-learn-overlay__cancel"
        onClick={() => useMIDIStore.getState().setLearnTarget(null)}
      >
        Cancel
      </button>
    </div>
  );
}
