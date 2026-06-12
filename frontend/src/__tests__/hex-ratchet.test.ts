/**
 * hex-ratchet.test.ts — PUX.1 CI gate verification
 *
 * Tests that frontend/scripts/hex-ratchet.sh enforces the hex-ceiling
 * contract: no hardcoded hex colors in styles/ outside tokens.css.
 *
 * Four tests:
 *  1. Passes when styles hex count equals the ceiling.
 *  2. Fails (exit 1) when a stylesheet adds a hardcoded hex above the ceiling.
 *  3. Excludes tokens.css from the count.
 *  4. THE LIVE GATE: the script passes against the REAL styles tree. The
 *     fixture tests above prove the script's logic; this one is the actual
 *     ratchet — without it, two independently-green PRs can squash into a
 *     red union that no CI run ever counts (exactly what #181 + #179 did
 *     on 2026-06-12: 3 stray hexes landed and the smoke job stayed green).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// --- Helpers ---

const FRONTEND_DIR = path.resolve(__dirname, '../..')
const SCRIPT = path.join(FRONTEND_DIR, 'scripts/hex-ratchet.sh')

/**
 * Create a temporary styles directory with controlled fixture files.
 * Returns the tmpdir path and a cleanup function.
 */
function createFixtureDir(
  cssFiles: Record<string, string>,
  ceiling: number,
): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hex-ratchet-test-'))
  const stylesDir = path.join(dir, 'src', 'renderer', 'styles')
  fs.mkdirSync(stylesDir, { recursive: true })

  for (const [name, content] of Object.entries(cssFiles)) {
    fs.writeFileSync(path.join(stylesDir, name), content)
  }

  fs.writeFileSync(path.join(dir, '.hex-ceiling'), String(ceiling) + '\n')

  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true })
  return { dir, cleanup }
}

/**
 * Run the ratchet script against a fixture directory.
 * Passes HEX_RATCHET_STYLES_DIR and HEX_RATCHET_CEILING_FILE env vars
 * so the script operates on the fixture, not the real frontend dir.
 */
function runRatchet(dir: string): { exitCode: number; stdout: string; stderr: string } {
  const stylesDir = path.join(dir, 'src', 'renderer', 'styles')
  const ceilingFile = path.join(dir, '.hex-ceiling')
  const result = spawnSync('bash', [SCRIPT], {
    cwd: FRONTEND_DIR,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: process.env.PATH,
      HEX_RATCHET_STYLES_DIR: stylesDir,
      HEX_RATCHET_CEILING_FILE: ceilingFile,
    },
  })
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

// --- Tests ---

describe('hex-ratchet', () => {
  it('passes when styles hex count equals the ceiling', () => {
    // One file with exactly 2 hexes, ceiling = 2
    const { dir, cleanup } = createFixtureDir(
      {
        'global.css': '.body { background: #121218; color: #E7E7EC; }',
      },
      2,
    )
    try {
      const { exitCode, stdout } = runRatchet(dir)
      expect(stdout).toContain('PASS')
      expect(exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('fails when a stylesheet adds a hardcoded hex above the ceiling', () => {
    // One file with 2 hexes, ceiling = 1 → ratchet should fail
    const { dir, cleanup } = createFixtureDir(
      {
        'toast.css': '.toast { background: #121218; color: #E7E7EC; border: 1px solid #123456; }',
      },
      2, // 3 hexes in file vs ceiling of 2
    )
    try {
      const { exitCode, stdout, stderr } = runRatchet(dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('FAIL')
    } finally {
      cleanup()
    }
  })

  it('excludes tokens.css from the count', () => {
    // tokens.css has many hexes (the primitives), but ceiling only counts non-tokens files
    const { dir, cleanup } = createFixtureDir(
      {
        // tokens.css: 5 hexes — must NOT be counted
        'tokens.css': ':root { --cx-surface-0: #0B0B10; --cx-surface-1: #121218; --cx-acid: #C8F321; --cx-mod: #8F7DFF; --cx-red-text: #E5484D; }',
        // global.css: 0 hexes — already migrated
        'global.css': '.body { background: var(--cx-surface-1); color: var(--cx-text-1); }',
      },
      0, // ceiling = 0: only tokens.css has hexes, so count should be 0
    )
    try {
      const { exitCode, stdout } = runRatchet(dir)
      expect(stdout).toContain('PASS')
      expect(exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('live tree: the real styles/ directory is at or under the committed ceiling', () => {
    // No fixtures — run the script against the actual frontend tree. This is
    // the enforcing test: a PR that adds a hardcoded hex to styles/ goes red
    // HERE, in the same vitest run CI already executes.
    const res = spawnSync('bash', [SCRIPT], {
      cwd: FRONTEND_DIR,
      encoding: 'utf-8',
    })
    expect(
      res.status,
      `hex-ratchet failed on the live tree:\n${res.stdout}${res.stderr}\n` +
        'A hardcoded hex entered src/renderer/styles/. Use a token from ' +
        'tokens.css (DESIGN-SPEC v1.1), or — only for a deliberate new ' +
        'color — add it to tokens.css and keep the ceiling honest.',
    ).toBe(0)
  })
})
