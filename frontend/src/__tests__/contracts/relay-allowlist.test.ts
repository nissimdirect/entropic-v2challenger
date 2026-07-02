/**
 * CONTRACT TEST: relay allowlist cohesion (task #89) + bidirectional handler
 * parity (F4, 2026-07-02).
 *
 * Direction 1 (task #89, unchanged): asserts that every literal `cmd: 'X'` or
 * `cmd: "X"` string found in frontend/src/renderer/** is present in the
 * ALLOWED_COMMANDS Set declared in zmq-relay.ts.
 *
 * Direction 2 (F4, new): asserts that every backend ZMQ command handler
 * (every `cmd == "X"` branch in backend/src/zmq_server.py's dispatch chain)
 * is EITHER present in ALLOWED_COMMANDS OR explicitly listed in
 * INTERNAL_ONLY_COMMANDS below. Direction 1 alone is blind to this case: a
 * handler can exist on the backend with zero renderer callers and zero
 * allowlist entry, and Direction 1 has nothing to scan for it (no renderer
 * cmd literal exists to compare against). That is exactly the F4 audit
 * finding — `audio_tracks_clear`, `mask_gc_sidecars`, `render_text_frame`
 * were backend handlers with no allowlist entry, invisible to Direction 1.
 *
 * Both directions are extracted from source text (no imports, no runtime) so
 * no Electron/ZeroMQ mocks are needed and the test runs in the plain Node
 * environment.
 *
 * HOW THE SANITY CHECKS WORK
 * - Direction 1's oracle: commands that WERE missing before task #89 ARE now
 *   in the extracted set; a sentinel string is NOT in the extracted set.
 * - Direction 2's oracle (F4): mask_gc_sidecars (added to ALLOWED_COMMANDS by
 *   this packet) must be present; audio_tracks_clear and render_text_frame
 *   (deleted as dead handlers by this packet) must be absent from the
 *   backend-handler scan entirely.
 *
 * DELIBERATE-BREAK DRY RUN (do not commit — see F4 PR body):
 * Comment out the `elif cmd == "mask_gc_sidecars":` dispatch line removal —
 * i.e. temporarily ADD a brand-new unallowlisted handler, e.g. insert
 * `elif cmd == "__f4_canary__": return {"id": msg_id, "ok": True}` into
 * zmq_server.py's handle_message chain without adding '__f4_canary__' to
 * ALLOWED_COMMANDS. "every backend ZMQ handler is allowlisted or
 * documented-internal" below fails immediately, naming '__f4_canary__' in
 * the error message. This proves the new direction is live.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve, join, extname } from 'path'

const FRONTEND_ROOT = resolve(__dirname, '../../../')
const RENDERER_ROOT = join(FRONTEND_ROOT, 'src', 'renderer')
const ZMQ_RELAY_PATH = join(FRONTEND_ROOT, 'src', 'main', 'zmq-relay.ts')
const ZMQ_SERVER_PATH = join(FRONTEND_ROOT, '..', 'backend', 'src', 'zmq_server.py')

/**
 * Commands with a backend handler that are intentionally NOT reachable from
 * the renderer via the relay allowlist. Every entry here must carry a reason.
 * Adding a command here without a caller-side justification defeats the
 * purpose of this test — prefer allowlisting over silently excluding.
 */
const INTERNAL_ONLY_COMMANDS = new Set([
  // Sent only by the Electron main process on app shutdown (watchdog.ts),
  // never by the renderer. Deliberately excluded from ALLOWED_COMMANDS so a
  // compromised/buggy renderer cannot shut down the engine.
  'shutdown',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively walk a directory and return all file paths. */
function walkDir(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkDir(full))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

/**
 * Extract every string literal following `cmd:` or `cmd :` in all
 * TypeScript/TSX source files under frontend/src/renderer (excluding test files).
 *
 * Returns a map of cmdName → array of "file:lineNumber" references.
 */
function extractRendererCmdLiterals(): Map<string, string[]> {
  const allFiles = walkDir(RENDERER_ROOT).filter(f => {
    const ext = extname(f)
    if (ext !== '.ts' && ext !== '.tsx') return false
    // Skip any test/spec files that may contain cmd: in mock data / assertions
    if (f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')) return false
    return true
  })

  // Matches: cmd: 'foo'  OR  cmd: "foo"  (with optional surrounding spaces)
  const CMD_RE = /\bcmd\s*:\s*['"]([^'"]+)['"]/g
  const found = new Map<string, string[]>()

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')
    const relFile = file.replace(RENDERER_ROOT + '/', 'renderer/')

    lines.forEach((line, idx) => {
      CMD_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = CMD_RE.exec(line)) !== null) {
        const cmd = match[1]
        const ref = `${relFile}:${idx + 1}`
        const existing = found.get(cmd) ?? []
        existing.push(ref)
        found.set(cmd, existing)
      }
    })
  }

  return found
}

