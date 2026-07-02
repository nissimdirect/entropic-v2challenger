/**
 * H3 (master plan WS5) — arm MIDI-learn for an instrument device knob.
 *
 * The instrument devices (Sampler / Granulator / FrameBank) are per-track, not
 * effects, so their knobs are addressed by (trackId, paramKey) rather than an
 * effectId. Right-clicking a knob arms a 'slot' LearnTarget carrying an
 * 'instrument' SlotTarget; the first CC after arming binds a CCSlotMapping (see
 * stores/midi.ts). The live overlay is H4 — H3 only creates the binding.
 */
import { useMIDIStore } from '../../stores/midi'

export function armInstrumentLearn(trackId: string, paramKey: string): void {
  useMIDIStore.getState().setLearnTarget({
    type: 'slot',
    target: { kind: 'instrument', trackId, paramKey },
  })
}

/** Convenience onContextMenu handler factory for an instrument knob. */
export function instrumentLearnContextMenu(trackId: string, paramKey: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault()
    armInstrumentLearn(trackId, paramKey)
  }
}
