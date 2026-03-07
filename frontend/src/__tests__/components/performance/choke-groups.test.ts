import { describe, it, expect, beforeEach } from 'vitest';
import { usePerformanceStore } from '../../../renderer/stores/performance';
import { useUndoStore } from '../../../renderer/stores/undo';

function resetStores() {
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
}

function setChokeGroups(groups: Record<string, number | null>) {
  const { drumRack } = usePerformanceStore.getState();
  const pads = drumRack.pads.map((p) => ({
    ...p,
    chokeGroup: groups[p.id] ?? p.chokeGroup,
  }));
  usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });
}

describe('Choke Groups', () => {
  beforeEach(resetStores);

  it('activating pad A (group 1) idles pad B (group 1)', () => {
    setChokeGroups({ 'pad-0': 1, 'pad-1': 1 });

    usePerformanceStore.getState().triggerPad('pad-0', 0);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');

    usePerformanceStore.getState().triggerPad('pad-1', 1);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');
  });

  it('pad C (group 2) unaffected by group 1 choke', () => {
    setChokeGroups({ 'pad-0': 1, 'pad-1': 1, 'pad-2': 2 });

    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-2', 0);

    // Choke within group 1
    usePerformanceStore.getState().triggerPad('pad-1', 1);

    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');
    expect(usePerformanceStore.getState().padStates['pad-2'].phase).toBe('attack'); // unaffected
  });

  it('choke during release phase → immediate idle', () => {
    setChokeGroups({ 'pad-0': 1, 'pad-1': 1 });

    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().releasePad('pad-0', 5);

    // pad-0 should be in release phase
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('release');

    // Trigger pad-1 in same group → chokes pad-0
    usePerformanceStore.getState().triggerPad('pad-1', 6);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-0'].currentValue).toBe(0);
  });

  it('null choke group → no interaction', () => {
    // Default pads have null choke group
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    // Both should remain active
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');
  });

  it('toggle mode + choke: toggle A on → chokes B; toggle A off → B stays off', () => {
    const { drumRack } = usePerformanceStore.getState();
    const pads = drumRack.pads.map((p) => {
      if (p.id === 'pad-0') return { ...p, mode: 'toggle' as const, chokeGroup: 1 };
      if (p.id === 'pad-1') return { ...p, mode: 'toggle' as const, chokeGroup: 1 };
      return p;
    });
    usePerformanceStore.setState({ drumRack: { ...drumRack, pads } });

    // Toggle B on
    usePerformanceStore.getState().triggerPad('pad-1', 0);
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');

    // Toggle A on → chokes B
    usePerformanceStore.getState().triggerPad('pad-0', 1);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('attack');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('idle');

    // Toggle A off (release)
    usePerformanceStore.getState().releasePad('pad-0', 2);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('release');
    // B should still be off
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('idle');
  });

  it('H1: same-frame double-choke: both in same group, last one wins', () => {
    setChokeGroups({ 'pad-0': 1, 'pad-1': 1, 'pad-2': 1 });

    // Trigger all three at same frame
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);
    usePerformanceStore.getState().triggerPad('pad-2', 0);

    // Only last triggered should survive
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-2'].phase).toBe('attack');
  });

  it('choke only affects pads with matching non-null group', () => {
    setChokeGroups({ 'pad-0': 1, 'pad-1': null, 'pad-2': 1 });

    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    // Trigger pad-2 (group 1) — should choke pad-0 but not pad-1
    usePerformanceStore.getState().triggerPad('pad-2', 1);

    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');
    expect(usePerformanceStore.getState().padStates['pad-2'].phase).toBe('attack');
  });

  it('forceOffPad is instant (no release ramp)', () => {
    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().forceOffPad('pad-0');

    const state = usePerformanceStore.getState().padStates['pad-0'];
    expect(state.phase).toBe('idle');
    expect(state.currentValue).toBe(0);
  });

  it('choke across multiple groups: only same group affected', () => {
    setChokeGroups({ 'pad-0': 1, 'pad-1': 2, 'pad-2': 1, 'pad-3': 2 });

    usePerformanceStore.getState().triggerPad('pad-0', 0);
    usePerformanceStore.getState().triggerPad('pad-1', 0);

    // Trigger pad-2 (group 1) — chokes pad-0 only
    usePerformanceStore.getState().triggerPad('pad-2', 1);
    expect(usePerformanceStore.getState().padStates['pad-0'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('attack');

    // Trigger pad-3 (group 2) — chokes pad-1 only
    usePerformanceStore.getState().triggerPad('pad-3', 2);
    expect(usePerformanceStore.getState().padStates['pad-1'].phase).toBe('idle');
    expect(usePerformanceStore.getState().padStates['pad-2'].phase).toBe('attack');
    expect(usePerformanceStore.getState().padStates['pad-3'].phase).toBe('attack');
  });
});
