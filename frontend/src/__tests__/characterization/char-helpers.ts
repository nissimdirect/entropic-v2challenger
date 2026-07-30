/**
 * UC5 — shared fixtures for the App.tsx behavioral characterization suites.
 *
 * These suites are the F4 decomposition gate: they pin App.tsx's CURRENT
 * observable behavior (render-frame loop, menu-action dispatch, close gate,
 * pop-out relay) so the planned App.tsx decomposition can be verified against
 * behavior screenshots cannot see. They are CHARACTERIZATION tests — they
 * assert what the code DOES today, not what it should do. Oddities found
 * while writing them are pinned as-is and listed in the PR body.
 *
 * Mock boundary: window.entropic (the 40-ish-method preload bridge), via the
 * repo-standard createMockEntropic/setupMockEntropic pattern. No Electron.
 */
import { vi } from 'vitest'
import type { EntropicBridge } from '../helpers/mock-entropic'

export const VIDEO_ASSET_ID = 'asset-vid-1'
export const VIDEO_CLIP_ID = 'clip-vid-1'
export const VIDEO_ASSET_PATH = '/test/char-video.mp4'
export const PROJECT_PATH = '/test/char-project.glitch'

/** Frame geometry the fake sidecar reports for the fixture video. */
export const FIXTURE = {
  frameCount: 90,
  width: 640,
  height: 360,
  fps: 30,
  durationS: 3,
} as const

/**
 * A minimal VALID v3 project containing one video track with one clip whose
 * asset resolves — the smallest project that makes App.tsx's
 * initPreviewFromHydratedProject() set activeAssetPath and start rendering.
 */
export function makeVideoProject(): Record<string, unknown> {
  return {
    version: '3.0.0',
    id: 'char-project-id',
    created: 1700000000000,
    modified: 1700000000000,
    author: '',
    settings: {
      resolution: [1920, 1080],
      frameRate: 30,
      audioSampleRate: 44100,
      masterVolume: 1.0,
      seed: 42,
    },
    assets: {
      [VIDEO_ASSET_ID]: {
        id: VIDEO_ASSET_ID,
        path: VIDEO_ASSET_PATH,
        type: 'video',
        meta: {
          width: FIXTURE.width,
          height: FIXTURE.height,
          duration: FIXTURE.durationS,
          fps: FIXTURE.fps,
          codec: 'h264',
          hasAudio: false,
        },
      },
    },
    timeline: {
      duration: FIXTURE.durationS,
      tracks: [
        {
          id: 'track-vid-1',
          name: 'V1',
          type: 'video',
          color: '#4ade80',
          clips: [
            {
              id: VIDEO_CLIP_ID,
              assetId: VIDEO_ASSET_ID,
              trackId: 'track-vid-1',
              position: 0,
              duration: FIXTURE.durationS,
              inPoint: 0,
              outPoint: FIXTURE.durationS,
              speed: 1,
            },
          ],
        },
      ],
      markers: [],
      loopRegion: null,
    },
  }
}

export interface DeferredRender {
  cmd: Record<string, unknown>
  resolve: (res: Record<string, unknown>) => void
}

export interface SendCommandRouter {
  sendCommand: EntropicBridge['sendCommand']
  /** Every render_frame / render_composite command payload, in dispatch order. */
  renderCommands: Record<string, unknown>[]
  /** When true, render commands return unresolved promises captured in `deferred`. */
  setDeferRenders: (defer: boolean) => void
  deferred: DeferredRender[]
  /** Resolve the oldest deferred render with a successful frame payload. */
  resolveOldestDeferred: () => void
}

/** Successful frame response whose frame_data encodes the requested index, so
 *  assertions can tell WHICH frame's pixels reached the preview data path. */
export function frameOkResponse(cmd: Record<string, unknown>): Record<string, unknown> {
  const idx = typeof cmd.frame_index === 'number' ? cmd.frame_index : 'composite'
  return {
    ok: true,
    frame_data: `FRAME_${idx}`,
    width: FIXTURE.width,
    height: FIXTURE.height,
  }
}

/**
 * sendCommand router faking the sidecar: ingest / render_frame /
 * render_composite / list_effects / thumbnails answered; everything else ok.
 */
export function makeSendCommandRouter(): SendCommandRouter {
  const renderCommands: Record<string, unknown>[] = []
  const deferred: DeferredRender[] = []
  let deferRenders = false

  const sendCommand = vi.fn(async (command: Record<string, unknown>): Promise<Record<string, unknown>> => {
    switch (command.cmd) {
      case 'ingest':
        return {
          ok: true,
          frame_count: FIXTURE.frameCount,
          width: FIXTURE.width,
          height: FIXTURE.height,
          fps: FIXTURE.fps,
          duration_s: FIXTURE.durationS,
          has_audio: false,
          codec: 'h264',
        }
      case 'render_frame':
      case 'render_composite': {
        renderCommands.push(command)
        if (deferRenders) {
          return new Promise<Record<string, unknown>>((resolve) => {
            deferred.push({ cmd: command, resolve })
          })
        }
        return frameOkResponse(command)
      }
      case 'list_effects':
        return { ok: true, effects: [] }
      case 'thumbnails':
        return { ok: true, thumbnails: [] }
      default:
        return { ok: true }
    }
  })

  return {
    sendCommand,
    renderCommands,
    deferred,
    setDeferRenders: (defer: boolean) => {
      deferRenders = defer
    },
    resolveOldestDeferred: () => {
      const d = deferred.shift()
      if (!d) throw new Error('no deferred render to resolve')
      d.resolve(frameOkResponse(d.cmd))
    },
  }
}

/** Extract the frame_index sequence of dispatched render_frame commands. */
export function renderFrameIndices(renderCommands: Record<string, unknown>[]): number[] {
  return renderCommands
    .filter((c) => c.cmd === 'render_frame')
    .map((c) => c.frame_index as number)
}