/**
 * Extract the string literals inside the ALLOWED_COMMANDS Set declaration in
 * zmq-relay.ts by parsing the source text.  This avoids importing the module
 * (which would pull in Electron/ZeroMQ and require a complex mock setup).
 */
function extractAllowedCommands(): Set<string> {
  const source = readFileSync(ZMQ_RELAY_PATH, 'utf-8')

  // There are two Sets in the file: RENDER_COMMANDS and ALLOWED_COMMANDS.
  // Find the one that follows the `ALLOWED_COMMANDS` identifier specifically.
  const anchorIdx = source.indexOf('ALLOWED_COMMANDS = new Set([')
  if (anchorIdx === -1) throw new Error('Could not find ALLOWED_COMMANDS Set in zmq-relay.ts')
  const setStart = source.indexOf('new Set([', anchorIdx)

  // Walk forward to find the closing `])`
  let depth = 0
  let setEnd = setStart
  for (let i = setStart; i < source.length; i++) {
    if (source[i] === '[') depth++
    if (source[i] === ']') {
      depth--
      if (depth === 0) { setEnd = i; break }
    }
  }

  const block = source.slice(setStart, setEnd + 1)
  const LITERAL_RE = /['"]([^'"]+)['"]/g
  const commands = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = LITERAL_RE.exec(block)) !== null) {
    commands.add(m[1])
  }
  return commands
}

/**
 * Extract every backend ZMQ command name from the `cmd == "X"` / `cmd == 'X'`
 * branches in zmq_server.py's dispatch chain (handle_message's if/elif
 * ladder). Same pattern used by
 * frontend/src/__tests__/contracts/ipc-schema.test.ts's getBackendCommands(),
 * duplicated here (not imported) to keep this test import-free and runnable
 * without a TS module resolution step.
 *
 * Returns a map of cmdName → array of "zmq_server.py:lineNumber" references.
 */
