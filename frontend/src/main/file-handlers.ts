/**
 * Secure file I/O and dialog IPC handlers.
 * Uses dialog-gated access: paths must be explicitly granted via native dialog,
 * or fall within ~/.entropic/ / userData before file operations are allowed.
 */
import { ipcMain, app, dialog, BrowserWindow, SaveDialogOptions, OpenDialogOptions } from 'electron'
import { open, readFile, rename, unlink, readdir, mkdir } from 'fs/promises'
import { lstatSync, existsSync } from 'fs'
import { resolve, dirname, basename, join } from 'path'
import { homedir } from 'os'

const ENTROPIC_DIR = resolve(join(homedir(), '.entropic'))

/** Paths granted by user via native file dialogs during this session. */
const grantedPaths = new Set<string>()

const ALLOWED_APP_PATHS = new Set(['userData', 'documents', 'desktop'])

/**
 * Check whether a resolved path is allowed for file operations.
 *
 * A path is allowed if it:
 * 1. Falls under ~/.entropic/
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

  // 1. Under ~/.entropic/
  if (resolved === ENTROPIC_DIR || resolved.startsWith(ENTROPIC_DIR + '/')) {
    return true
  }

  // 2. Under userData
  const userData = resolve(app.getPath('userData'))
  if (resolved === userData || resolved.startsWith(userData + '/')) {
    return true
  }

  // 2b. Under ~/Documents/Entropic/ (preset storage)
  const docsDir = resolve(join(homedir(), 'Documents', 'Entropic'))
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
}
