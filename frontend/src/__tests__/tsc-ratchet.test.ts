/**
 * tsc-ratchet — TypeScript error-count ratchet (vitest live-tree gate).
 *
 * Origin (2026-08-01 gate review): UnifiedTrackHeader shipped with 6 fresh
 * TS2322 errors because CI runs vitest only — `tsc -b` had no gate, and the
 * repo silently accumulated 124 pre-existing errors. A bare typecheck gate
 * would be red on day one, so this is a RATCHET like hex-ratchet/ui-ratchets:
 * the count may only ever go DOWN.
 *
 * Rules (same contract as the other ratchets):
 * - Ceiling lives in frontend/.tsc-ceiling. Strictly `count > ceiling` fails.
 * - If your PR LOWERS the live count, click the ceiling down in the same PR
 *   (the second test enforces the click-down).
 * - NEVER raise the ceiling. Fix or explicitly `// @ts-expect-error` with a
 *   reason instead.
 * Kill criterion: ceiling reaches 0 → replace this file with a plain
 * `tsc -b` exit-code assertion.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const FRONTEND = path.resolve(__dirname, '../..')

function tscErrorCount(): number {
  let out = ''
  try {
    out = execFileSync('npx', ['tsc', '-b', '--pretty', 'false'], {
      cwd: FRONTEND,
      encoding: 'utf8',
      timeout: 180_000,
      // tsc exits non-zero when errors exist — capture stdout either way
    })
  } catch (e: unknown) {
    const err = e as { stdout?: string }
    out = err.stdout ?? ''
  }
  return out.split('\n').filter((l) => /error TS\d+:/.test(l)).length
}

describe('tsc-ratchet — TypeScript error count only goes down', () => {
  const ceiling = Number(
    fs.readFileSync(path.join(FRONTEND, '.tsc-ceiling'), 'utf8').trim(),
  )
  const live = tscErrorCount()

  it(`live tsc error count (${live}) does not exceed the ceiling (${ceiling})`, () => {
    expect(
      live,
      `tsc -b reports ${live} errors, ceiling is ${ceiling}. ` +
        'New TypeScript errors are not allowed — fix them (run `npx tsc -b` ' +
        'locally for the list). NEVER raise frontend/.tsc-ceiling.',
    ).toBeLessThanOrEqual(ceiling)
  })

  it('the ceiling is clicked down when the live count improves', () => {
    // Allow a small slack band so unrelated PRs aren't forced to chase
    // incidental improvements; a real cleanup PR must claim its win.
    const SLACK = 5
    expect(
      ceiling - live,
      `Live count (${live}) is more than ${SLACK} below the ceiling ` +
        `(${ceiling}) — click frontend/.tsc-ceiling down to ${live} in this PR.`,
    ).toBeLessThanOrEqual(SLACK)
  })
}, 200_000)
