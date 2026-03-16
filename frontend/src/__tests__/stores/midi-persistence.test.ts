import { describe, it, expect, beforeEach } from 'vitest';
import { useMIDIStore } from '../../renderer/stores/midi';
import { usePerformanceStore } from '../../renderer/stores/performance';
import { useProjectStore } from '../../renderer/stores/project';
import { useTimelineStore } from '../../renderer/stores/timeline';
import { useUndoStore } from '../../renderer/stores/undo';
import { useOperatorStore } from '../../renderer/stores/operators';
import { useAutomationStore } from '../../renderer/stores/automation';
import { serializeProject, hydrateStores, newProject } from '../../renderer/project-persistence';
import type { MIDIPersistData, CCMapping } from '../../shared/types';

function resetAllStores() {
  useProjectStore.getState().resetProject();
  useTimelineStore.getState().reset();
  useUndoStore.getState().clear();
  usePerformanceStore.getState().resetDrumRack();
  useOperatorStore.getState().resetOperators();
  useAutomationStore.getState().resetAutomation();
  useMIDIStore.getState().resetMIDI();
}

/** Build a minimal valid project JSON string with optional midiMappings. */
function makeProjectJson(midiMappings?: MIDIPersistData): string {
  const base = JSON.parse(serializeProject());
  if (midiMappings !== undefined) {
    base.midiMappings = midiMappings;
  } else {
    delete base.midiMappings;
  }
  return JSON.stringify(base);
}

const testCCMappings: CCMapping[] = [
  { cc: 1, effectId: 'fx-1', paramKey: 'amount' },
  { cc: 74, effectId: 'fx-2', paramKey: 'cutoff' },
];