function extractBackendHandlerCommands(): Map<string, string[]> {
  const content = readFileSync(ZMQ_SERVER_PATH, 'utf-8')
  const lines = content.split('\n')
  const CMD_RE = /\bcmd\s*==\s*["'](\w+)["']/

  const found = new Map<string, string[]>()
  lines.forEach((line, idx) => {
    const match = CMD_RE.exec(line)
    if (match) {
      const cmd = match[1]
      const ref = `zmq_server.py:${idx + 1}`
      const existing = found.get(cmd) ?? []
      existing.push(ref)
      found.set(cmd, existing)
    }
  })
  return found
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('relay-allowlist contract (task #89)', () => {
  const rendererCmds = extractRendererCmdLiterals()
  const allowedCmds  = extractAllowedCommands()

  it('renderer scan finds at least the 14 known commands (scan sanity)', () => {
    const knownSent = [
      'list_fonts', 'export_frame', 'audio_meter', 'bake_performance_track',
      'inline_actions_list', 'inline_actions_invoke', 'mask_thumbnail', 'mask_wand_sample',
      'project_clock_play', 'project_clock_pause', 'project_clock_seek',
      'project_clock_set_duration', 'project_clock_state', 'audio_tracks_set',
    ]
    for (const cmd of knownSent) {
      expect(rendererCmds.has(cmd),
        `Scan missed known renderer command '${cmd}' — check RENDERER_ROOT path or regex`
      ).toBe(true)
    }
    expect(rendererCmds.size).toBeGreaterThanOrEqual(14)
  })

  it('every cmd literal sent from the renderer is in ALLOWED_COMMANDS', () => {
    const missing: { cmd: string; sites: string[] }[] = []

    for (const [cmd, sites] of rendererCmds) {
      if (!allowedCmds.has(cmd)) {
        missing.push({ cmd, sites })
      }
    }

    if (missing.length > 0) {
      const report = missing
        .map(({ cmd, sites }) => `  '${cmd}'\n    sent from: ${sites.slice(0, 3).join(', ')}`)
        .join('\n')
      throw new Error(
        `${missing.length} renderer command(s) missing from ALLOWED_COMMANDS in zmq-relay.ts:\n${report}\n\n` +
        `Add the missing commands to ALLOWED_COMMANDS, or add them to the ` +
        `documented-exclusion list in this test if they are intentionally blocked.`
      )
    }
  })

  it('ALLOWED_COMMANDS oracle sanity — task #89 fixes are present; sentinel absent', () => {
    // These 8 commands were the confirmed cohesion bug from task #89
    const task89Fixes = [
      'list_fonts', 'export_frame', 'audio_meter', 'bake_performance_track',
      'inline_actions_list', 'inline_actions_invoke', 'mask_thumbnail', 'mask_wand_sample',
    ]
    for (const cmd of task89Fixes) {
      expect(allowedCmds.has(cmd),
        `'${cmd}' must be in ALLOWED_COMMANDS (task #89 fix). If you removed it, the feature is silently dead again.`
      ).toBe(true)
    }

    // 'shutdown' must remain intentionally excluded (main-process only)
    expect(allowedCmds.has('shutdown'),
      `'shutdown' must NOT be in ALLOWED_COMMANDS — it is main-process only`
    ).toBe(false)

    // Sentinel: proves the negative side of the oracle is live
    expect(allowedCmds.has('__drift_sentinel_9eb4c__')).toBe(false)

    // The set must contain at least the original ~30 commands + the new ones
    expect(allowedCmds.size).toBeGreaterThanOrEqual(40)
  })
})

describe('bidirectional IPC contract (F4)', () => {
  const allowedCmds = extractAllowedCommands()
  const backendCmds = extractBackendHandlerCommands()

  it('every backend ZMQ handler is allowlisted or documented as internal-only', () => {
    const orphans: { cmd: string; sites: string[] }[] = []

    for (const [cmd, sites] of backendCmds) {
      if (!allowedCmds.has(cmd) && !INTERNAL_ONLY_COMMANDS.has(cmd)) {
        orphans.push({ cmd, sites })
      }
    }

    if (orphans.length > 0) {
      const report = orphans
        .map(({ cmd, sites }) => `  '${cmd}'\n    handler at: ${sites.slice(0, 3).join(', ')}`)
        .join('\n')
      throw new Error(
        `${orphans.length} backend ZMQ handler(s) exist with no ALLOWED_COMMANDS entry and no ` +
        `INTERNAL_ONLY_COMMANDS justification (F4 orphaned-handler bug class):\n${report}\n\n` +
        `Either add the command to ALLOWED_COMMANDS in zmq-relay.ts (if the renderer/a shipped ` +
        `feature needs it), or add it to INTERNAL_ONLY_COMMANDS in this test file with a comment ` +
        `explaining why it must stay unreachable from the renderer, or delete the dead handler.`
      )
    }
  })

  it('every ALLOWED_COMMANDS entry has a live backend handler', () => {
    const stale: string[] = []
    for (const cmd of allowedCmds) {
      if (!backendCmds.has(cmd)) {
        stale.push(cmd)
      }
    }
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} ALLOWED_COMMANDS entr${stale.length === 1 ? 'y has' : 'ies have'} no ` +
        `matching backend handler in zmq_server.py: ${stale.join(', ')}\n\n` +
        `Remove the stale entry from ALLOWED_COMMANDS, or the backend handler was renamed/deleted ` +
        `and the allowlist wasn't updated to match.`
      )
    }
  })

  it('F4 oracle sanity — mask_gc_sidecars allowlisted; deleted orphans absent from backend scan', () => {
    // mask_gc_sidecars: MK.6 P3 orphan-sidecar GC (#227) — real backend handler,
    // no renderer caller yet, added to ALLOWED_COMMANDS by F4 (verdict: ADD).
    expect(allowedCmds.has('mask_gc_sidecars'),
      `'mask_gc_sidecars' must be in ALLOWED_COMMANDS (F4 fix — MK.6 orphan-sidecar GC).`
    ).toBe(true)
    expect(backendCmds.has('mask_gc_sidecars'),
      `'mask_gc_sidecars' backend handler must still exist in zmq_server.py.`
    ).toBe(true)

    // audio_tracks_clear / render_text_frame: F4 verdict was DELETE (zero
    // renderer callers, zero shipped-feature dependency — see F4 PR body).
    // They must no longer appear in the backend dispatch scan at all.
    expect(backendCmds.has('audio_tracks_clear'),
      `'audio_tracks_clear' handler should have been deleted by F4 (redundant with audio_tracks_set([])).`
    ).toBe(false)
    expect(backendCmds.has('render_text_frame'),
      `'render_text_frame' standalone handler should have been deleted by F4 (render_composite calls the underlying function directly).`
    ).toBe(false)

    // Sentinel: proves the backend-scan oracle is live
    expect(backendCmds.has('__f4_drift_sentinel_7c2a1__')).toBe(false)
  })
})
