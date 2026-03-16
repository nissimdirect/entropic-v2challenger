/**
 * MIDI store — device management, CC mapping, learn mode, message routing.
 * All MIDI processing is frontend-only (Web MIDI API in Electron renderer).
 */
import { create } from 'zustand';
import type { CCMapping, MIDIDevice, LearnTarget, MIDIPersistData } from '../../shared/types';
import { usePerformanceStore } from './performance';
import { handlePadTrigger, releasePadWithCapture } from '../components/performance/padActions';

interface MIDIState {
  devices: MIDIDevice[];
  activeDeviceId: string | null;
  channelFilter: number | null; // 0-15 or null (all)
  ccMappings: CCMapping[];
  ccValues: Record<number, number>; // cc number → normalized value (0-1)
  learnTarget: LearnTarget | null;
  isSupported: boolean;

  // Actions
  setDevices: (devices: MIDIDevice[]) => void;
  setActiveDevice: (id: string | null) => void;
  setChannelFilter: (channel: number | null) => void;
  addCCMapping: (mapping: CCMapping) => void;
  removeCCMapping: (index: number) => void;
  clearCCMappings: () => void;
  setLearnTarget: (target: LearnTarget | null) => void;
  setIsSupported: (supported: boolean) => void;
  handleMIDIMessage: (data: Uint8Array, frameIndex: number) => void;
  resetMIDI: () => void;
  getMIDIPersistData: () => MIDIPersistData;
  loadMIDIMappings: (data: MIDIPersistData) => void;
}

