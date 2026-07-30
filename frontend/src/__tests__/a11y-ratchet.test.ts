/**
 * a11y-ratchet.test.ts — frontend-framework F3 gate verification (UC6, OD-4)
 *
 * Tests that frontend/scripts/a11y-ratchet.sh enforces the jsx-a11y warning
 * ceiling (frontend/.a11y-ceiling). Mirrors ui-ratchets.test.ts: fixture
 * tests prove the counting/compare logic against a temp tree, and a final
 * LIVE-TREE test is the actual enforcing gate — it runs in the same vitest
 * sweep CI already executes, so no workflow change is needed.
 *
 * The eslint config (frontend/eslint.config.mjs) carries jsx-a11y recommended
 * rules ONLY, all forced to "warn", scoped to src/renderer/components/**.
 * Governance rules (a)-(d) are documented in the script header.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const FRONTEND_DIR = path.resolve(__dirname, '../..')
const SCRIPT = path.join(FRONTEND_DIR, 'scripts/a11y-ratchet.sh')

// Each fixture run spawns a full eslint process (~2-4s); allow headroom.
const RUN_TIMEOUT_MS = 60_000

/**
 * Build a fixture component tree. Keys are paths relative to the fixture
 * root (e.g. 'Bad.tsx', 'nested/Deep.tsx').
 */
function createFixture(
  files: Record<string, string>,
  ceiling: number,
): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-ratchet-test-'))
  const srcDir = path.join(dir, 'components')
  fs.mkdirSync(srcDir, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(srcDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  fs.writeFileSync(path.join(dir, '.a11y-ceiling'), `${ceiling}\n`)
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true })
  return { dir, cleanup }
}

function runRatchet(dir: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: FRONTEND_DIR,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    env: {
      ...process.env,
      A11Y_RATCHET_SRC_DIR: path.join(dir, 'components'),
      A11Y_RATCHET_CEILING_FILE: path.join(dir, '.a11y-ceiling'),
    },
  })
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('a11y-ratchet', () => {
  it('passes when the warning count equals the ceiling', () => {
    const { dir, cleanup } = createFixture(
      {
        // deterministic count: two bare img tags = exactly 2 alt-text warnings
        'Pics.tsx':
          'export const P = () => (<div><img src="a" /><img src="b" /></div>)\n',
      },
      2,
    )
    try {
      const { exitCode, stdout, stderr } = runRatchet(dir)
      expect(stdout, `stdout:\n${stdout}\nstderr:\n${stderr}`).toContain(
        'a11y-ratchet: 2 warnings (ceiling 2) PASS',
      )
      expect(exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('fails (exit 1) when warnings exceed the ceiling, naming the counts', () => {
    const { dir, cleanup } = createFixture(
      { 'Bad.tsx': 'export const B = () => <img src="x" />\n' },
      0,
    )
    try {
      const { exitCode, stderr } = runRatchet(dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('a11y-ratchet: 1 warnings (ceiling 0) FAIL')
      expect(stderr).toContain('.a11y-ceiling')
    } finally {
      cleanup()
    }
  })

  it('passes a clean tree at ceiling 0 (the end-state hard ban works)', () => {
    const { dir, cleanup } = createFixture(
      {
        'Good.tsx':
          'export const G = () => (<button type="button" aria-label="Play">▶</button>)\n',
      },
      0,
    )
    try {
      const { exitCode, stdout, stderr } = runRatchet(dir)
      expect(stdout, `stdout:\n${stdout}\nstderr:\n${stderr}`).toContain(
        'a11y-ratchet: 0 warnings (ceiling 0) PASS',
      )
      expect(exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('eslint-disable comments cannot cheat the counter (--no-inline-config)', () => {
    const { dir, cleanup } = createFixture(
      {
        'Sneaky.tsx':
          '// eslint-disable-next-line jsx-a11y/alt-text\n' +
          'export const S = () => <img src="x" />\n',
      },
      0,
    )
    try {
      const { exitCode, stderr } = runRatchet(dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('a11y-ratchet: 1 warnings (ceiling 0) FAIL')
    } finally {
      cleanup()
    }
  })

  it('errors (exit 2) when the ceiling file is missing — never silently passes', () => {
    const { dir, cleanup } = createFixture({ 'A.tsx': 'export const A = 1\n' }, 0)
    try {
      fs.rmSync(path.join(dir, '.a11y-ceiling'))
      const { exitCode, stderr } = runRatchet(dir)
      expect(exitCode).toBe(2)
      expect(stderr).toContain('not found')
    } finally {
      cleanup()
    }
  })

  it('live tree: src/renderer/components is at or under the committed ceiling', () => {
    // THE enforcing test — a PR that adds a jsx-a11y warning anywhere in
    // src/renderer/components goes red HERE, in the vitest run CI already
    // executes. Rule (c): if you REMOVED warnings, click the ratchet down
    // in frontend/.a11y-ceiling in the same PR.
    const res = spawnSync('bash', [SCRIPT], {
      cwd: FRONTEND_DIR,
      encoding: 'utf-8',
      timeout: RUN_TIMEOUT_MS,
    })
    expect(
      res.status,
      `a11y-ratchet failed on the live tree:\n${res.stdout}${res.stderr}\n` +
        'The jsx-a11y warning count exceeded the ceiling. Fix the markup ' +
        '(labels, keyboard handlers, alt text, roles) — or, if you removed ' +
        'warnings, lower frontend/.a11y-ceiling in this same PR.',
    ).toBe(0)
  }, RUN_TIMEOUT_MS)
})
