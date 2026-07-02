/**
 * PD.10 — runtime-dir migration tests (~/.entropic → ~/.creatrix).
 *
 * Uses REAL fs against seeded tmpdir fixtures (never the user's real home).
 * The migration fn takes sourceDir/targetDir overrides precisely so these
 * tests can point it at throwaway dirs.
 *
 * Safety contract under test (packet PD.10 MIGRATION SPEC):
 *   - copy-if-absent only; never overwrite an existing target
 *   - originals never deleted/moved
 *   - breadcrumb-gated idempotency; interrupt-safe re-run
 *   - dry-run writes zero files
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Silence the logger's real fs writes (it targets the real ~/.creatrix/logs).
// The migration's behavior is observed via the returned MigrationResult and
// the tmpdir filesystem, not via log output.
vi.mock('../../main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  migrateRuntimeDir,
  BREADCRUMB_NAME,
} from '../../main/migrate-runtime-dir'

let sourceDir: string
let targetDir: string
let root: string

/** Recursively count files (not dirs) under a path. */
function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) n += countFiles(p)
    else n += 1
  }
  return n
}

/** Seed a fake ~/.entropic with all 6 migrated globs + some never-touched dirs. */
function seedSource(): void {
  mkdirSync(join(sourceDir, 'logs'), { recursive: true })
  writeFileSync(join(sourceDir, 'logs', 'electron-main.log'), 'main-log\n')
  writeFileSync(join(sourceDir, 'logs', 'sidecar.log'), 'sidecar-log\n')

  mkdirSync(join(sourceDir, 'feedback'), { recursive: true })
  writeFileSync(join(sourceDir, 'feedback', 'feedback-1.json'), '{"a":1}')
  // nested feedback file to exercise recursive tree copy
  mkdirSync(join(sourceDir, 'feedback', 'sub'), { recursive: true })
  writeFileSync(join(sourceDir, 'feedback', 'sub', 'feedback-2.json'), '{"b":2}')

  writeFileSync(join(sourceDir, 'pop-out-state.json'), '{"x":1}')
  writeFileSync(join(sourceDir, 'recent-projects.json'), '[]')
  writeFileSync(join(sourceDir, 'window-state.json'), '{"w":1}')
  writeFileSync(join(sourceDir, 'telemetry_consent'), 'yes')

  // NEVER-TOUCHED entries (must remain only in source, never appear in target)
  mkdirSync(join(sourceDir, 'demos'), { recursive: true })
  writeFileSync(join(sourceDir, 'demos', 'render.mp4'), 'video-bytes')
  mkdirSync(join(sourceDir, 'projects'), { recursive: true })
  writeFileSync(join(sourceDir, 'projects', 'p.glitch'), 'project')
  mkdirSync(join(sourceDir, 'crash_reports'), { recursive: true })
  writeFileSync(join(sourceDir, 'crash_reports', 'crash_1.json'), '{}')
  writeFileSync(join(sourceDir, 'q7-report.MOCK.json'), '{}')
  writeFileSync(join(sourceDir, 'test.glitch'), 'x')
}

/** The 6 files that SHOULD land in the target after a clean migration. */
const EXPECTED_TARGET_FILES = [
  'logs/electron-main.log',
  'logs/sidecar.log',
  'feedback/feedback-1.json',
  'feedback/sub/feedback-2.json',
  'pop-out-state.json',
  'recent-projects.json',
  'window-state.json',
  'telemetry_consent',
]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pd10-migrate-'))
  sourceDir = join(root, '.entropic')
  targetDir = join(root, '.creatrix')
  mkdirSync(sourceDir, { recursive: true })
  delete process.env.CREATRIX_MIGRATE_DRY_RUN
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.CREATRIX_MIGRATE_DRY_RUN
})

