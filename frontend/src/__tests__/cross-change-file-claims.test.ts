/**
 * cross-change-file-claims.test.ts — A4 mechanical guard (W2 preflight)
 *
 * FRONTEND-SDLC.md pipeline step 7½ (A4) requires: "before packets dispatch, grep
 * every OTHER planning lane's proposals for the surfaces/components this change
 * names. Any overlap gets a row in docs/frontend/RECONCILIATIONS.md ... BEFORE
 * either side builds." That rule was prose-only — nothing enforced it. Origin:
 * the Convention-1 rail and Rail v12 both claimed the tool strip from different
 * lanes, undetected until post-build (see RECONCILIATIONS.md R1).
 *
 * This guard parses every UNMERGED `openspec/changes/<name>/` (a change counts as
 * merged only if its `packets.md` has a "## Ledger" table where every row's Status
 * column is ✅ — no packets.md, no Ledger section, or any non-✅ row all count as
 * unmerged), extracts every `frontend/src/**` path each one claims (plan.md's
 * markdown table rows + packets.md's full text), and flags any path claimed by
 * TWO OR MORE unmerged changes that lacks a RECONCILIATIONS.md row mentioning
 * both change names together.
 *
 * FINDING (2026-07-31, W2 preflight): the live sweep below turned up 18
 * already-existing, undocumented collisions across the Lane-2/Lane-4 campaign
 * (mostly App.tsx and a handful of shared stores — expected in a multi-lane repo,
 * but exactly the class of silent overlap A4 exists to catch). Resolving all 18
 * is out of scope for this preflight packet (it touches proposals this session
 * didn't author). Per the Rule Admission Law's ratchet convention (this repo's
 * own hex-ratchet.sh / type-histogram-guard.sh precedent), the live-tree test
 * below is a ratchet: it commits today's count as a ceiling and fails only if
 * NEW undocumented collisions are introduced, rather than gating on a
 * zero-violations state that does not honestly exist yet. See the PR body for
 * the full 18-row list.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// --- Path constants ---

// frontend/src/__tests__/ -> frontend/src -> frontend -> repo root
const REPO_ROOT = path.resolve(__dirname, '../../..')
const CHANGES_DIR = path.join(REPO_ROOT, 'openspec', 'changes')
const RECONCILIATIONS_PATH = path.join(REPO_ROOT, 'docs', 'frontend', 'RECONCILIATIONS.md')

// Pre-existing, undocumented collisions discovered on 2026-07-31 (W2 preflight).
// This is a RATCHET ceiling, not a target — it must not increase; it should only
// ever decrease as RECONCILIATIONS rows land for each pairing. See PR body.
const LIVE_VIOLATION_CEILING = 18

// --- Core parsing (tolerant: never throws, skips what it can't read) ---

/** Extract every `frontend/src/**`-shaped path mentioned in a chunk of text. */
function extractFrontendSrcPaths(text: string): Set<string> {
  const out = new Set<string>()
  if (!text) return out
  const re = /frontend\/src\/[A-Za-z0-9_./-]+/g
  for (const m of text.matchAll(re)) {
    // Strip trailing markdown/punctuation noise the greedy char class can sweep in
    // (closing backticks, parens, brackets, sentence punctuation).
    const cleaned = m[0].replace(/[`)\].,;:'"]+$/, '')
    if (cleaned) out.add(cleaned)
  }
  return out
}

/** Keep only markdown table rows (lines shaped `| ... | ... |`) from a file's text. */
function tableRowsOnly(text: string): string {
  return text
    .split('\n')
    .filter((line) => /^\s*\|.*\|\s*$/.test(line))
    .join('\n')
}

function safeReadFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null // tolerant: unreadable file is treated as "contributes nothing"
  }
}

/**
 * A change is UNMERGED unless its packets.md has a "## Ledger" section whose
 * table rows are ALL ✅. Conservative by design: missing packets.md, missing
 * Ledger section, or an empty/unparseable Ledger table all count as unmerged
 * (a change we can't prove is done is treated as still in flight).
 */
function isUnmerged(changeDir: string): boolean {
  const text = safeReadFile(path.join(changeDir, 'packets.md'))
  if (text === null) return true

  const ledgerIdx = text.indexOf('## Ledger')
  if (ledgerIdx === -1) return true

  const ledgerSection = text.slice(ledgerIdx)
  const rowRe = /^\|\s*([^\s|][^|]*?)\s*\|\s*([^|]+?)\s*\|/gm
  let sawDataRow = false
  let match: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((match = rowRe.exec(ledgerSection)) !== null) {
    const col1 = match[1].trim()
    const col2 = match[2].trim()
    if (col1 === 'Packet' || /^-+$/.test(col1)) continue // header / separator row
    sawDataRow = true
    if (col2 !== '✅') return true
  }
  return !sawDataRow // Ledger heading with no data rows -> can't prove merged
}

/** Collect every frontend/src/** path this change's plan.md + packets.md claim. */
function extractClaims(changeDir: string): Set<string> {
  const claims = new Set<string>()

  const planText = safeReadFile(path.join(changeDir, 'plan.md'))
  if (planText !== null) {
    for (const p of extractFrontendSrcPaths(tableRowsOnly(planText))) claims.add(p)
  }

  const packetsText = safeReadFile(path.join(changeDir, 'packets.md'))
  if (packetsText !== null) {
    for (const p of extractFrontendSrcPaths(packetsText)) claims.add(p)
  }

  return claims
}

/** Does any single RECONCILIATIONS.md row mention every one of `changeNames`? */
function reconciliationCovers(reconciliationsText: string, changeNames: string[]): boolean {
  const rows = reconciliationsText.split('\n').filter((l) => l.trim().startsWith('|'))
  return rows.some((row) => changeNames.every((name) => row.includes(name)))
}

export interface Violation {
  path: string
  changes: string[]
}

/**
 * Sweep `changesDir` for unmerged changes, collect their frontend/src/** claims,
 * and return every path claimed by 2+ unmerged changes without a RECONCILIATIONS
 * row covering all of them. `changeFilter`, if given, restricts the sweep to
 * only the named change directories (used to scope a check to a specific pair).
 */
export function findCrossChangeViolations(
  changesDir: string,
  reconciliationsPath: string,
  changeFilter?: string[],
): Violation[] {
  const reconciliationsText = safeReadFile(reconciliationsPath) ?? ''

  let entries: string[] = []
  try {
    entries = fs
      .readdirSync(changesDir)
      .filter((e) => {
        try {
          return fs.statSync(path.join(changesDir, e)).isDirectory()
        } catch {
          return false
        }
      })
      .filter((e) => !changeFilter || changeFilter.includes(e))
  } catch {
    return []
  }

  const pathToChanges = new Map<string, Set<string>>()

  for (const changeName of entries) {
    const changeDir = path.join(changesDir, changeName)
    let unmerged = true
    try {
      unmerged = isUnmerged(changeDir)
    } catch {
      unmerged = true
    }
    if (!unmerged) continue

    let claims: Set<string>
    try {
      claims = extractClaims(changeDir)
    } catch {
      claims = new Set()
    }
    for (const p of claims) {
      if (!pathToChanges.has(p)) pathToChanges.set(p, new Set())
      pathToChanges.get(p)!.add(changeName)
    }
  }

  const violations: Violation[] = []
  for (const [p, changeSet] of pathToChanges) {
    if (changeSet.size < 2) continue
    const changes = Array.from(changeSet).sort()
    if (!reconciliationCovers(reconciliationsText, changes)) {
      violations.push({ path: p, changes })
    }
  }
  return violations.sort((a, b) => a.path.localeCompare(b.path))
}

// --- Fixture helpers ---

function createFixtureChanges(spec: {
  changes: Record<string, { planTable?: string[]; packetsText?: string; ledgerRows?: string[] }>
  reconciliations?: string
}): { changesDir: string; reconciliationsPath: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-change-guard-test-'))
  const changesDir = path.join(root, 'changes')
  fs.mkdirSync(changesDir, { recursive: true })

  for (const [name, def] of Object.entries(spec.changes)) {
    const dir = path.join(changesDir, name)
    fs.mkdirSync(dir, { recursive: true })

    if (def.planTable) {
      const table = ['| File | Role | Change |', '|---|---|---|', ...def.planTable].join('\n')
      fs.writeFileSync(path.join(dir, 'plan.md'), `# Plan — ${name}\n\n${table}\n`)
    }

    const ledgerRows = def.ledgerRows ?? ['| P1 | ⬜ | — | — |']
    const ledger = ['## Ledger', '', '| Packet | Status | PR | Oracle evidence |', '|---|---|---|---|', ...ledgerRows].join(
      '\n',
    )
    const packetsText = def.packetsText ?? ''
    fs.writeFileSync(path.join(dir, 'packets.md'), `# Packets — ${name}\n\n${packetsText}\n\n${ledger}\n`)
  }

  const reconciliationsPath = path.join(root, 'RECONCILIATIONS.md')
  fs.writeFileSync(reconciliationsPath, spec.reconciliations ?? '# RECONCILIATIONS\n')

  return { changesDir, reconciliationsPath, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

// --- Tests ---

describe('cross-change-file-claims guard', () => {
  it('FAILS (reports a violation) when two unmerged changes claim the same file with no reconciliation row', () => {
    const { changesDir, reconciliationsPath, cleanup } = createFixtureChanges({
      changes: {
        'lane-a': { planTable: ['| `frontend/src/renderer/App.tsx` | shared mount | edits |'] },
        'lane-b': { planTable: ['| `frontend/src/renderer/App.tsx` | shared mount | edits |'] },
      },
    })
    try {
      const violations = findCrossChangeViolations(changesDir, reconciliationsPath)
      expect(violations).toHaveLength(1)
      expect(violations[0].path).toBe('frontend/src/renderer/App.tsx')
      expect(violations[0].changes).toEqual(['lane-a', 'lane-b'])
    } finally {
      cleanup()
    }
  })

  it('PASSES (no violation) once a RECONCILIATIONS row mentions both colliding change names', () => {
    const { changesDir, reconciliationsPath, cleanup } = createFixtureChanges({
      changes: {
        'lane-a': { planTable: ['| `frontend/src/renderer/App.tsx` | shared mount | edits |'] },
        'lane-b': { planTable: ['| `frontend/src/renderer/App.tsx` | shared mount | edits |'] },
      },
      reconciliations:
        '# RECONCILIATIONS\n\n| # | Surfaces | Lanes | Ruling | Status |\n|---|---|---|---|---|\n' +
        '| R1 | App.tsx mount point | lane-a × lane-b | lane-a lands first, lane-b rebases | OPEN |\n',
    })
    try {
      const violations = findCrossChangeViolations(changesDir, reconciliationsPath)
      expect(violations).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('does not flag a merged change (Ledger all-✅) that overlaps an unmerged one', () => {
    const { changesDir, reconciliationsPath, cleanup } = createFixtureChanges({
      changes: {
        'lane-merged': {
          planTable: ['| `frontend/src/renderer/components/layout/ToolRail.tsx` | rail | edits |'],
          ledgerRows: ['| P1 | ✅ | #1 | evidence |', '| P2 | ✅ | #2 | evidence |'],
        },
        'lane-open': {
          planTable: ['| `frontend/src/renderer/components/layout/ToolRail.tsx` | rail | edits |'],
        },
      },
    })
    try {
      const violations = findCrossChangeViolations(changesDir, reconciliationsPath)
      expect(violations).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  it('treats a change with no packets.md, or a Ledger with any non-✅ row, as unmerged', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-change-guard-test-'))
    const changesDir = path.join(root, 'changes')
    fs.mkdirSync(changesDir, { recursive: true })

    // No packets.md at all.
    const noPacketsDir = path.join(changesDir, 'no-packets')
    fs.mkdirSync(noPacketsDir, { recursive: true })
    fs.writeFileSync(path.join(noPacketsDir, 'plan.md'), '| `frontend/src/foo.ts` | x | y |\n')

    // Ledger present but one row not ✅.
    const partialDir = path.join(changesDir, 'partial')
    fs.mkdirSync(partialDir, { recursive: true })
    fs.writeFileSync(path.join(partialDir, 'plan.md'), '| `frontend/src/foo.ts` | x | y |\n')
    fs.writeFileSync(
      partialDir + '/packets.md',
      '## Ledger\n\n| Packet | Status | PR | Oracle evidence |\n|---|---|---|---|\n| P1 | ✅ | #1 | ok |\n| P2 | ⬜ | — | — |\n',
    )

    const reconciliationsPath = path.join(root, 'RECONCILIATIONS.md')
    fs.writeFileSync(reconciliationsPath, '# RECONCILIATIONS\n')

    try {
      const violations = findCrossChangeViolations(changesDir, reconciliationsPath)
      expect(violations).toHaveLength(1)
      expect(violations[0].changes.sort()).toEqual(['no-packets', 'partial'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('is tolerant of unreadable/malformed files and never throws', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-change-guard-test-'))
    const changesDir = path.join(root, 'changes')
    fs.mkdirSync(changesDir, { recursive: true })

    // A "change" that is actually a file, not a directory, at the top level —
    // readdirSync + statSync filtering must skip it, not crash.
    fs.writeFileSync(path.join(changesDir, 'stray-file.md'), 'not a change dir')

    // An empty directory with no plan.md/packets.md at all.
    fs.mkdirSync(path.join(changesDir, 'empty-change'), { recursive: true })

    const reconciliationsPath = path.join(root, 'DOES-NOT-EXIST.md')

    try {
      expect(() => findCrossChangeViolations(changesDir, reconciliationsPath)).not.toThrow()
      const violations = findCrossChangeViolations(changesDir, reconciliationsPath)
      expect(violations).toEqual([])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it(
    'LIVE SCOPED CHECK: ui-foundation × browser-folders no longer collides on ToolRail.tsx/App.tsx ' +
      'now that ui-foundation is Ledger-complete (W2 preflight FIX 3) — this pairing is the one A4 ' +
      'was written to catch (RECONCILIATIONS.md R1), and it is the scenario this guard must prove clean',
    () => {
      // Scoped to exactly these two changes so this assertion is independent of
      // the wider campaign's unrelated, pre-existing gaps (see the ratchet test
      // below for those).
      expect(isUnmerged(path.join(CHANGES_DIR, 'ui-foundation'))).toBe(false)

      const violations = findCrossChangeViolations(CHANGES_DIR, RECONCILIATIONS_PATH, [
        'ui-foundation',
        'browser-folders',
      ])
      expect(
        violations,
        'ui-foundation should be excluded as merged (Ledger PK.A-PK.H2 all ✅ per PLANNING-QUEUE row 10) ' +
          `— found: ${JSON.stringify(violations)}`,
      ).toHaveLength(0)
    },
  )

  it(
    `LIVE RATCHET: unresolved cross-change file claims across ALL of openspec/changes/ must not exceed ` +
      `the committed ceiling (${LIVE_VIOLATION_CEILING}, baselined 2026-07-31 W2 preflight — see PR body ` +
      'for the full list). This is a ceiling, not a target: it must only ever go down as RECONCILIATIONS ' +
      'rows land for each pairing, never silently up.',
    () => {
      const violations = findCrossChangeViolations(CHANGES_DIR, RECONCILIATIONS_PATH)
      expect(
        violations.length,
        `New undocumented cross-change file claim(s) appeared:\n${JSON.stringify(violations, null, 2)}`,
      ).toBeLessThanOrEqual(LIVE_VIOLATION_CEILING)
    },
  )
})
