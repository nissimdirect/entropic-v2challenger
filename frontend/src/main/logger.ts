/**
 * JSON line logger for Electron main process.
 * Writes to ~/.entropic/logs/electron-main.log with PII stripping and rotation.
 * No external dependencies — uses Node.js fs directly.
 */
import { appendFileSync, statSync, renameSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir, userInfo } from 'os'

const LOG_DIR = join(homedir(), '.entropic', 'logs')
const LOG_FILE = join(LOG_DIR, 'electron-main.log')
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_BACKUPS = 3

let initialized = false
const homeDir = homedir()
let username = ''
try {
  username = userInfo().username
} catch {
  // May fail on some systems
}

function ensureDir(): void {
  if (initialized) return
  try {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 })
    initialized = true
  } catch {
    // Non-fatal — logging is best-effort
  }
}

function stripPii(text: string): string {
  let result = text
  if (homeDir) {
    result = result.replaceAll(homeDir, '<HOME>')
  }
  if (username && username.length > 1) {
    result = result.replaceAll(username, '<USER>')
  }
  // Strip /Users/<anything> patterns
  result = result.replace(/\/Users\/[^/\s]+/g, '/Users/<USER>')
  return result
}

function rotate(): void {
  try {
    if (!existsSync(LOG_FILE)) return
    const stats = statSync(LOG_FILE)
    if (stats.size < MAX_SIZE) return

    // Shift backups: .3 → delete, .2 → .3, .1 → .2, current → .1
    for (let i = MAX_BACKUPS; i >= 1; i--) {
      const src = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`
      const dst = `${LOG_FILE}.${i}`
      if (existsSync(src)) {
        try {
          renameSync(src, dst)
        } catch {
          // Best-effort rotation
        }
      }
    }
  } catch {
    // Non-fatal
  }
}

function write(level: string, message: string, data?: Record<string, unknown>): void {
  ensureDir()
  rotate()

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message: stripPii(message),
  }
  if (data) {
    entry.data = JSON.parse(stripPii(JSON.stringify(data)))
  }

  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 })
  } catch {
    // Non-fatal — don't crash the app over logging
  }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>): void {
    write('INFO', message, data)
  },
  warn(message: string, data?: Record<string, unknown>): void {
    write('WARN', message, data)
  },
  error(message: string, data?: Record<string, unknown>): void {
    write('ERROR', message, data)
  },
}
