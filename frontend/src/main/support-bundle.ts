/**
 * Support bundle generator — collects diagnostic files into a .tar.gz archive.
 * Uses Node.js built-in zlib (no external dependencies).
 * PII is stripped from all bundled content.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { homedir, platform, arch, totalmem, release, userInfo } from 'os'
import { gzipSync } from 'zlib'
import { app, ipcMain } from 'electron'

const ENTROPIC_DIR = join(homedir(), '.entropic')
const LOG_DIR = join(ENTROPIC_DIR, 'logs')
const CRASH_DIR = join(ENTROPIC_DIR, 'crash_reports')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
const MAX_BUNDLE_SIZE = 50 * 1024 * 1024 // 50MB total

let homeStr = ''
let usernameStr = ''
try {
  homeStr = homedir()
  usernameStr = userInfo().username
} catch { /* best-effort */ }

function stripPii(text: string): string {
  let result = text
  if (homeStr) {
    result = result.replaceAll(homeStr, '<HOME>')
  }
  if (usernameStr && usernameStr.length > 1) {
    result = result.replaceAll(usernameStr, '<USER>')
  }
  result = result.replace(/\/Users\/[^/\s]+/g, '/Users/<USER>')
  return result
}

/**
 * Create a tar header for a file entry.
 * Minimal POSIX tar format — 512-byte header block.
 */
function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0)

  // name (0-99)
  header.write(name.slice(0, 99), 0, 'utf8')
  // mode (100-107)
  header.write('0000644\0', 100, 'utf8')
  // uid (108-115)
  header.write('0000000\0', 108, 'utf8')
  // gid (116-123)
  header.write('0000000\0', 116, 'utf8')
  // size (124-135)
  header.write(size.toString(8).padStart(11, '0') + '\0', 124, 'utf8')
  // mtime (136-147)
  const mtime = Math.floor(Date.now() / 1000)
  header.write(mtime.toString(8).padStart(11, '0') + '\0', 136, 'utf8')
  // typeflag (156)
  header.write('0', 156, 'utf8')

  // checksum (148-155) — initially spaces, then compute
  header.write('        ', 148, 'utf8')
  let checksum = 0
  for (let i = 0; i < 512; i++) {
    checksum += header[i]
  }
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8')

  return header
}

function collectFiles(): { name: string; content: string }[] {
  const entries: { name: string; content: string }[] = []
  let totalSize = 0

  // Helper to add a file
  const addFile = (filePath: string, archiveName: string): void => {
    try {
      if (!existsSync(filePath)) return
      const stats = statSync(filePath)
      if (stats.size > MAX_FILE_SIZE) return
      if (totalSize + stats.size > MAX_BUNDLE_SIZE) return

      const content = stripPii(readFileSync(filePath, 'utf8'))
      entries.push({ name: archiveName, content })
      totalSize += content.length
    } catch {
      // Skip unreadable files
    }
  }

  // Sidecar logs (all rotated)
  if (existsSync(LOG_DIR)) {
    const logFiles = readdirSync(LOG_DIR).filter((f) => f.startsWith('sidecar'))
    for (const f of logFiles) {
      addFile(join(LOG_DIR, f), `logs/${f}`)
    }
    // Electron main logs
    const mainLogs = readdirSync(LOG_DIR).filter((f) => f.startsWith('electron-main'))
    for (const f of mainLogs) {
      addFile(join(LOG_DIR, f), `logs/${f}`)
    }
  }

  // Crash reports
  if (existsSync(CRASH_DIR)) {
    const crashFiles = readdirSync(CRASH_DIR).filter(
      (f) => f.startsWith('crash_') && f.endsWith('.json'),
    )
    for (const f of crashFiles) {
      addFile(join(CRASH_DIR, f), `crash_reports/${f}`)
    }
  }

  // System info
  const sysInfo = {
    os: platform(),
    osVersion: release(),
    arch: arch(),
    electron: process.versions.electron,
    node: process.versions.node,
    totalMemoryMB: Math.round(totalmem() / 1024 / 1024),
    appVersion: app.getVersion(),
  }
  entries.push({ name: 'system-info.json', content: JSON.stringify(sysInfo, null, 2) })

  return entries
}

export async function generateSupportBundle(): Promise<string> {
  const files = collectFiles()

  // Build tar archive in memory
  const blocks: Buffer[] = []
  for (const file of files) {
    const content = Buffer.from(file.content, 'utf8')
    blocks.push(tarHeader(file.name, content.length))
    blocks.push(content)
    // Pad to 512-byte boundary
    const remainder = content.length % 512
    if (remainder > 0) {
      blocks.push(Buffer.alloc(512 - remainder, 0))
    }
  }
  // End-of-archive marker (two 512-byte zero blocks)
  blocks.push(Buffer.alloc(1024, 0))

  const tar = Buffer.concat(blocks)
  const gzipped = gzipSync(tar)

  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const desktopDir = join(homedir(), 'Desktop')
  if (!existsSync(desktopDir)) {
    throw new Error('Desktop directory not found')
  }
  const outputPath = join(desktopDir, `entropic-support-${timestamp}.tar.gz`)

  writeFileSync(outputPath, gzipped)

  return outputPath
}

export function registerSupportBundleHandler(): void {
  ipcMain.handle('support:bundle', async () => {
    return generateSupportBundle()
  })
}
