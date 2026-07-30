/**
 * preload-surface-snapshot.test.ts — frontend-framework F0.4 security gate
 *
 * The preload bridges are the app's entire renderer→OS capability surface:
 * everything exposed via contextBridge (including readFile / writeFile /
 * deleteFile / mkdirp) is callable by ANY code that runs in the renderer.
 * Before this test, adding a capability was ungated — a one-line preload
 * edit silently widened the security surface (red-team miss #4).
 *
 * This test statically parses both preload sources and compares the exposed
 * key sets against the committed snapshots below. Adding or removing a
 * capability fails HERE, in the CI vitest sweep — update the snapshot in the
 * same PR, deliberately, with the addition called out in the PR body.
 *
 * Parsing, not importing: preload files require the electron runtime;
 * top-level keys of the exposeInMainWorld object literal are indent-2
 * `key:` lines (nested callback params are deeper-indented) — stable in
 * this codebase's prettier-formatted style.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const PRELOAD_DIR = path.resolve(__dirname, '../preload')

function exposedKeys(file: string): string[] {
  const src = fs.readFileSync(path.join(PRELOAD_DIR, file), 'utf8')
  expect(src, `${file} must expose exactly one bridge`).toMatch(/exposeInMainWorld\(/)
  const keys = src
    .split('\n')
    .map((line) => /^  (\w+):/.exec(line)?.[1])
    .filter((k): k is string => Boolean(k))
  return [...keys].sort()
}

// --- Committed capability snapshots (sorted) ---
// window.entropic — the main renderer bridge (39 capabilities @ 2026-07-30)
const ENTROPIC_SURFACE = [
  'checkTelemetryConsent',
  'clearCrashReports',
  'closePopOut',
  'confirmClose',
  'deleteFile',
  'downloadUpdate',
  'fileExists',
  'findAutosave',
  'generateSupportBundle',
  'getAppPath',
  'getDemoPaths',
  'getPathForFile',
  'getSystemInfo',
  'installUpdate',
  'isPopOutOpen',
  'isTestMode',
  'listFiles',
  'mkdirp',
  'onCloseRequested',
  'onEngineStatus',
  'onExportProgress',
  'onMenuAction',
  'onUpdateAvailable',
  'onUpdateDownloaded',
  'openPopOut',
  'readCrashReports',
  'readFile',
  'readPreferences',
  'readRecentProjects',
  'selectFile',
  'selectSavePath',
  'sendCommand',
  'sendFrameToPopOut',
  'setTelemetryConsent',
  'showOpenDialog',
  'showSaveDialog',
  'submitFeedback',
  'writeFile',
  'writePreferences',
  'writeRecentProjects',
]

// window.entropicPopOut — the pop-out window's (deliberately tiny) bridge
const POP_OUT_SURFACE = ['getLastPingAt', 'onClose', 'onFrameUpdate', 'onPing']

describe('preload capability surface', () => {
  it('window.entropic exposes exactly the committed capability set', () => {
    expect(
      exposedKeys('index.ts'),
      'The main preload surface changed. If deliberate: update ENTROPIC_SURFACE ' +
        'in this test IN THE SAME PR and name the new capability in the PR body ' +
        '(it is renderer-reachable OS access). If not deliberate: revert.',
    ).toEqual(ENTROPIC_SURFACE)
  })

  it('window.entropicPopOut exposes exactly the committed capability set', () => {
    expect(
      exposedKeys('pop-out.ts'),
      'The pop-out preload surface changed. Same rule: deliberate updates only, ' +
        'snapshot + PR body in the same PR. The pop-out bridge is read-only by ' +
        'design — think hard before adding anything with side effects.',
    ).toEqual(POP_OUT_SURFACE)
  })

  it('no third preload file appears unannounced', () => {
    const files = fs.readdirSync(PRELOAD_DIR).filter((f) => f.endsWith('.ts'))
    expect(
      files.sort(),
      'A new preload file = a whole new renderer bridge. Add it to this test ' +
        'with its own capability snapshot in the same PR.',
    ).toEqual(['index.ts', 'pop-out.ts'])
  })
})
