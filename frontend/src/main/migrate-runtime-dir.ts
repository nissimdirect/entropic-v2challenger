/**
 * One-time runtime-directory migration: ~/.entropic → ~/.creatrix (PD.10).
 *
 * Background: PR #120 renamed the app Entropic → Creatrix. The backend and the
 * diagnostics read-validation (`diagnostics-handlers.ts` `allowedPrefix`) moved
 * to `~/.creatrix`, but several Electron-main writers (logger, pop-out state,
 * feedback) still targeted the OLD `~/.entropic` dir — so the Electron main log
 * was unreadable via the in-app diagnostics IPC. Those writers now point at
 * `~/.creatrix`; this module copies the user's existing data across once.
 *
 * SAFETY CONTRACT (non-negotiable — see packet PD.10 MIGRATION SPEC):
 *   - COPY-IF-ABSENT ONLY. Never overwrite an existing target file.
 *   - Never delete or move originals — `~/.entropic` files stay put forever.
 *   - Only the 6 globs in MIGRATED_ENTRIES move. demos/, projects/, models/,
 *     crash_reports/, test.glitch, q7-report.MOCK.json are NEVER touched.
 *   - Idempotent: a `MOVED.txt` breadcrumb is written LAST, after a fully
 *     successful pass. Breadcrumb present → migration is skipped entirely.
 *     Interrupted (no breadcrumb) → re-runs safely; copy-if-absent skips the
 *     files already copied, so no duplicates and no data loss.
 *   - Dry-run: CREATRIX_MIGRATE_DRY_RUN=1 logs the plan and writes ZERO files.
 *
 * No external dependencies — uses Node.js fs directly. Best-effort: a failure
 * to migrate must never crash app boot.
 */
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from './logger'

/** Breadcrumb filename written to the OLD dir once migration completes. */
export const BREADCRUMB_NAME = 'MOVED.txt'

/**
 * A migration entry. `kind: 'file'` copies a single file; `kind: 'tree'`
 * recursively copies a directory's contents (e.g. logs/, feedback/).
 */
interface MigrationEntry {
  /** Path relative to the source/target runtime dir. */
  rel: string
  kind: 'file' | 'tree'
}

/**
 * The ONLY entries that migrate (packet PD.10 MIGRATION SPEC, 6 globs).
 * Everything else under ~/.entropic stays put.
 */
const MIGRATED_ENTRIES: MigrationEntry[] = [
  { rel: 'logs', kind: 'tree' },
  { rel: 'feedback', kind: 'tree' },
  { rel: 'pop-out-state.json', kind: 'file' },
  { rel: 'recent-projects.json', kind: 'file' },
  { rel: 'window-state.json', kind: 'file' },
  { rel: 'telemetry_consent', kind: 'file' },
]

export interface MigrationResult {
  /** True if the migration ran a pass this invocation (false = skipped via breadcrumb). */
  ran: boolean
  /** Files copied to the target this invocation. */
  copied: string[]
  /** Files skipped because the target already existed (collisions). */
  skipped: { source: string; target: string; reason: string }[]
  /** True if dry-run mode was active (no writes performed). */
  dryRun: boolean
}

export interface MigrateOptions {
  /** Override the source dir (default ~/.entropic). Used by tests. */
  sourceDir?: string
  /** Override the target dir (default ~/.creatrix). Used by tests. */
  targetDir?: string
  /** Force dry-run regardless of env. Used by tests. */
  dryRun?: boolean
}

function isDryRun(opts: MigrateOptions): boolean {
  if (typeof opts.dryRun === 'boolean') return opts.dryRun
  return process.env.CREATRIX_MIGRATE_DRY_RUN === '1'
}

/**
 * Copy one file with copy-if-absent + dry-run semantics. Records the outcome
 * into `result`. Never overwrites an existing target.
 */