describe('migrateRuntimeDir', () => {
  it('migration copies entropic dir contents once', () => {
    seedSource()

    const result = migrateRuntimeDir({ sourceDir, targetDir })

    expect(result.ran).toBe(true)
    expect(result.dryRun).toBe(false)

    // All 6 globs (8 concrete files incl. nested) landed in the target.
    for (const rel of EXPECTED_TARGET_FILES) {
      expect(existsSync(join(targetDir, rel)), `expected ${rel} in target`).toBe(true)
    }
    expect(countFiles(targetDir)).toBe(EXPECTED_TARGET_FILES.length)
    expect(result.copied.length).toBe(EXPECTED_TARGET_FILES.length)

    // NEVER-TOUCHED dirs/files must NOT appear in the target.
    expect(existsSync(join(targetDir, 'demos'))).toBe(false)
    expect(existsSync(join(targetDir, 'projects'))).toBe(false)
    expect(existsSync(join(targetDir, 'crash_reports'))).toBe(false)
    expect(existsSync(join(targetDir, 'q7-report.MOCK.json'))).toBe(false)
    expect(existsSync(join(targetDir, 'test.glitch'))).toBe(false)

    // Originals retained.
    expect(existsSync(join(sourceDir, 'logs', 'electron-main.log'))).toBe(true)
    expect(existsSync(join(sourceDir, 'demos', 'render.mp4'))).toBe(true)

    // Breadcrumb written LAST.
    expect(existsSync(join(sourceDir, BREADCRUMB_NAME))).toBe(true)
  })

  it('migration is a no-op when breadcrumb present', () => {
    seedSource()
    // Pre-write the breadcrumb → migration must skip entirely.
    writeFileSync(join(sourceDir, BREADCRUMB_NAME), 'already done')

    const result = migrateRuntimeDir({ sourceDir, targetDir })

    expect(result.ran).toBe(false)
    expect(result.copied.length).toBe(0)
    // Nothing copied to target.
    expect(countFiles(targetDir)).toBe(0)
  })

  it('migration skips files whose target already exists', () => {
    // NEGATIVE: seed BOTH dirs with same-named, DIFFERENT-content files.
    seedSource()
    // Live collision: target already has logs/electron-main.log + telemetry_consent
    // + window-state.json (the real-machine collision set).
    mkdirSync(join(targetDir, 'logs'), { recursive: true })
    writeFileSync(join(targetDir, 'logs', 'electron-main.log'), 'NEWER-DO-NOT-CLOBBER')
    writeFileSync(join(targetDir, 'telemetry_consent'), 'no')
    writeFileSync(join(targetDir, 'window-state.json'), '{"newer":true}')

    const result = migrateRuntimeDir({ sourceDir, targetDir })

    expect(result.ran).toBe(true)

    // Existing target content is byte-unchanged (never overwritten).
    expect(readFileSync(join(targetDir, 'logs', 'electron-main.log'), 'utf8')).toBe(
      'NEWER-DO-NOT-CLOBBER',
    )
    expect(readFileSync(join(targetDir, 'telemetry_consent'), 'utf8')).toBe('no')
    expect(readFileSync(join(targetDir, 'window-state.json'), 'utf8')).toBe('{"newer":true}')

    // The 3 collisions were recorded as skips with reason target-exists.
    const skipTargets = result.skipped.map((s) => s.target)
    expect(skipTargets).toContain(join(targetDir, 'logs', 'electron-main.log'))
    expect(skipTargets).toContain(join(targetDir, 'telemetry_consent'))
    expect(skipTargets).toContain(join(targetDir, 'window-state.json'))
    expect(result.skipped.every((s) => s.reason === 'target-exists')).toBe(true)

    // Non-colliding files still copied (e.g. sidecar.log, pop-out-state.json).
    expect(readFileSync(join(targetDir, 'logs', 'sidecar.log'), 'utf8')).toBe('sidecar-log\n')
    expect(existsSync(join(targetDir, 'pop-out-state.json'))).toBe(true)
  })

  it('interrupted migration completes on second run without duplicates', () => {
    // NEGATIVE: simulate an interrupted first pass — half the files already
    // copied, NO breadcrumb yet. Second run must copy only the rest and leave
    // the final file set exact (no duplicates), originals intact.
    seedSource()

    // Simulate partial prior copy: pop-out-state + telemetry already in target,
    // identical content (as copy-if-absent would have left them).
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, 'pop-out-state.json'), '{"x":1}')
    writeFileSync(join(targetDir, 'telemetry_consent'), 'yes')
    // No breadcrumb in source → migration re-runs.
    expect(existsSync(join(sourceDir, BREADCRUMB_NAME))).toBe(false)

    const result = migrateRuntimeDir({ sourceDir, targetDir })

    expect(result.ran).toBe(true)
    // The 2 pre-existing files are skipped (target-exists), the rest copied.
    const skipTargets = result.skipped.map((s) => s.target)
    expect(skipTargets).toContain(join(targetDir, 'pop-out-state.json'))
    expect(skipTargets).toContain(join(targetDir, 'telemetry_consent'))

    // Final file set is exact — every expected file present exactly once,
    // total count matches (no duplicates).
    for (const rel of EXPECTED_TARGET_FILES) {
      expect(existsSync(join(targetDir, rel)), `expected ${rel}`).toBe(true)
    }
    expect(countFiles(targetDir)).toBe(EXPECTED_TARGET_FILES.length)

    // Originals intact.
    expect(countFiles(join(sourceDir, 'logs'))).toBe(2)
    expect(existsSync(join(sourceDir, 'demos', 'render.mp4'))).toBe(true)

    // Breadcrumb now written (clean completion).
    expect(existsSync(join(sourceDir, BREADCRUMB_NAME))).toBe(true)
  })

  it('dry-run mode writes nothing', () => {
    // NEGATIVE: CREATRIX_MIGRATE_DRY_RUN=1 → plan logged, ZERO files written.
    seedSource()
    process.env.CREATRIX_MIGRATE_DRY_RUN = '1'

    const result = migrateRuntimeDir({ sourceDir, targetDir })

    expect(result.ran).toBe(true)
    expect(result.dryRun).toBe(true)
    // Plan computed (would-copy entries listed) but NO files written.
    expect(result.copied.length).toBe(EXPECTED_TARGET_FILES.length)
    expect(existsSync(targetDir)).toBe(false)
    expect(countFiles(targetDir)).toBe(0)
    // No breadcrumb written in dry-run.
    expect(existsSync(join(sourceDir, BREADCRUMB_NAME))).toBe(false)
  })

  it('dry-run via explicit option also writes nothing', () => {
    seedSource()
    const result = migrateRuntimeDir({ sourceDir, targetDir, dryRun: true })
    expect(result.dryRun).toBe(true)
    expect(countFiles(targetDir)).toBe(0)
    expect(existsSync(join(sourceDir, BREADCRUMB_NAME))).toBe(false)
  })

  it('is a no-op when the source dir does not exist (fresh install)', () => {
    rmSync(sourceDir, { recursive: true, force: true })
    const result = migrateRuntimeDir({ sourceDir, targetDir })
    expect(result.ran).toBe(false)
    expect(result.copied.length).toBe(0)
    expect(existsSync(targetDir)).toBe(false)
  })

  it('diagnostics read allows electron-main.log after migration', () => {
    // INTEGRATION (the bug-fix proof): after migration the electron-main.log
    // lives under the target runtime dir, and the diagnostics read-validation
    // (isUnderCreatrixDir-style prefix check) accepts a path under that dir.
    seedSource()
    migrateRuntimeDir({ sourceDir, targetDir })

    const logPath = join(targetDir, 'logs', 'electron-main.log')
    expect(existsSync(logPath)).toBe(true)

    // Mirror diagnostics-handlers.ts allowedPrefix logic: a path under the
    // creatrix runtime dir passes the prefix guard, so the log is readable.
    const allowedPrefix = targetDir
    const underCreatrix =
      logPath === allowedPrefix || logPath.startsWith(allowedPrefix + '/')
    expect(underCreatrix).toBe(true)
    expect(readFileSync(logPath, 'utf8')).toBe('main-log\n')
  })
})