describe('MIDI Persistence', () => {
  beforeEach(resetAllStores);

  // ── Test 1: serializeProject includes midiMappings ──────────────────

  it('serializeProject includes midiMappings with padMidiNotes, ccMappings, channelFilter', () => {
    // Set up pads with midiNotes
    usePerformanceStore.getState().updatePad('pad-0', { midiNote: 60 });
    usePerformanceStore.getState().updatePad('pad-3', { midiNote: 64 });

    // Set up CC mappings
    useMIDIStore.getState().addCCMapping(testCCMappings[0]);
    useMIDIStore.getState().addCCMapping(testCCMappings[1]);

    // Set channel filter
    useMIDIStore.getState().setChannelFilter(5);

    const json = serializeProject();
    const project = JSON.parse(json);

    expect(project.midiMappings).toBeDefined();
    expect(project.midiMappings.channelFilter).toBe(5);
    expect(project.midiMappings.ccMappings).toHaveLength(2);
    expect(project.midiMappings.ccMappings[0].cc).toBe(1);
    expect(project.midiMappings.ccMappings[1].cc).toBe(74);
    expect(project.midiMappings.padMidiNotes['pad-0']).toBe(60);
    expect(project.midiMappings.padMidiNotes['pad-3']).toBe(64);
  });

  // ── Test 2: hydrateStores restores MIDI state ───────────────────────

  it('hydrateStores restores ccMappings, channelFilter, and pad midiNotes', () => {
    const midiData: MIDIPersistData = {
      padMidiNotes: { 'pad-0': 48, 'pad-7': 72 },
      ccMappings: [{ cc: 10, effectId: 'fx-a', paramKey: 'pan' }],
      channelFilter: 3,
    };

    const project = JSON.parse(makeProjectJson(midiData));
    hydrateStores(project);

    const midiState = useMIDIStore.getState();
    expect(midiState.ccMappings).toHaveLength(1);
    expect(midiState.ccMappings[0].cc).toBe(10);
    expect(midiState.ccMappings[0].effectId).toBe('fx-a');
    expect(midiState.channelFilter).toBe(3);

    const pads = usePerformanceStore.getState().drumRack.pads;
    const pad0 = pads.find((p) => p.id === 'pad-0');
    const pad7 = pads.find((p) => p.id === 'pad-7');
    expect(pad0?.midiNote).toBe(48);
    expect(pad7?.midiNote).toBe(72);
  });

  // ── Test 3: Backward compatibility — old project without midiMappings

  it('old project without midiMappings → MIDI store defaults, pads have null midiNotes', () => {
    // Pre-configure some MIDI state that should be cleared on load
    useMIDIStore.getState().addCCMapping({ cc: 99, effectId: 'fx-x', paramKey: 'val' });
    useMIDIStore.getState().setChannelFilter(10);

    // Load project with no midiMappings field
    const project = JSON.parse(makeProjectJson()); // undefined → field deleted
    hydrateStores(project);

    const midiState = useMIDIStore.getState();
    expect(midiState.ccMappings).toHaveLength(0);
    expect(midiState.channelFilter).toBeNull();

    const pads = usePerformanceStore.getState().drumRack.pads;
    for (const pad of pads) {
      expect(pad.midiNote).toBeNull();
    }
  });

  // ── Test 4: newProject resets MIDI state ─────────────────────────────

  it('newProject resets MIDI ccMappings, channelFilter, and learnTarget', () => {
    useMIDIStore.getState().addCCMapping({ cc: 7, effectId: 'fx-vol', paramKey: 'volume' });
    useMIDIStore.getState().setChannelFilter(9);
    useMIDIStore.getState().setLearnTarget({ type: 'pad', padId: 'pad-2' });

    newProject();

    const midiState = useMIDIStore.getState();
    expect(midiState.ccMappings).toHaveLength(0);
    expect(midiState.channelFilter).toBeNull();
    expect(midiState.learnTarget).toBeNull();
    expect(midiState.ccValues).toEqual({});
  });

  // ── Test 5: Round-trip serialize → parse → hydrate → serialize ──────

  it('round-trip: serialize → hydrate → serialize produces equivalent midiMappings', () => {
    // Configure MIDI state
    usePerformanceStore.getState().updatePad('pad-1', { midiNote: 55 });
    usePerformanceStore.getState().updatePad('pad-4', { midiNote: 67 });
    useMIDIStore.getState().addCCMapping({ cc: 21, effectId: 'fx-delay', paramKey: 'time' });
    useMIDIStore.getState().setChannelFilter(7);

    // First serialize
    const json1 = serializeProject();
    const project1 = JSON.parse(json1);
    const midi1 = project1.midiMappings;

    // Hydrate from first serialize
    hydrateStores(project1);

    // Second serialize
    const json2 = serializeProject();
    const project2 = JSON.parse(json2);
    const midi2 = project2.midiMappings;

    // Compare midiMappings sections
    expect(midi2.padMidiNotes).toEqual(midi1.padMidiNotes);
    expect(midi2.ccMappings).toEqual(midi1.ccMappings);
    expect(midi2.channelFilter).toBe(midi1.channelFilter);
  });

  // ── Test 6: getMIDIPersistData only includes pads with midiNote ─────

  it('getMIDIPersistData only includes pads that have a non-null midiNote', () => {
    // Default: 16 pads, all midiNote=null
    const defaultData = useMIDIStore.getState().getMIDIPersistData();
    expect(Object.keys(defaultData.padMidiNotes)).toHaveLength(0);

    // Assign midiNotes to exactly 2 pads
    usePerformanceStore.getState().updatePad('pad-2', { midiNote: 36 });
    usePerformanceStore.getState().updatePad('pad-9', { midiNote: 44 });

    const data = useMIDIStore.getState().getMIDIPersistData();
    expect(Object.keys(data.padMidiNotes)).toHaveLength(2);
    expect(data.padMidiNotes['pad-2']).toBe(36);
    expect(data.padMidiNotes['pad-9']).toBe(44);
  });

  // ── Test 7: loadMIDIMappings handles empty/malformed data ───────────

  it('loadMIDIMappings with empty ccMappings array → store has empty ccMappings, no crash', () => {
    const emptyData: MIDIPersistData = {
      padMidiNotes: {},
      ccMappings: [],
      channelFilter: null,
    };

    useMIDIStore.getState().loadMIDIMappings(emptyData);

    const state = useMIDIStore.getState();
    expect(state.ccMappings).toHaveLength(0);
    expect(state.channelFilter).toBeNull();
    expect(state.ccValues).toEqual({});
  });

  it('loadMIDIMappings with undefined padMidiNotes → no crash', () => {
    const data = {
      ccMappings: [{ cc: 5, effectId: 'fx-z', paramKey: 'depth' }],
      channelFilter: 2,
    } as unknown as MIDIPersistData;

    useMIDIStore.getState().loadMIDIMappings(data);

    const state = useMIDIStore.getState();
    expect(state.ccMappings).toHaveLength(1);
    expect(state.channelFilter).toBe(2);
  });

  it('loadMIDIMappings with ccMappings as non-array → defaults to empty array', () => {
    const data = {
      padMidiNotes: {},
      ccMappings: 'not-an-array',
      channelFilter: null,
    } as unknown as MIDIPersistData;

    useMIDIStore.getState().loadMIDIMappings(data);

    const state = useMIDIStore.getState();
    expect(state.ccMappings).toHaveLength(0);
  });
});
