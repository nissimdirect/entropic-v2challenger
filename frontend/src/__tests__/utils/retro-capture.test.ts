import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pushEvent,
  getBuffer,
  clearBuffer,
  getBufferLength,
  captureToAutomation,
  type CapturedEvent,
} from '../../renderer/utils/retro-capture';

// P5a.1: CapturedEvent no longer has modRoutes. eventIndex is auto-assigned.
function makeEvent(overrides: Partial<Omit<CapturedEvent, 'eventIndex'>> = {}): Omit<CapturedEvent, 'eventIndex'> {
  return {
    timestamp: performance.now(),
    frameIndex: 0,
    padId: 'pad-1',
    eventType: 'trigger',
    source: 'keyboard',
    ...overrides,
  };
}

function makeMapping(effectId: string, paramKey: string, _depth = 0.8) {
  return {
    sourceId: 'pad-1',
    depth: _depth,
    min: 0,
    max: 1,
    curve: 'linear' as const,
    effectId,
    paramKey,
  };
}

describe('retro-capture buffer', () => {
  beforeEach(() => {
    clearBuffer();
    vi.restoreAllMocks();
  });

  it('pushEvent adds event to buffer', () => {
    pushEvent(makeEvent());
    expect(getBufferLength()).toBe(1);
  });

  it('pushEvent auto-assigns monotonically increasing eventIndex', () => {
    pushEvent(makeEvent({ frameIndex: 0 }));
    pushEvent(makeEvent({ frameIndex: 1 }));
    pushEvent(makeEvent({ frameIndex: 2 }));
    const buf = getBuffer();
    expect(buf[0].eventIndex).toBe(0);
    expect(buf[1].eventIndex).toBe(1);
    expect(buf[2].eventIndex).toBe(2);
  });

  it('eventIndex resets to 0 after clearBuffer', () => {
    pushEvent(makeEvent());
    pushEvent(makeEvent());
    clearBuffer();
    pushEvent(makeEvent());
    const buf = getBuffer();
    expect(buf[0].eventIndex).toBe(0);
  });

  it('getBuffer returns copy (not reference)', () => {
    pushEvent(makeEvent());
    const buf1 = getBuffer();
    const buf2 = getBuffer();
    expect(buf1).toEqual(buf2);
    expect(buf1).not.toBe(buf2);
    buf1.push({ ...makeEvent(), eventIndex: 999 });
    expect(getBufferLength()).toBe(1); // internal buffer unchanged
  });

  it('clearBuffer empties the buffer', () => {
    pushEvent(makeEvent());
    pushEvent(makeEvent());
    expect(getBufferLength()).toBe(2);
    clearBuffer();
    expect(getBufferLength()).toBe(0);
    expect(getBuffer()).toEqual([]);
  });

  it('time-based prune: events older than 60s are removed on push', () => {
    const now = 100_000;
    const spy = vi.spyOn(performance, 'now');

    // Push an event at t=100000
    spy.mockReturnValue(now);
    pushEvent(makeEvent({ timestamp: now }));
    expect(getBufferLength()).toBe(1);

    // Push another event at t=161000 (61 seconds later)
    // The old event (at 100000) is 61s old → pruned
    spy.mockReturnValue(now + 61_000);
    pushEvent(makeEvent({ timestamp: now + 61_000 }));
    expect(getBufferLength()).toBe(1);
    expect(getBuffer()[0].timestamp).toBe(now + 61_000);
  });

  it('cap-based prune: buffer capped at 10,000', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    // Push 10,001 events
    for (let i = 0; i < 10_001; i++) {
      pushEvent(makeEvent({ timestamp: now, frameIndex: i }));
    }

    expect(getBufferLength()).toBe(10_000);
    // Should keep the last 10,000 events (slice from end)
    const buf = getBuffer();
    expect(buf[0].frameIndex).toBe(1); // first one was pruned
    expect(buf[buf.length - 1].frameIndex).toBe(10_000);
  });

  it('captureToAutomation returns empty for empty buffer', () => {
    const result = captureToAutomation(30, 10);
    expect(result).toEqual({});
  });

  it('captureToAutomation returns empty for fps <= 0', () => {
    pushEvent(makeEvent({ padId: 'pad-1' }));
    const padModRoutes = { 'pad-1': [makeMapping('fx1', 'amount')] };
    expect(captureToAutomation(0, 10, padModRoutes)).toEqual({});
    expect(captureToAutomation(-1, 10, padModRoutes)).toEqual({});
  });

  it('captureToAutomation groups by paramPath using caller-supplied modRoutes', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({
      timestamp: now,
      eventType: 'trigger',
      padId: 'pad-1',
    }));

    const padModRoutes = {
      'pad-1': [makeMapping('fx1', 'amount'), makeMapping('fx2', 'intensity')],
    };
    const result = captureToAutomation(30, 10, padModRoutes);
    expect(Object.keys(result)).toEqual(['fx1.amount', 'fx2.intensity']);
    expect(result['fx1.amount']).toHaveLength(1);
    expect(result['fx2.intensity']).toHaveLength(1);
  });

  it('captureToAutomation: trigger events produce value > 0', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({
      timestamp: now,
      eventType: 'trigger',
      padId: 'pad-1',
    }));

    const padModRoutes = { 'pad-1': [makeMapping('fx1', 'amount', 0.7)] };
    const result = captureToAutomation(30, 10, padModRoutes);
    // Trigger events produce square-wave value 1.0 (Phase 15: trigger lanes)
    expect(result['fx1.amount'][0].value).toBe(1.0);
    expect(result['fx1.amount'][0].value).toBeGreaterThan(0);
  });

  it('captureToAutomation: release events produce value = 0', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({
      timestamp: now,
      eventType: 'release',
      padId: 'pad-1',
    }));

    const padModRoutes = { 'pad-1': [makeMapping('fx1', 'amount', 0.7)] };
    const result = captureToAutomation(30, 10, padModRoutes);
    expect(result['fx1.amount'][0].value).toBe(0);
  });

  it('captureToAutomation sorts points by time', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;

    // Push events in reverse chronological order
    spy.mockReturnValue(now);
    pushEvent(makeEvent({
      timestamp: now - 2000, // 2s ago
      eventType: 'trigger',
      padId: 'pad-1',
    }));
    pushEvent(makeEvent({
      timestamp: now - 1000, // 1s ago
      eventType: 'release',
      padId: 'pad-1',
    }));
    pushEvent(makeEvent({
      timestamp: now, // now
      eventType: 'trigger',
      padId: 'pad-1',
    }));

    const padModRoutes = { 'pad-1': [makeMapping('fx1', 'amount')] };
    const result = captureToAutomation(30, 10, padModRoutes);
    const points = result['fx1.amount'];
    expect(points).toHaveLength(3);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].time).toBeGreaterThanOrEqual(points[i - 1].time);
    }
  });

  it('captureToAutomation maps timestamps to timeline time correctly', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    // Event happened 2 seconds ago
    pushEvent(makeEvent({
      timestamp: now - 2000,
      eventType: 'trigger',
      padId: 'pad-1',
    }));

    // referenceTime = 10 seconds into the timeline
    const padModRoutes = { 'pad-1': [makeMapping('fx1', 'amount')] };
    const result = captureToAutomation(30, 10, padModRoutes);
    const point = result['fx1.amount'][0];

    // Event was 2s ago, so timeline time = 10 - 2 = 8
    expect(point.time).toBeCloseTo(8, 1);
  });

  it('pushEvent after clearBuffer starts fresh', () => {
    pushEvent(makeEvent({ padId: 'old' }));
    pushEvent(makeEvent({ padId: 'old' }));
    expect(getBufferLength()).toBe(2);

    clearBuffer();
    expect(getBufferLength()).toBe(0);

    pushEvent(makeEvent({ padId: 'new' }));
    expect(getBufferLength()).toBe(1);
    expect(getBuffer()[0].padId).toBe('new');
  });

  it('captureToAutomation skips routes without effectId or paramKey', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({
      timestamp: now,
      eventType: 'trigger',
      padId: 'pad-1',
    }));

    const padModRoutes = {
      'pad-1': [
        { sourceId: 'pad-1', depth: 0.5, min: 0, max: 1, curve: 'linear' as const },
        makeMapping('fx1', 'amount'),
      ],
    };
    const result = captureToAutomation(30, 10, padModRoutes);
    // Only the mapping with effectId+paramKey should produce output
    expect(Object.keys(result)).toEqual(['fx1.amount']);
  });

  it('captureToAutomation returns empty if no padModRoutes provided for a pad', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({ timestamp: now, padId: 'pad-x' }));

    // No routes for pad-x in the supplied map → empty result
    const result = captureToAutomation(30, 10, {});
    expect(result).toEqual({});
  });

  it('captureToAutomation with no padModRoutes argument returns empty (backward-compat default)', () => {
    const spy = vi.spyOn(performance, 'now');
    spy.mockReturnValue(100_000);
    pushEvent(makeEvent({ timestamp: 100_000 }));
    // Default empty padModRoutes → no routes → empty
    const result = captureToAutomation(30, 10);
    expect(result).toEqual({});
  });
});
