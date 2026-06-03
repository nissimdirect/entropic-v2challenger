/**
 * Tests for Q7 download progress store (PR #20).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  useQ7DownloadStore,
  bindQ7DownloadProgressIPC,
} from '../../renderer/q7/downloadProgressStore';

describe('Q7 download progress store', () => {
  beforeEach(() => {
    useQ7DownloadStore.getState().reset();
  });

  describe('initial state', () => {
    it('starts with all three backbones idle', () => {
      const state = useQ7DownloadStore.getState();
      expect(state.backbones.dinov2.status).toBe('idle');
      expect(state.backbones.clip.status).toBe('idle');
      expect(state.backbones.clap.status).toBe('idle');
    });

    it('initial bytes are zero', () => {
      const state = useQ7DownloadStore.getState();
      expect(state.totalBytesDownloaded()).toBe(0);
      expect(state.totalBytesEstimated()).toBe(0);
      expect(state.overallPercent()).toBe(0);
    });

    it('initial attempt is 1', () => {
      const state = useQ7DownloadStore.getState();
      expect(state.backbones.dinov2.attempt).toBe(1);
    });
  });

  describe('updateProgress', () => {
    it('updates status', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        status: 'downloading',
      });
      expect(useQ7DownloadStore.getState().backbones.dinov2.status).toBe(
        'downloading',
      );
    });

    it('updates bytes', () => {
      useQ7DownloadStore.getState().updateProgress('clip', {
        bytesDownloaded: 50_000_000,
        bytesTotal: 150_000_000,
      });
      const state = useQ7DownloadStore.getState();
      expect(state.backbones.clip.bytesDownloaded).toBe(50_000_000);
      expect(state.backbones.clip.bytesTotal).toBe(150_000_000);
    });

    it('updates attempt counter', () => {
      useQ7DownloadStore.getState().updateProgress('clap', {
        attempt: 2,
        status: 'downloading',
      });
      expect(useQ7DownloadStore.getState().backbones.clap.attempt).toBe(2);
    });

    it('updates error message on error status', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        status: 'error',
        errorMessage: 'HF unreachable',
      });
      const dinov2 = useQ7DownloadStore.getState().backbones.dinov2;
      expect(dinov2.status).toBe('error');
      expect(dinov2.errorMessage).toBe('HF unreachable');
    });

    it('preserves other backbones', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        status: 'downloading',
      });
      expect(useQ7DownloadStore.getState().backbones.clip.status).toBe('idle');
      expect(useQ7DownloadStore.getState().backbones.clap.status).toBe('idle');
    });
  });

  describe('isAnyActive', () => {
    it('returns false when all idle', () => {
      expect(useQ7DownloadStore.getState().isAnyActive()).toBe(false);
    });

    it('returns true when one is downloading', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        status: 'downloading',
      });
      expect(useQ7DownloadStore.getState().isAnyActive()).toBe(true);
    });

    it('returns true when one is verifying', () => {
      useQ7DownloadStore.getState().updateProgress('clip', {
        status: 'verifying',
      });
      expect(useQ7DownloadStore.getState().isAnyActive()).toBe(true);
    });

    it('returns false when all are complete', () => {
      ['dinov2', 'clip', 'clap'].forEach((b) => {
        useQ7DownloadStore.getState().updateProgress(b as any, {
          status: 'complete',
        });
      });
      expect(useQ7DownloadStore.getState().isAnyActive()).toBe(false);
    });

    it('returns false when error or cancelled', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        status: 'error',
      });
      useQ7DownloadStore.getState().updateProgress('clip', {
        status: 'cancelled',
      });
      expect(useQ7DownloadStore.getState().isAnyActive()).toBe(false);
    });
  });

  describe('progress aggregates', () => {
    it('totalBytesDownloaded sums across backbones', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        bytesDownloaded: 10_000_000,
      });
      useQ7DownloadStore.getState().updateProgress('clip', {
        bytesDownloaded: 30_000_000,
      });
      expect(useQ7DownloadStore.getState().totalBytesDownloaded()).toBe(
        40_000_000,
      );
    });

    it('totalBytesEstimated sums across backbones', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        bytesTotal: 22_000_000,
      });
      useQ7DownloadStore.getState().updateProgress('clip', {
        bytesTotal: 150_000_000,
      });
      useQ7DownloadStore.getState().updateProgress('clap', {
        bytesTotal: 300_000_000,
      });
      expect(useQ7DownloadStore.getState().totalBytesEstimated()).toBe(
        472_000_000,
      );
    });

    it('overallPercent computes correctly', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        bytesDownloaded: 11_000_000,
        bytesTotal: 22_000_000,
      });
      expect(useQ7DownloadStore.getState().overallPercent()).toBe(50);
    });

    it('overallPercent is 0 when total is 0', () => {
      expect(useQ7DownloadStore.getState().overallPercent()).toBe(0);
    });

    it('overallPercent caps at 100', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        bytesDownloaded: 25_000_000,
        bytesTotal: 22_000_000, // bytesDownloaded > bytesTotal
      });
      expect(useQ7DownloadStore.getState().overallPercent()).toBe(100);
    });
  });

  describe('reset', () => {
    it('reset() without arg resets all backbones', () => {
      ['dinov2', 'clip', 'clap'].forEach((b) => {
        useQ7DownloadStore.getState().updateProgress(b as any, {
          status: 'downloading',
          bytesDownloaded: 1000,
        });
      });
      useQ7DownloadStore.getState().reset();
      expect(useQ7DownloadStore.getState().backbones.dinov2.status).toBe('idle');
      expect(useQ7DownloadStore.getState().backbones.clip.status).toBe('idle');
      expect(useQ7DownloadStore.getState().totalBytesDownloaded()).toBe(0);
    });

    it('reset(name) only resets that backbone', () => {
      useQ7DownloadStore.getState().updateProgress('dinov2', {
        status: 'downloading',
      });
      useQ7DownloadStore.getState().updateProgress('clip', {
        status: 'downloading',
      });
      useQ7DownloadStore.getState().reset('dinov2');
      expect(useQ7DownloadStore.getState().backbones.dinov2.status).toBe('idle');
      expect(useQ7DownloadStore.getState().backbones.clip.status).toBe(
        'downloading',
      );
    });
  });

  describe('bindQ7DownloadProgressIPC', () => {
    it('subscribes via the passed on() callback', () => {
      const mockOn = vi.fn(() => () => {});
      bindQ7DownloadProgressIPC(mockOn);
      expect(mockOn).toHaveBeenCalledWith('q7-download-progress', expect.any(Function));
    });

    it('updates the store when payload arrives', () => {
      let handler: ((payload: any) => void) | null = null;
      const mockOn = vi.fn((_channel: string, h: (payload: any) => void) => {
        handler = h;
        return () => {};
      });
      bindQ7DownloadProgressIPC(mockOn);

      handler!({
        backbone: 'dinov2',
        status: 'downloading',
        bytesDownloaded: 12_345,
        bytesTotal: 22_000_000,
        attempt: 1,
      });

      expect(useQ7DownloadStore.getState().backbones.dinov2.status).toBe(
        'downloading',
      );
      expect(useQ7DownloadStore.getState().backbones.dinov2.bytesDownloaded).toBe(
        12_345,
      );
    });

    it('ignores payloads for unknown backbones', () => {
      let handler: ((payload: any) => void) | null = null;
      const mockOn = vi.fn((_channel: string, h: (payload: any) => void) => {
        handler = h;
        return () => {};
      });
      bindQ7DownloadProgressIPC(mockOn);

      handler!({ backbone: 'not-a-backbone', status: 'downloading' });
      // Nothing should change
      expect(useQ7DownloadStore.getState().backbones.dinov2.status).toBe('idle');
    });

    it('returns the disposer from the subscription', () => {
      const disposer = vi.fn();
      const mockOn = vi.fn(() => disposer);
      const returned = bindQ7DownloadProgressIPC(mockOn);
      expect(returned).toBe(disposer);
    });
  });
});
