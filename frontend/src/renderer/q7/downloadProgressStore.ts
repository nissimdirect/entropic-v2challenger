/**
 * Q7 model download progress store (PR #20).
 *
 * Tracks per-backbone download state. Subscribes to ZMQ
 * `q7-download-progress` events from the Q7 worker (PR #9 wires the
 * emitter into the lazy-load path of DINOv2/CLIP/CLAP loaders).
 *
 * Per DEC-Q7-012:
 * - Lazy on-demand per backbone (modal mounts only when at least one
 *   backbone is mid-download)
 * - 3x retry with exponential backoff (1s, 2s, 4s) — the backend owns
 *   retry; the store reflects the current attempt
 * - Cancel triggers an `q7-download-cancel` IPC → backend tears down
 */

import { create } from 'zustand';

export type BackboneName = 'dinov2' | 'clip' | 'clap';
export type DownloadStatus =
  | 'idle'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'cancelled'
  | 'error';

export interface BackboneDownloadState {
  backbone: BackboneName;
  status: DownloadStatus;
  bytesDownloaded: number;
  bytesTotal: number;
  attempt: number; // 1-indexed; matches the backend retry counter
  errorMessage: string | null;
}

export interface Q7DownloadStoreState {
  backbones: Record<BackboneName, BackboneDownloadState>;
  // Convenience selectors
  isAnyActive: () => boolean;
  totalBytesDownloaded: () => number;
  totalBytesEstimated: () => number;
  overallPercent: () => number;

  // Mutations
  updateProgress: (
    backbone: BackboneName,
    update: Partial<BackboneDownloadState>,
  ) => void;
  reset: (backbone?: BackboneName) => void;
}

const INITIAL_STATE_FOR = (
  backbone: BackboneName,
): BackboneDownloadState => ({
  backbone,
  status: 'idle',
  bytesDownloaded: 0,
  bytesTotal: 0,
  attempt: 1,
  errorMessage: null,
});

const INITIAL_BACKBONES: Record<BackboneName, BackboneDownloadState> = {
  dinov2: INITIAL_STATE_FOR('dinov2'),
  clip: INITIAL_STATE_FOR('clip'),
  clap: INITIAL_STATE_FOR('clap'),
};

const ACTIVE_STATUSES = new Set<DownloadStatus>([
  'downloading',
  'verifying',
]);

export const useQ7DownloadStore = create<Q7DownloadStoreState>((set, get) => ({
  backbones: { ...INITIAL_BACKBONES },

  isAnyActive: () => {
    const { backbones } = get();
    return (Object.values(backbones) as BackboneDownloadState[]).some((b) =>
      ACTIVE_STATUSES.has(b.status),
    );
  },

  totalBytesDownloaded: () => {
    const { backbones } = get();
    return (Object.values(backbones) as BackboneDownloadState[]).reduce(
      (sum, b) => sum + b.bytesDownloaded,
      0,
    );
  },

  totalBytesEstimated: () => {
    const { backbones } = get();
    return (Object.values(backbones) as BackboneDownloadState[]).reduce(
      (sum, b) => sum + b.bytesTotal,
      0,
    );
  },

  overallPercent: () => {
    const total = get().totalBytesEstimated();
    if (total <= 0) return 0;
    return Math.min(100, Math.round((get().totalBytesDownloaded() / total) * 100));
  },

  updateProgress: (backbone, update) => {
    set((state) => ({
      backbones: {
        ...state.backbones,
        [backbone]: {
          ...state.backbones[backbone],
          ...update,
        },
      },
    }));
  },

  reset: (backbone) => {
    if (backbone) {
      set((state) => ({
        backbones: {
          ...state.backbones,
          [backbone]: INITIAL_STATE_FOR(backbone),
        },
      }));
    } else {
      set({ backbones: { ...INITIAL_BACKBONES } });
    }
  },
}));

/**
 * Subscribe to ZMQ `q7-download-progress` events.
 *
 * Per the existing renderer IPC pattern (see project-persistence.ts),
 * the relay layer normalizes incoming snake_case fields to camelCase.
 * Call this once on app startup; the disposer is returned for cleanup.
 */
export function bindQ7DownloadProgressIPC(
  on: (channel: string, handler: (payload: any) => void) => () => void,
): () => void {
  return on('q7-download-progress', (payload: any) => {
    const backbone = payload.backbone as BackboneName;
    if (!backbone || !['dinov2', 'clip', 'clap'].includes(backbone)) {
      return;
    }
    useQ7DownloadStore.getState().updateProgress(backbone, {
      status: payload.status,
      bytesDownloaded: payload.bytesDownloaded ?? 0,
      bytesTotal: payload.bytesTotal ?? 0,
      attempt: payload.attempt ?? 1,
      errorMessage: payload.errorMessage ?? null,
    });
  });
}
