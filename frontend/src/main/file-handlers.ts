/**
 * Secure file I/O and dialog IPC handlers.
 * Uses dialog-gated access: paths must be explicitly granted via native dialog,
 * or fall within ~/.creatrix/ / userData before file operations are allowed.
 */
import { ipcMain, app, dialog, BrowserWindow, SaveDialogOptions, OpenDialogOptions } from 'electron'
import { open, readFile, rename, unlink, readdir, mkdir } from 'fs/promises'
import { lstatSync, existsSync } from 'fs'
import { resolve, dirname, basename, join } from 'path'
import { homedir } from 'os'

const CREATRIX_DIR = resolve(join(homedir(), '.creatrix'))

/**
 * P3.5: The demo MP4s live under ~/.entropic/demos/. PD.10 deliberately does
 * NOT migrate user render artifacts (demos/, projects/, models/, crash_reports/)
 * — only small state/log files move to ~/.creatrix. So this resolver keeps the
 * ~/.entropic/demos/ fallback. This ONE constant is the single source of truth
 * for the resolver — never hardcode both dirs in renderer code (ONBOARDING-SPEC
 * §8 grep-check #2).
 *
 * Resolution order: if ~/.creatrix/demos/ exists (manual user follow-up), use
 * it; else fall back to ~/.entropic/demos/ (current on-disk reality 2026-06-11).
 */
const DEMOS_DIR = (() => {
  const primary = resolve(join(homedir(), '.creatrix', 'demos'))
  const fallback = resolve(join(homedir(), '.entropic', 'demos'))
  if (existsSync(primary)) return primary
  return fallback
})()

/** Paths granted by user via native file dialogs during this session. */
const grantedPaths = new Set<string>()

const ALLOWED_APP_PATHS = new Set(['userData', 'documents', 'desktop'])

/**
 * Check whether a resolved path is allowed for file operations.
 *
 * A path is allowed if it:
 * 1. Falls under ~/.creatrix/
 * 2. Falls under app.getPath('userData')
 * 3. Was explicitly granted via a native dialog this session
 * 4. Is an .autosave.glitch sibling of a granted path
 */
export function isPathAllowed(targetPath: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false

  const resolved = resolve(targetPath)
  if (!resolved) return false

  // 0. Reject symlinks — prevent symlink-based path traversal
  try {
    if (existsSync(resolved) && lstatSync(resolved).isSymbolicLink()) return false
  } catch {
    // If lstat fails (e.g. permission denied), deny access
    return false
  }

  // 1. Under ~/.creatrix/
  if (resolved === CREATRIX_DIR || resolved.startsWith(CREATRIX_DIR + '/')) {
    return true
  }

  // 2. Under userData
  const userData = resolve(app.getPath('userData'))
  if (resolved === userData || resolved.startsWith(userData + '/')) {
    return true
  }

  // 2b. Under ~/Documents/Creatrix/ (preset storage)
  const docsDir = resolve(join(homedir(), 'Documents', 'Creatrix'))
  if (resolved === docsDir || resolved.startsWith(docsDir + '/')) {
    return true
  }

  // 3. Explicitly granted (or its .tmp sibling for atomic writes)
  if (grantedPaths.has(resolved)) {
    return true
  }
  // Support both legacy .tmp and unique .tmp.PID.TIMESTAMP suffixes
  if (resolved.endsWith('.tmp')) {
    const base = resolved.slice(0, -4)
    if (grantedPaths.has(base)) {
      return true
    }
  }
  const tmpMatch = resolved.match(/\.tmp\.\d+\.\d+$/)
  if (tmpMatch) {
    const base = resolved.slice(0, tmpMatch.index!)
    if (grantedPaths.has(base)) {
      return true
    }
  }

  // 4. Autosave sibling: .autosave.glitch in the same directory as a granted path
  if (basename(resolved) === '.autosave.glitch') {
    const dir = dirname(resolved)
    for (const granted of grantedPaths) {
      if (dirname(granted) === dir) {
        return true
      }
    }
  }

  // 5. UE.4 backup sibling: <granted>.bak.N where N is strictly an integer 1-5.
  // Single digit [1-5] only — rejects .bak.99, .bak.-1, .bak.05, .bak.0 at the
  // trust boundary. The base path (suffix stripped) must itself be granted.
  const bakMatch = resolved.match(/\.bak\.([1-5])$/)
  if (bakMatch && !/\.bak\.\d+\.bak\.[1-5]$/.test(resolved)) {
    const base = resolved.slice(0, -('.bak.'.length + 1))
    if (grantedPaths.has(base)) {
      return true
    }
  }

  return false
}

/** Grant a path (for testing purposes and internal use). */
export function grantPath(filePath: string): void {
  grantedPaths.add(resolve(filePath))
}

/** Clear all granted paths (for testing). */
export function clearGrantedPaths(): void {
  grantedPaths.clear()
}

/**
 * Write file atomically: write to unique .tmp, fsync, rename.
 * Prevents corruption on crash and races on concurrent writes.
 */
