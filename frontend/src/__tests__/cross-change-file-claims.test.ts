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
 * FINDING (2026-07-31, W2 preflight): the live sweep below originally turned up
 * 18 already-existing, undocumented collisions across the Lane-2/Lane-4 campaign
 * (mostly App.tsx and a handful of shared stores — expected in a multi-lane repo,
 * but exactly the class of silent overlap A4 exists to catch); that count has
 * since dropped to 10 as other lanes' Ledgers completed. Resolving all of them
 * is out of scope for this packet (it touches proposals this session didn't
 * author). Per the Rule Admission Law's ratchet convention (this repo's own
 * hex-ratchet.sh / type-histogram-guard.sh precedent), the live-tree test below
 * is a ratchet — but P3.14 (gate-fix packet) upgraded it from a bare COUNT
 * ceiling to an IDENTITY baseline (VIOLATION_BASELINE below): a count-only
 * ceiling can pass even when a brand-new, unreviewed collision replaces a
 * resolved one in the same window (count stays flat or drops, but the new pair
 * was never reviewed). The identity check catches that; existing baseline
 * entries are retired individually as RECONCILIATIONS rows land for each pairing.
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

/**
 * P3.14 — RATCHET IDENTITY, not a count. Baselined 2026-07-31 (gate-fix
 * packet). A count-only ceiling (`violations.length <= N`) can pass even
 * when a genuinely NEW, unreviewed collision appears, as long as some OTHER
 * pre-existing violation got resolved in the same window and the total
 * stays flat or drops — the new pair would never get caught. Asserting
 * every live violation is a MEMBER of this exact baseline set means any
 * NOVEL {path, changes} pair fails regardless of the total count; existing
 * baseline entries may still be individually retired as RECONCILIATIONS
 * rows land (remove the entry here in the same commit that adds the row).
 */
const VIOLATION_BASELINE: Violation[] = [
  { path: 'frontend/src/__tests__/stores/ledger-lint.test.ts', changes: ['history-panel-delta', 'wave0-prerouted-presets'] },
  { path: 'frontend/src/main/menu.ts', changes: ['history-panel-delta', 'multiwindow-stage-a', 'system-monitor-v1'] },
  { path: 'frontend/src/renderer', changes: ['browser-folders', 'history-panel-delta'] },
  {
    path: 'frontend/src/renderer/App.tsx',
    changes: [
      'browser-folders', 'history-panel-delta', 'layertap-matte-v1', 'multiwindow-stage-a',
      'system-monitor-v1', 'util-transform', 'w15b-grid-track-paradigm', 'wave0-prerouted-presets',
    ],
  },
  { path: 'frontend/src/renderer/components/layout/HistoryPanel.tsx', changes: ['history-panel-delta', 'multiwindow-stage-a'] },
  {
    path: 'frontend/src/renderer/stores/operators.ts',
    changes: ['browser-folders', 'layertap-matte-v1', 'multiwindow-stage-a', 'util-transform', 'wave0-prerouted-presets'],
  },
  { path: 'frontend/src/renderer/stores/project.ts', changes: ['history-panel-delta', 'wave0-prerouted-presets'] },
  { path: 'frontend/src/renderer/stores/undo.ts', changes: ['fx-backspin', 'history-panel-delta', 'system-monitor-v1'] },
  {
    path: 'frontend/src/renderer/utils/default-shortcuts.ts',
    changes: ['browser-folders', 'history-panel-delta', 'multiwindow-stage-a', 'system-monitor-v1'],
  },
  {
    path: 'frontend/src/shared/types.ts',
    changes: ['browser-folders', 'history-panel-delta', 'layertap-matte-v1', 'util-transform', 'wave0-prerouted-presets'],
  },
]

/** Canonical key for a {path, changes} pair — order-independent on `changes`. */
function violationKey(v: Violation): string {
  return `${v.path}::${[...v.changes].sort().join(',')}`
}

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
  // [^|] (unbounded) matches newlines, and with the /m flag + surrounding
  // \s* boundaries that lets both capture groups backtrack across line
  // boundaries in a way that's ambiguous with each other — superlinear
  // blowup on pathological input (redteam-reported: 9.6s at 3KB; this
  // repo's own repro at frontend/src/__tests__/cross-change-file-claims.
  // test.ts's P2.5 test measured ~300ms at 20KB / ~8.8s at 80KB pre-fix vs
  // ~1-8ms post-fix at every size tried, confirming the same class of bug —
  // exact multiplier depends on the pathological input's construction).
  // [^|\n] confines each group to a single line, which a markdown table row
  // always is anyway.
  const rowRe = /^\|\s*([^\s|][^|\n]*?)\s*\|\s*([^|\n]+?)\s*\|/gm
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Does any single RECONCILIATIONS.md row mention every one of `changeNames`?
 *
 * P3.14: `row.includes(name)` was a plain substring test — a row mentioning
 * change "grid-v2" would ALSO satisfy `row.includes('grid')` for an
 * unrelated change literally named "grid", since change names are hyphenated
 * identifiers and JS `\b` word boundaries treat `-` as already non-word (so
 * `\bgrid\b` matches inside "grid-v2" too — that would NOT have fixed this).
 * Requires the match not be immediately adjacent to another identifier
 * character (letters/digits/underscore/hyphen) on EITHER side, treating the
 * whole hyphenated name as one atomic token.
 */
