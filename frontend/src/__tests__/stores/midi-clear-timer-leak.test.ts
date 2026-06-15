/**
 * Regression tests for audit bug #16:
 * clearCCMappings() must cancel pending trailing-edge flush timers so that a
 * deferred setTimeout scheduled mid-CC-burst does NOT resurrect a stale CC
 * value into ccValues after the clear.
 *
 * Hard oracle: after clearCCMappings(), advancing fake timers MUST leave
 * ccValues empty — the pending flush timer must have been cancelled.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMIDIStore } from '../../renderer/stores/midi';
import { usePerformanceStore } from '../../renderer/stores/performance';
import { useUndoStore } from '../../renderer/stores/undo';
import { CC_THROTTLE_INTERVAL_MS } from '../../shared/midi-utils';

function msg(status: number, byte1: number, byte2: number): Uint8Array {
  return new Uint8Array([status, byte1, byte2]);
}

function resetStores() {
  useMIDIStore.getState().resetMIDI();
  usePerformanceStore.getState().resetDrumRack();
  useUndoStore.getState().clear();
  useMIDIStore.setState({
    devices: [],
    activeDeviceId: null,
    isSupported: true,
  });
}

describe('clearCCMappings — timer-leak regression (audit #16)', () => {
  beforeEach(resetStores);

  it('clearCCMappings cancels pending flush timers — no stale CC resurrected after clear', () => {
    vi.useFakeTimers();
    try {
      useMIDIStore.getState().resetMIDI();

      const CC = 42;

      // Step 1: send a leading-edge CC to open the throttle window.
      useMIDIStore.getState().handleMIDIMessage(msg(0xb0, CC, 64), 0);
      expect(useMIDIStore.getState().ccValues[CC]).toBeCloseTo(64 / 127, 4);

      // Step 2: advance time to be WITHIN the throttle window, then send a
      // second CC. This is a 'defer' — it schedules a trailing-edge flush timer.
      vi.advanceTimersByTime(CC_THROTTLE_INTERVAL_MS - 5);
      useMIDIStore.getState().handleMIDIMessage(msg(0xb0, CC, 100), 0);

      // The leading value is still showing; the new value is pending in a timer.
      expect(useMIDIStore.getState().ccValues[CC]).toBeCloseTo(64 / 127, 4);

      // Step 3: call clearCCMappings(). This MUST cancel the pending timer.
      useMIDIStore.getState().clearCCMappings();

      // Immediately after clear — ccValues should be empty.
      expect(Object.keys(useMIDIStore.getState().ccValues)).toHaveLength(0);

      // Step 4: advance past the original flush deadline. The cancelled timer
      // must NOT fire and resurrect the stale CC value.
      vi.advanceTimersByTime(CC_THROTTLE_INTERVAL_MS * 2);

      // ccValues must STILL be empty — the timer was cancelled by clearCCMappings.
      expect(Object.keys(useMIDIStore.getState().ccValues)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clearCCMappings still empties ccMappings + ccValues (existing behaviour intact)', () => {
    vi.useFakeTimers();
    try {
      useMIDIStore.getState().resetMIDI();

      // Add a mapping and record a CC value.
      useMIDIStore.getState().addCCMapping({ cc: 7, effectId: 'fx-delay', paramKey: 'time' });
      useMIDIStore.getState().handleMIDIMessage(msg(0xb0, 7, 64), 0);
      expect(useMIDIStore.getState().ccMappings).toHaveLength(1);
      expect(useMIDIStore.getState().ccValues[7]).toBeCloseTo(64 / 127, 4);

      useMIDIStore.getState().clearCCMappings();

      expect(useMIDIStore.getState().ccMappings).toHaveLength(0);
      expect(Object.keys(useMIDIStore.getState().ccValues)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