export const useMIDIStore = create<MIDIState>((set, get) => ({
  devices: [],
  activeDeviceId: null,
  channelFilter: null,
  ccMappings: [],
  ccValues: {},
  learnTarget: null,
  isSupported: false,

  setDevices: (devices) => set({ devices }),
  setActiveDevice: (id) => set({ activeDeviceId: id }),
  setChannelFilter: (channel) => set({ channelFilter: channel }),

  addCCMapping: (mapping) => {
    const { ccMappings } = get();
    // Remove existing mapping for same CC (one CC → one param)
    const filtered = ccMappings.filter((m) => m.cc !== mapping.cc);
    set({ ccMappings: [...filtered, mapping] });
  },

  removeCCMapping: (index) => {
    const { ccMappings } = get();
    if (index < 0 || index >= ccMappings.length) return;
    set({ ccMappings: ccMappings.filter((_, i) => i !== index) });
  },

  clearCCMappings: () => set({ ccMappings: [], ccValues: {} }),

  setLearnTarget: (target) => set({ learnTarget: target }),
  setIsSupported: (supported) => set({ isSupported: supported }),

  handleMIDIMessage: (data, frameIndex) => {
    if (data.length < 2) return;

    const statusByte = data[0] & 0xf0;
    const channel = data[0] & 0x0f;

    // Only handle note-on, note-off, CC — ignore SysEx, timing, active sensing, etc.
    if (statusByte !== 0x80 && statusByte !== 0x90 && statusByte !== 0xb0) return;

    // Channel filter
    const { channelFilter, learnTarget } = get();
    if (channelFilter !== null && channel !== channelFilter) return;

    const byte1 = data[1]; // note or CC number
    const byte2 = data.length > 2 ? data[2] : 0; // velocity or CC value

    // Learn mode: consume message for learning
    if (learnTarget) {
      if (learnTarget.type === 'pad') {
        if (statusByte === 0x90 && byte2 > 0) {
          // Note-on → assign midiNote to pad (with steal)
          const perfStore = usePerformanceStore.getState();
          const pads = perfStore.drumRack.pads;

          // Steal: clear midiNote from any pad that has this note
          for (const pad of pads) {
            if (pad.midiNote === byte1 && pad.id !== learnTarget.padId) {
              perfStore.updatePad(pad.id, { midiNote: null });
            }
          }

          perfStore.updatePad(learnTarget.padId, { midiNote: byte1 });
          set({ learnTarget: null });
        }
      } else if (learnTarget.type === 'cc') {
        if (statusByte === 0xb0) {
          // CC → create mapping
          get().addCCMapping({
            cc: byte1,
            effectId: learnTarget.effectId,
            paramKey: learnTarget.paramKey,
          });
          set({ learnTarget: null });
        }
      }
      return; // Learn consumed the message
    }

    // Normal message routing
    const perfStore = usePerformanceStore.getState();

    if (statusByte === 0x90 && byte2 > 0) {
      // Note-on: find pad by midiNote
      const pad = perfStore.drumRack.pads.find((p) => p.midiNote === byte1);
      if (!pad) return;
      handlePadTrigger(pad, perfStore, frameIndex, 'midi');
    } else if (statusByte === 0x80 || (statusByte === 0x90 && byte2 === 0)) {
      // Note-off: release pad for gate/one-shot
      const pad = perfStore.drumRack.pads.find((p) => p.midiNote === byte1);
      if (!pad) return;
      if (pad.mode === 'gate' || pad.mode === 'one-shot') {
        releasePadWithCapture(pad, perfStore, frameIndex, 'midi');
      }
    } else if (statusByte === 0xb0) {
      // CC: update ccValues
      const normalized = byte2 / 127;
      set((s) => ({
        ccValues: { ...s.ccValues, [byte1]: normalized },
      }));
    }
  },

  resetMIDI: () => {
    set({
      ccMappings: [],
      ccValues: {},
      learnTarget: null,
      channelFilter: null,
    });
  },

  getMIDIPersistData: (): MIDIPersistData => {
    const { ccMappings, channelFilter } = get();
    const perfStore = usePerformanceStore.getState();

    const padMidiNotes: Record<string, number | null> = {};
    for (const pad of perfStore.drumRack.pads) {
      if (pad.midiNote !== null) {
        padMidiNotes[pad.id] = pad.midiNote;
      }
    }

    return {
      padMidiNotes,
      ccMappings,
      channelFilter,
    };
  },

  loadMIDIMappings: (data: MIDIPersistData) => {
    const perfStore = usePerformanceStore.getState();

    // Restore pad midiNotes (bypass undo — this is a load operation, not a user edit)
    if (data.padMidiNotes && typeof data.padMidiNotes === 'object') {
      const { drumRack } = perfStore;
      const pads = [...drumRack.pads];
      let changed = false;

      for (const [padId, midiNote] of Object.entries(data.padMidiNotes)) {
        if (typeof padId !== 'string') continue;
        // Validate midiNote: must be integer 0-127 or null
        if (midiNote !== null && (typeof midiNote !== 'number' || !Number.isInteger(midiNote) || midiNote < 0 || midiNote > 127)) continue;

        const idx = pads.findIndex((p) => p.id === padId);
        if (idx === -1) continue;
        pads[idx] = { ...pads[idx], midiNote: midiNote ?? null };
        changed = true;
      }

      if (changed) {
        usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });
      }
    }

    // Validate ccMappings: each must have integer cc 0-127, string effectId, string paramKey
    const validMappings = Array.isArray(data.ccMappings)
      ? data.ccMappings.filter((m): m is CCMapping =>
          typeof m === 'object' && m !== null &&
          typeof m.cc === 'number' && Number.isInteger(m.cc) && m.cc >= 0 && m.cc <= 127 &&
          typeof m.effectId === 'string' &&
          typeof m.paramKey === 'string'
        ).slice(0, 128) // max 128 CC numbers
      : [];

    // Validate channelFilter: must be integer 0-15 or null
    const validChannel = (typeof data.channelFilter === 'number' && Number.isInteger(data.channelFilter) && data.channelFilter >= 0 && data.channelFilter <= 15)
      ? data.channelFilter
      : null;

    set({
      ccMappings: validMappings,
      channelFilter: validChannel,
      ccValues: {},
    });
  },
}));