function reconciliationCovers(reconciliationsText: string, changeNames: string[]): boolean {
  const rows = reconciliationsText.split('\n').filter((l) => l.trim().startsWith('|'))
  const patterns = changeNames.map(
    (name) => new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(name)}(?![A-Za-z0-9_-])`),
  )
  return rows.some((row) => patterns.every((pattern) => pattern.test(row)))
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

  it('P3.14: reconciliationCovers requires an exact identifier match, not a substring — a row about "grid-v2" does not cover a collision named "grid"', () => {
    const { changesDir, reconciliationsPath, cleanup } = createFixtureChanges({
      changes: {
        grid: { planTable: ['| `frontend/src/renderer/Foo.tsx` | shared | edits |'] },
        other: { planTable: ['| `frontend/src/renderer/Foo.tsx` | shared | edits |'] },
      },
      reconciliations:
        '# RECONCILIATIONS\n\n| # | Surfaces | Lanes | Ruling | Status |\n|---|---|---|---|---|\n' +
        // "grid-v2" contains "grid" as a substring — the pre-fix
        // row.includes('grid') check would have falsely treated this row
        // (about an unrelated pairing) as covering the real grid×other collision.
        '| R1 | Foo.tsx | grid-v2 × other | unrelated ruling for a DIFFERENT pairing | OPEN |\n',
    })
    try {
      const violations = findCrossChangeViolations(changesDir, reconciliationsPath)
      expect(violations).toHaveLength(1)
      expect(violations[0].changes).toEqual(['grid', 'other'])
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

  it('P2.5: a ~20KB pathological Ledger tail (one unclosed leading pipe, many whitespace-only lines) parses in well under 100ms (ReDoS regression)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-change-guard-redos-'))
    try {
      const changeDir = path.join(root, 'redos-change')
      fs.mkdirSync(changeDir, { recursive: true })

      // A single leading `|` starts an attempted row match that never
      // closes, followed by many whitespace-only lines with no other pipe
      // anywhere. Pre-fix, [^|] treats every `\n` as just more matchable
      // filler (identical to a space) — group1's lazy expansion hunts for a
      // nonexistent second `|` across the ENTIRE remaining multi-line tail,
      // and /m's `^` gives it one retry-worthy anchor per line. Verified by
      // hand (not asserted here, to keep this suite fast): this exact shape
      // takes ~300ms at 20KB and ~8.8s at 80KB pre-fix (clean superlinear
      // blowup) vs ~1-8ms post-fix at every size up to 80KB, because
      // [^|\n] can't step over the very first `\n` — group1's search is
      // bounded to line 1's length no matter how much text follows.
      const lineLen = 60
      let tail = '|x' + ' '.repeat(lineLen - 2)
      while (tail.length < 20 * 1024) tail += '\n' + ' '.repeat(lineLen)
      const packetsText = `## Ledger\n\n| Packet | Status | PR | Oracle evidence |\n|---|---|---|---|\n${tail}\n`
      fs.writeFileSync(path.join(changeDir, 'packets.md'), packetsText)

      const start = performance.now()
      const result = isUnmerged(changeDir)
      const elapsedMs = performance.now() - start

      expect(elapsedMs, `isUnmerged took ${elapsedMs}ms on the pathological fixture`).toBeLessThan(100)
      // No parseable data row (the pathological tail never closes) -> can't
      // prove merged -> treated as unmerged, same conservative default as
      // "Ledger heading with no data rows".
      expect(result).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it(
    'LIVE RATCHET (identity, P3.14): every unresolved cross-change file claim across ALL of ' +
      'openspec/changes/ must be a MEMBER of the committed VIOLATION_BASELINE — any NOVEL, ' +
      'unreviewed {path, changes} pair fails this test regardless of the total count (a count-only ' +
      'ceiling could pass while silently swapping one violation for a different, never-reviewed one).',
    () => {
      const violations = findCrossChangeViolations(CHANGES_DIR, RECONCILIATIONS_PATH)
      const baselineKeys = new Set(VIOLATION_BASELINE.map(violationKey))
      const novel = violations.filter((v) => !baselineKeys.has(violationKey(v)))
      expect(
        novel,
        `New undocumented cross-change file claim(s) not in VIOLATION_BASELINE:\n${JSON.stringify(novel, null, 2)}`,
      ).toEqual([])
    },
  )
})
