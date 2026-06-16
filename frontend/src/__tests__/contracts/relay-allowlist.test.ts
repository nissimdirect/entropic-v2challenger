/**
 * CONTRACT TEST: relay allowlist cohesion (task #89)
 *
 * Asserts that every literal `cmd: 'X'` or `cmd: "X"` string found in
 * frontend/src/renderer/**  is present in the ALLOWED_COMMANDS Set declared
 * in zmq-relay.ts.
 *
 * Both sides are extracted from source files (no imports, no runtime) so no
 * Electron mocks are needed and the test runs in the plain Node environment.
 *
 * This prevents the class of "silently dead feature" bug where a command is
 * sent from the renderer and has a backend handler but was never added to the
 * allowlist, causing it to be blocked at zmq-relay.ts (registerRelayHandlers).
 *
 * HOW THE SANITY CHECK WORKS
 * The third test verifies the oracle is live by asserting:
 * - Commands that WERE missing before task #89 ARE now in the extracted set.
 * - A sentinel string that is NOT a real command is NOT in the extracted set.
 * Removing e.g. 'list_fonts' from ALLOWED_COMMANDS will fail the second AND
 * third tests, giving two independent signals.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join, extname } from 'path'

const FRONTEND_ROOT = resolve(__dirname, '../../../')
const RENDERER_ROOT = join(FRONTEND_ROOT, 'src', 'renderer')
const ZMQ_RELAY_PATH = join(FRONTEND_ROOT, 'src', 'main', 'zmq-relay.ts')

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