async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const suffix = `.tmp.${process.pid}.${Date.now()}`
  const tmpPath = filePath + suffix
  try {
    const fh = await open(tmpPath, 'w')
    try {
      await fh.writeFile(data, 'utf8')
      await fh.sync()
    } finally {
      await fh.close()
    }
    await rename(tmpPath, filePath)
  } catch (err) {
    try { await unlink(tmpPath) } catch { /* already gone */ }
    throw err
  }
}

export function registerFileHandlers(): void {
  // --- Dialog handlers (grant access on selection) ---

  ipcMain.handle('dialog:save', async (_event, options: unknown) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showSaveDialog(win, (options ?? {}) as SaveDialogOptions)
    if (result.canceled || !result.filePath) return null

    grantedPaths.add(resolve(result.filePath))
    return result.filePath
  })

  ipcMain.handle('dialog:open', async (_event, options: unknown) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, (options ?? {}) as OpenDialogOptions)
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    grantedPaths.add(resolve(filePath))
    return filePath
  })

  // --- File operations (require path validation) ---

  ipcMain.handle('file:read', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') {
      throw new TypeError('file:read expects a string path')
    }
    const resolved = resolve(filePath)
    if (!isPathAllowed(resolved)) {
      throw new Error(`Access denied: ${filePath}`)
    }
    return readFile(resolved, 'utf8')
  })

  ipcMain.handle('file:write', async (_event, filePath: unknown, data: unknown) => {
    if (typeof filePath !== 'string') {
      throw new TypeError('file:write expects a string path')
    }
    if (typeof data !== 'string') {
      throw new TypeError('file:write expects string data')
    }
    const resolved = resolve(filePath)
    if (!isPathAllowed(resolved)) {
      throw new Error(`Access denied: ${filePath}`)
    }
    await atomicWriteFile(resolved, data)
  })

  ipcMain.handle('file:delete', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') {
      throw new TypeError('file:delete expects a string path')
    }
    const resolved = resolve(filePath)
    if (!isPathAllowed(resolved)) {
      throw new Error(`Access denied: ${filePath}`)
    }
    await unlink(resolved)
  })

  ipcMain.handle('file:list', async (_event, dirPath: unknown, pattern?: unknown) => {
    if (typeof dirPath !== 'string') {
      throw new TypeError('file:list expects a string path')
    }
    const resolved = resolve(dirPath)
    if (!isPathAllowed(resolved)) {
      throw new Error(`Access denied: ${dirPath}`)
    }
    const files = await readdir(resolved)
    if (typeof pattern === 'string') {
      return files.filter(f => f.endsWith(pattern))
    }
    return files
  })

  ipcMain.handle('file:mkdir', async (_event, dirPath: unknown) => {
    if (typeof dirPath !== 'string') {
      throw new TypeError('file:mkdir expects a string path')
    }
    const resolved = resolve(dirPath)
    if (!isPathAllowed(resolved)) {
      throw new Error(`Access denied: ${dirPath}`)
    }
    await mkdir(resolved, { recursive: true })
  })

  // --- Existence check (narrow: only for granted/internal paths — used by relink probe) ---

  ipcMain.handle('file:exists', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string') {
      throw new TypeError('file:exists expects a string path')
    }
    const resolved = resolve(filePath)
    if (!isPathAllowed(resolved)) {
      throw new Error(`Access denied: ${filePath}`)
    }
    return existsSync(resolved)
  })

  // --- App path (allowlisted names only) ---

  ipcMain.handle('app:getPath', async (_event, name: unknown) => {
    if (typeof name !== 'string') {
      throw new TypeError('app:getPath expects a string name')
    }
    if (!ALLOWED_APP_PATHS.has(name)) {
      throw new Error(`app:getPath denied for '${name}' — allowed: ${[...ALLOWED_APP_PATHS].join(', ')}`)
    }
    return app.getPath(name as Parameters<typeof app.getPath>[0])
  })

  // --- P3.5: Demo file paths (resolved from the ONE runtime-dir constant) ---
  /**
   * Returns a Record<demoId, absolutePath | null> for the 3 demo MP4s.
   * null means the file is missing on disk (renderer shows the error card).
   * Renderer code never hardcodes ~/.entropic or ~/.creatrix — all path
   * resolution happens here (ONBOARDING-SPEC §8 grep-check #2).
   */
  ipcMain.handle('demos:getPaths', async () => {
    const DEMO_FILES: Record<string, string> = {
      y_is_time: 'y-is-time.mp4',
      painted_blur: 'painted-blur.mp4',
      audio_lfo_stripes: 'audio-lfo-stripes.mp4',
    }
    const result: Record<string, string | null> = {}
    for (const [id, filename] of Object.entries(DEMO_FILES)) {
      const fullPath = join(DEMOS_DIR, filename)
      result[id] = existsSync(fullPath) ? fullPath : null
    }
    return result
  })
}