function copyFileIfAbsent(
  src: string,
  dst: string,
  dryRun: boolean,
  result: MigrationResult,
): void {
  if (!existsSync(src)) return
  if (existsSync(dst)) {
    const skip = { source: src, target: dst, reason: 'target-exists' }
    result.skipped.push(skip)
    logger.info('[migrate-runtime-dir] skip (target-exists)', skip)
    return
  }
  if (dryRun) {
    result.copied.push(dst)
    logger.info('[migrate-runtime-dir] DRY-RUN would copy', { source: src, target: dst })
    return
  }
  mkdirSync(join(dst, '..'), { recursive: true, mode: 0o700 })
  copyFileSync(src, dst)
  result.copied.push(dst)
  logger.info('[migrate-runtime-dir] copied', { source: src, target: dst })
}

/**
 * Recursively copy a directory's contents, copy-if-absent per file.
 * Directories are created as needed; existing target files are never clobbered.
 */
function copyTreeIfAbsent(
  srcDir: string,
  dstDir: string,
  dryRun: boolean,
  result: MigrationResult,
): void {
  if (!existsSync(srcDir)) return
  let entries: string[]
  try {
    entries = readdirSync(srcDir)
  } catch {
    return
  }
  for (const name of entries) {
    const srcPath = join(srcDir, name)
    const dstPath = join(dstDir, name)
    let isDir = false
    try {
      isDir = statSync(srcPath).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      copyTreeIfAbsent(srcPath, dstPath, dryRun, result)
    } else {
      copyFileIfAbsent(srcPath, dstPath, dryRun, result)
    }
  }
}

/**
 * Run the one-time ~/.entropic → ~/.creatrix migration.
 *
 * Ordered FIRST in the main-process bootstrap so the logger (and every other
 * runtime-dir writer) writes to the NEW dir on the same boot. Best-effort:
 * any unexpected failure is logged and swallowed — never crashes boot.
 */
export function migrateRuntimeDir(opts: MigrateOptions = {}): MigrationResult {
  const sourceDir = opts.sourceDir ?? join(homedir(), '.entropic')
  const targetDir = opts.targetDir ?? join(homedir(), '.creatrix')
  const dryRun = isDryRun(opts)

  const result: MigrationResult = { ran: false, copied: [], skipped: [], dryRun }

  try {
    // Nothing to migrate if the old dir never existed (fresh install).
    if (!existsSync(sourceDir)) {
      return result
    }

    // Idempotency: breadcrumb present → already migrated, skip entirely.
    const breadcrumb = join(sourceDir, BREADCRUMB_NAME)
    if (existsSync(breadcrumb)) {
      return result
    }

    result.ran = true

    if (dryRun) {
      logger.info('[migrate-runtime-dir] DRY-RUN start', { sourceDir, targetDir })
    } else {
      logger.info('[migrate-runtime-dir] start', { sourceDir, targetDir })
    }

    for (const entry of MIGRATED_ENTRIES) {
      const src = join(sourceDir, entry.rel)
      const dst = join(targetDir, entry.rel)
      if (entry.kind === 'tree') {
        copyTreeIfAbsent(src, dst, dryRun, result)
      } else {
        copyFileIfAbsent(src, dst, dryRun, result)
      }
    }

    // Breadcrumb LAST — only after a fully successful pass, and never in
    // dry-run (dry-run must write ZERO files). If we crash before here, the
    // next boot re-runs and copy-if-absent skips what already landed.
    if (!dryRun) {
      writeFileSync(
        breadcrumb,
        `Migrated to ~/.creatrix on ${new Date().toISOString()}\n` +
          `Originals retained here; safe to keep or remove manually.\n`,
        { encoding: 'utf8', mode: 0o600 },
      )
    }

    logger.info('[migrate-runtime-dir] done', {
      copied: result.copied.length,
      skipped: result.skipped.length,
      dryRun,
    })
  } catch (err) {
    // Best-effort: migration failure must never crash boot. Originals are
    // never deleted, so a failed pass loses nothing — next boot retries.
    logger.error('[migrate-runtime-dir] failed', { error: String(err) })
  }

  return result
}
