import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  pushEvent,
  getBuffer,
  clearBuffer,
  getBufferLength,
  captureToAutomation,
  type CapturedEvent,
} from '../../renderer/utils/retro-capture';

function makeEvent(overrides: Partial<CapturedEvent> = {}): CapturedEvent {
  return {
    timestamp: performance.now(),
    frameIndex: 0,
    padId: 'pad-1',
    eventType: 'trigger',
    source: 'keyboard',
    mappings: [],
    ...overrides,
  };
}

function makeMapping(effectId: string, paramKey: string, depth = 0.8) {
  return {
    sourceId: 'pad-1',
    depth,
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

  it('getBuffer returns copy (not reference)', () => {
    pushEvent(makeEvent());
    const buf1 = getBuffer();
    const buf2 = getBuffer();
    expect(buf1).toEqual(buf2);
    expect(buf1).not.toBe(buf2);
    buf1.push(makeEvent());
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
    pushEvent(makeEvent({ mappings: [makeMapping('fx1', 'amount')] }));
    expect(captureToAutomation(0, 10)).toEqual({});
    expect(captureToAutomation(-1, 10)).toEqual({});
  });

  it('captureToAutomation groups by paramPath', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({
      timestamp: now,
      eventType: 'trigger',
      mappings: [makeMapping('fx1', 'amount'), makeMapping('fx2', 'intensity')],
    }));

    const result = captureToAutomation(30, 10);
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
      mappings: [makeMapping('fx1', 'amount', 0.7)],
    }));

    const result = captureToAutomation(30, 10);
    expect(result['fx1.amount'][0].value).toBe(0.7);
    expect(result['fx1.amount'][0].value).toBeGreaterThan(0);
  });

  it('captureToAutomation: release events produce value = 0', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({
      timestamp: now,
      eventType: 'release',
      mappings: [makeMapping('fx1', 'amount', 0.7)],
    }));

    const result = captureToAutomation(30, 10);
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
      mappings: [makeMapping('fx1', 'amount')],
    }));
    pushEvent(makeEvent({
      timestamp: now - 1000, // 1s ago
      eventType: 'release',
      mappings: [makeMapping('fx1', 'amount')],
    }));
    pushEvent(makeEvent({
      timestamp: now, // now
      eventType: 'trigger',
      mappings: [makeMapping('fx1', 'amount')],
    }));

    const result = captureToAutomation(30, 10);
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
      mappings: [makeMapping('fx1', 'amount')],
    }));

    // referenceTime = 10 seconds into the timeline
    const result = captureToAutomation(30, 10);
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

  it('captureToAutomation skips mappings without effectId or paramKey', () => {
    const spy = vi.spyOn(performance, 'now');
    const now = 100_000;
    spy.mockReturnValue(now);

    pushEvent(makeEvent({
      timestamp: now,
      eventType: 'trigger',
      mappings: [
        { sourceId: 'pad-1', depth: 0.5, min: 0, max: 1, curve: 'linear' as const },
        makeMapping('fx1', 'amount'),
      ],
    }));

    const result = captureToAutomation(30, 10);
    // Only the mapping with effectId+paramKey should produce output
    expect(Object.keys(result)).toEqual(['fx1.amount']);
  });
});
