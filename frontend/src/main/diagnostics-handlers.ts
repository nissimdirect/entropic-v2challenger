/**
 * Diagnostic IPC handlers — telemetry consent, crash reports, autosave, system info.
 * Separate from ZMQ relay handlers. Called from index.ts alongside registerRelayHandlers().
 */
import { ipcMain, app } from 'electron'
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { homedir, platform, arch, totalmem, release } from 'os'
import { logger } from './logger'

const ENTROPIC_DIR = join(homedir(), '.entropic')
const CONSENT_FILE = join(ENTROPIC_DIR, 'telemetry_consent')
const CRASH_DIR = join(ENTROPIC_DIR, 'crash_reports')

/**
 * Validate that a path is under ~/.entropic to prevent path traversal.
 * Matches Python's _validate_log_dir pattern.
 */
function isUnderEntropicDir(targetPath: string): boolean {
  const resolved = resolve(targetPath)
  const allowedPrefix = resolve(ENTROPIC_DIR)
  return resolved === allowedPrefix || resolved.startsWith(allowedPrefix + '/')
}

export function registerDiagnosticsHandlers(): void {
  // --- Telemetry consent ---

  ipcMain.handle('telemetry:check', async () => {
    try {
      if (!existsSync(CONSENT_FILE)) return null
      const content = readFileSync(CONSENT_FILE, 'utf8').trim()
      if (content === 'yes') return true
      if (content === 'no') return false
      return null
    } catch {
      return null
    }
  })

  ipcMain.handle('telemetry:set', async (_event, consent: boolean) => {
    try {
      mkdirSync(ENTROPIC_DIR, { recursive: true, mode: 0o700 })
      writeFileSync(CONSENT_FILE, consent ? 'yes' : 'no', { encoding: 'utf8', mode: 0o600 })
    } catch {
      // Best-effort — don't crash if filesystem is unwritable
    }
  })

  // --- Crash reports ---

  ipcMain.handle('crash:list', async () => {
    try {
      if (!existsSync(CRASH_DIR) || !isUnderEntropicDir(CRASH_DIR)) return []

      const files = readdirSync(CRASH_DIR)
        .filter((f) => f.startsWith('crash_') && f.endsWith('.json'))
        .sort()
        .reverse()

      const reports: Record<string, unknown>[] = []
      for (const file of files) {
        const filePath = join(CRASH_DIR, file)
        if (!isUnderEntropicDir(filePath)) continue
        try {
          const content = readFileSync(filePath, 'utf8')
          reports.push(JSON.parse(content))
        } catch {
          // Skip malformed crash files
        }
      }
      return reports
    } catch {
      return []
    }
  })

  ipcMain.handle('crash:clear', async () => {
    try {
      if (!existsSync(CRASH_DIR) || !isUnderEntropicDir(CRASH_DIR)) return

      const files = readdirSync(CRASH_DIR)
        .filter((f) => f.startsWith('crash_') && f.endsWith('.json'))

      for (const file of files) {
        const filePath = join(CRASH_DIR, file)
        if (isUnderEntropicDir(filePath)) {
          try {
            unlinkSync(filePath)
          } catch {
            // Best-effort cleanup
          }
        }
      }
    } catch {
      // Best-effort
    }
  })

  // --- Autosave ---

  ipcMain.handle('autosave:find', async () => {
    try {
      const userDataDir = app.getPath('userData')
      const autosavePath = join(userDataDir, '.autosave.glitch')
      if (existsSync(autosavePath)) {
        return autosavePath
      }
      return null
    } catch {
      return null
    }
  })

  // --- System info ---

  ipcMain.handle('system:info', async () => {
    return {
      os: platform(),
      osVersion: release(),
      arch: arch(),
      electron: process.versions.electron,
      node: process.versions.node,
      totalMemory: Math.round(totalmem() / 1024 / 1024),
      appVersion: app.getVersion(),
    }
  })

  // --- Preferences persistence ---

  ipcMain.handle('preferences:read', async () => {
    try {
      const prefsPath = join(ENTROPIC_DIR, 'preferences.json')
      if (!existsSync(prefsPath)) return {}
      const content = readFileSync(prefsPath, 'utf8')
      const parsed = JSON.parse(content)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
      return parsed
    } catch {
      return {}
    }
  })

  ipcMain.handle('preferences:write', async (_event, data: unknown) => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new TypeError('preferences:write expects a plain object')
    }
    try {
      mkdirSync(ENTROPIC_DIR, { recursive: true, mode: 0o700 })
      const prefsPath = join(ENTROPIC_DIR, 'preferences.json')
      writeFileSync(prefsPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
    } catch {
      // Best-effort
    }
  })

  // --- Recent projects ---

  ipcMain.handle('recentProjects:read', async () => {
    try {
      const recentPath = join(ENTROPIC_DIR, 'recent-projects.json')
      if (!existsSync(recentPath)) return []
      const content = readFileSync(recentPath, 'utf8')
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      return []
    }
  })

  ipcMain.handle('recentProjects:write', async (_event, data: unknown) => {
    if (!Array.isArray(data)) {
      throw new TypeError('recentProjects:write expects an array')
    }
    try {
      mkdirSync(ENTROPIC_DIR, { recursive: true, mode: 0o700 })
      const recentPath = join(ENTROPIC_DIR, 'recent-projects.json')
      writeFileSync(recentPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
    } catch {
      // Best-effort
    }
  })

  // --- Feedback ---

  ipcMain.handle('feedback:submit', async (_event, text: string) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > 2000) {
      return
    }
    logger.info('[Feedback] User submitted feedback', { length: text.length })

    // Save feedback as JSON to Desktop (always, regardless of Sentry)
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const feedbackDir = join(homedir(), '.entropic', 'feedback')
    try {
      mkdirSync(feedbackDir, { recursive: true, mode: 0o700 })
      const feedbackPath = join(feedbackDir, `feedback-${timestamp}.json`)
      const payload = {
        timestamp: now.toISOString(),
        text,
        systemInfo: {
          os: platform(),
          arch: arch(),
          electron: process.versions.electron,
          appVersion: app.getVersion(),
        },
      }
      writeFileSync(feedbackPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 })
    } catch {
      // Best-effort
    }
  })
}
