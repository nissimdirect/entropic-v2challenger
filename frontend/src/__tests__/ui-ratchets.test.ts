/**
 * ui-ratchets.test.ts — frontend-framework F0 gate #1 verification
 *
 * Tests that frontend/scripts/ui-ratchets.sh enforces the seven debt-counter
 * ceilings (see the script header for the family definitions). Mirrors
 * hex-ratchet.test.ts: fixture tests prove the counting logic, and a final
 * LIVE-TREE test is the actual enforcing gate — it runs in the same vitest
 * sweep CI already executes, so no workflow change is needed.
 *
 * Floor note: css_font_below_floor uses 12px per RATIFIED-FOUNDATIONS D6
 * ("Scale B+1", user-ratified 2026-07-29). 12px passes; 11.5px counts.
 */

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const FRONTEND_DIR = path.resolve(__dirname, '../..')
const SCRIPT = path.join(FRONTEND_DIR, 'scripts/ui-ratchets.sh')

type Ceilings = Partial<{
  css_hex_outside_styles: number
  tsx_hex: number
  tsx_inline_style: number
  css_font_below_floor: number
  tsx_raw_range: number
  tsx_native_select: number
  css_raw_rgba: number
}>

const ZERO: Required<Ceilings> = {
  css_hex_outside_styles: 0,
  tsx_hex: 0,
  tsx_inline_style: 0,
  css_font_below_floor: 0,
  tsx_raw_range: 0,
  tsx_native_select: 0,
  css_raw_rgba: 0,
}

/**
 * Build a fixture renderer tree. Keys are paths relative to the renderer
 * root (e.g. 'components/Foo.tsx', 'styles/global.css').
 */
function createFixture(
  files: Record<string, string>,
  ceilings: Ceilings,
): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-ratchets-test-'))
  const srcDir = path.join(dir, 'renderer')
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(srcDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  fs.mkdirSync(srcDir, { recursive: true })
  const merged = { ...ZERO, ...ceilings }
  const lines = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  fs.writeFileSync(path.join(dir, '.ui-ratchet-ceilings'), lines + '\n')
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true })
  return { dir, cleanup }
}

function runRatchets(dir: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: FRONTEND_DIR,
    encoding: 'utf8',
    env: {
      ...process.env,
      UI_RATCHET_SRC_DIR: path.join(dir, 'renderer'),
      UI_RATCHET_CEILING_FILE: path.join(dir, '.ui-ratchet-ceilings'),
    },
  })
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

describe('ui-ratchets', () => {
  it('passes when every count equals its ceiling', () => {
    const { dir, cleanup } = createFixture(
      {
        'components/Knob.tsx':
          'const c = "#C8F321"\nconst s = <div style={{ top: 0 }} />\n' +
          'const r = <input type="range" />\nconst sel = <select\n  value={v}></select>\n',
        'styles/global.css': '.a { font-size: 11px; }',
      },
      {
        tsx_hex: 1,
        tsx_inline_style: 1,
        tsx_raw_range: 1,
        tsx_native_select: 1,
        css_font_below_floor: 1,
      },
    )
    try {
      const { exitCode, stdout } = runRatchets(dir)
      expect(stdout).toContain('PASS: all ui-ratchet counters within ceilings.')
      expect(exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('fails when a TSX hex exceeds its ceiling, naming the counter', () => {
    const { dir, cleanup } = createFixture(
      { 'components/Bad.tsx': 'const a = "#123456"; const b = "#abcdef";' },
      { tsx_hex: 1 },
    )
    try {
      const { exitCode, stderr } = runRatchets(dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('tsx_hex')
      expect(stderr).toContain('FAIL')
    } finally {
      cleanup()
    }
  })

  it('type floor: 12px is legal, below 12px counts (D6 Scale B+1)', () => {
    const { dir, cleanup } = createFixture(
      {
        'styles/a.css': '.ok { font-size: 12px; } .also { font-size: 14.5px; }',
        'styles/b.css': '.bad { font-size: 11.5px; }',
      },
      { css_font_below_floor: 1 },
    )
    try {
      const { exitCode, stdout } = runRatchets(dir)
      // exactly one violation (11.5px) — 12px and 14.5px are legal, so
      // ceiling 1 passes and ceiling 0 would fail.
      expect(stdout).toContain('css_font_below_floor: 1')
      expect(exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('component-local CSS hex is caught (the glob-escape hole), styles/ is exempt here', () => {
    const { dir, cleanup } = createFixture(
      {
        // styles/ hex is hex-ratchet.sh's jurisdiction — NOT counted by this script
        'styles/global.css': '.a { color: #ffffff; }',
        // component-local css IS counted
        'components/statusbar/memory-status.css': '.m { color: #ff0000; }',
      },
      { css_hex_outside_styles: 0 },
    )
    try {
      const { exitCode, stderr } = runRatchets(dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('css_hex_outside_styles: 1')
    } finally {
      cleanup()
    }
  })

  it('raw rgba( in renderer CSS is counted, styles/tokens.css is exempt', () => {
    const { dir, cleanup } = createFixture(
      {
        // tokens.css is the ONLY legal home for primitive rgba values
        'styles/tokens.css': ':root { --cx-overlay-60: rgba(0, 0, 0, 0.6); }',
        // any other css counts — styles/ and component-local alike
        'styles/global.css': '.a { background: rgba(0, 0, 0, 0.6); }',
        'components/statusbar/memory-status.css':
          '.m { border: 1px solid rgba(255, 255, 255, 0.2); }',
      },
      { css_raw_rgba: 1 },
    )
    try {
      const { exitCode, stderr } = runRatchets(dir)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('css_raw_rgba: 2')
      expect(stderr).toContain('FAIL')
    } finally {
      cleanup()
    }
  })

  it('closing </select> tags are not counted as native selects', () => {
    const { dir, cleanup } = createFixture(
      { 'components/A.tsx': 'const x = <select\n  value={v}>\n</select>' },
      { tsx_native_select: 1 },
    )
    try {
      const { exitCode, stdout } = runRatchets(dir)
      expect(stdout).toContain('tsx_native_select: 1')
      expect(exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  it('live tree: the real renderer is at or under every committed ceiling', () => {
    // THE enforcing test — a PR that adds a raw hex/inline style/range/select
    // or sub-floor font-size anywhere in src/renderer goes red HERE, in the
    // vitest run CI already executes. Rule (c): if you REMOVED violations,
    // click the ratchet down in .ui-ratchet-ceilings in the same PR.
    const res = spawnSync('bash', [SCRIPT], {
      cwd: FRONTEND_DIR,
      encoding: 'utf-8',
    })
    expect(
      res.status,
      `ui-ratchets failed on the live tree:\n${res.stdout}${res.stderr}\n` +
        'A debt counter exceeded its ceiling. Route colors through tokens ' +
        '(raw rgba() belongs in tokens.css as --cx-*-alpha families), ' +
        'use the shared primitives (common/Slider, the Select skin), keep ' +
        'font sizes at or above the 12px floor — or, if you removed ' +
        'violations, lower the matching ceiling in .ui-ratchet-ceilings.',
    ).toBe(0)
  })
})
