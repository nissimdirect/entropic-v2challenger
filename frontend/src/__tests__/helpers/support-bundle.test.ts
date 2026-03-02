/**
 * Support bundle generator tests — file collection, PII stripping, tar output.
 * Sprint 2C.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}))

const zlibMocks = vi.hoisted(() => ({
  gzipSync: vi.fn().mockImplementation((buf: Buffer) => buf),
}))

vi.mock('electron', () => ({
  default: {},
  app: { getVersion: () => '2.0.0-test' },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: { ...actual, ...fsMocks },
    readFileSync: fsMocks.readFileSync,
    writeFileSync: fsMocks.writeFileSync,
    readdirSync: fsMocks.readdirSync,
    existsSync: fsMocks.existsSync,
    statSync: fsMocks.statSync,
  }
})

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => '/Users/testuser',
      platform: () => 'darwin',
      arch: () => 'arm64',
      totalmem: () => 16 * 1024 * 1024 * 1024,
      release: () => '25.2.0',
      userInfo: () => ({ username: 'testuser' }),
    },
    homedir: () => '/Users/testuser',
    platform: () => 'darwin',
    arch: () => 'arm64',
    totalmem: () => 16 * 1024 * 1024 * 1024,
    release: () => '25.2.0',
    userInfo: () => ({ username: 'testuser' }),
  }
})

vi.mock('zlib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zlib')>()
  return {
    ...actual,
    default: { ...actual, gzipSync: zlibMocks.gzipSync },
    gzipSync: zlibMocks.gzipSync,
  }
})

const { generateSupportBundle, registerSupportBundleHandler } = await import(
  '../../main/support-bundle'
)

beforeEach(() => {
  vi.clearAllMocks()

  // Default: all dirs exist, Desktop exists
  fsMocks.existsSync.mockImplementation((p: string) => {
    if (p.includes('Desktop')) return true
    if (p.includes('logs')) return true
    if (p.includes('crash_reports')) return true
    return false
  })

  // Default: empty dirs
  fsMocks.readdirSync.mockReturnValue([])

  // Default stat
  fsMocks.statSync.mockReturnValue({ size: 100 })

  // Reset gzipSync to passthrough
  zlibMocks.gzipSync.mockImplementation((buf: Buffer) => buf)
})

describe('generateSupportBundle', () => {
  it('always includes system-info.json in the bundle', async () => {
    const path = await generateSupportBundle()

    expect(fsMocks.writeFileSync).toHaveBeenCalledOnce()
    expect(path).toContain('entropic-support-')
    expect(path).toContain('.tar.gz')

    const tarBuffer = zlibMocks.gzipSync.mock.calls[0][0] as Buffer
    const tarString = tarBuffer.toString('utf8')
    expect(tarString).toContain('system-info.json')
  })

  it('system-info.json contains expected fields', async () => {
    await generateSupportBundle()

    const tarBuffer = zlibMocks.gzipSync.mock.calls[0][0] as Buffer
    const tarString = tarBuffer.toString('utf8')

    expect(tarString).toContain('"os": "darwin"')
    expect(tarString).toContain('"arch": "arm64"')
    expect(tarString).toContain('"appVersion": "2.0.0-test"')
  })

  it('includes sidecar log files', async () => {
    fsMocks.readdirSync.mockImplementation((dir: string) => {
      if (dir.includes('logs')) return ['sidecar.log', 'sidecar.log.1']
      return []
    })
    fsMocks.readFileSync.mockReturnValue('log line content')

    await generateSupportBundle()

    const tarBuffer = zlibMocks.gzipSync.mock.calls[0][0] as Buffer
    const tarString = tarBuffer.toString('utf8')
    expect(tarString).toContain('logs/sidecar.log')
    expect(tarString).toContain('logs/sidecar.log.1')
  })

  it('includes electron-main log files', async () => {
    fsMocks.readdirSync.mockImplementation((dir: string) => {
      if (dir.includes('logs')) return ['electron-main.log']
      return []
    })
    fsMocks.readFileSync.mockReturnValue('main log content')

    await generateSupportBundle()

    const tarBuffer = zlibMocks.gzipSync.mock.calls[0][0] as Buffer
    const tarString = tarBuffer.toString('utf8')
    expect(tarString).toContain('logs/electron-main.log')
  })

  it('includes crash report JSON files', async () => {
    fsMocks.readdirSync.mockImplementation((dir: string) => {
      if (dir.includes('crash_reports'))
        return ['crash_2026-03-01.json', 'crash_2026-02-28.json']
      return []
    })
    fsMocks.readFileSync.mockReturnValue('{"exception":"test"}')

    await generateSupportBundle()

    const tarBuffer = zlibMocks.gzipSync.mock.calls[0][0] as Buffer
    const tarString = tarBuffer.toString('utf8')
    expect(tarString).toContain('crash_reports/crash_2026-03-01.json')
    expect(tarString).toContain('crash_reports/crash_2026-02-28.json')
  })

  it('strips PII from bundled file contents', async () => {
    fsMocks.readdirSync.mockImplementation((dir: string) => {
      if (dir.includes('logs')) return ['sidecar.log']
      return []
    })
    fsMocks.readFileSync.mockReturnValue(
      'Error at /Users/testuser/.entropic/logs/sidecar.log for user testuser',
    )

    await generateSupportBundle()

    const tarBuffer = zlibMocks.gzipSync.mock.calls[0][0] as Buffer
    const tarString = tarBuffer.toString('utf8')
    expect(tarString).not.toContain('/Users/testuser')
    expect(tarString).toContain('<HOME>')
  })

  it('strips unknown /Users/<name> patterns', async () => {
    fsMocks.readdirSync.mockImplementation((dir: string) => {
      if (dir.includes('logs')) return ['sidecar.log']
      return []
    })
    fsMocks.readFileSync.mockReturnValue('Path: /Users/someone/file.txt')

    await generateSupportBundle()

    const tarBuffer = zlibMocks.gzipSync.mock.calls[0][0] as Buffer
    const tarString = tarBuffer.toString('utf8')
    expect(tarString).not.toContain('/Users/someone')
    expect(tarString).toContain('/Users/<USER>')
  })

  it('skips files larger than 10MB', async () => {
    fsMocks.readdirSync.mockImplementation((dir: string) => {
      if (dir.includes('logs')) return ['sidecar.log']
      return []
    })
    fsMocks.statSync.mockReturnValue({ size: 11 * 1024 * 1024 })

    await generateSupportBundle()

    expect(fsMocks.readFileSync).not.toHaveBeenCalled()
  })

  it('handles missing log directory gracefully', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => {
      if (p.includes('Desktop')) return true
      return false
    })

    const path = await generateSupportBundle()
    expect(path).toContain('entropic-support-')
  })

  it('throws when Desktop directory is missing', async () => {
    fsMocks.existsSync.mockImplementation((p: string) => {
      if (p.includes('Desktop')) return false
      return true
    })
    fsMocks.readdirSync.mockReturnValue([])

    await expect(generateSupportBundle()).rejects.toThrow(
      'Desktop directory not found',
    )
  })

  it('writes output to Desktop with correct filename pattern', async () => {
    const path = await generateSupportBundle()

    expect(path).toMatch(
      /\/Users\/testuser\/Desktop\/entropic-support-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.tar\.gz/,
    )
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      path,
      expect.any(Buffer),
    )
  })

  it('ignores non-crash JSON files in crash_reports', async () => {
    fsMocks.readdirSync.mockImplementation((dir: string) => {
      if (dir.includes('crash_reports'))
        return ['crash_2026-03-01.json', 'notes.txt', 'readme.json']
      return []
    })
    fsMocks.readFileSync.mockReturnValue('{}')

    await generateSupportBundle()

    // readFileSync should only be called for crash_2026-03-01.json
    expect(fsMocks.readFileSync).toHaveBeenCalledOnce()
  })
})

describe('registerSupportBundleHandler', () => {
  it('registers support:bundle IPC handler', async () => {
    const { ipcMain } = await import('electron')

    registerSupportBundleHandler()

    expect(ipcMain.handle).toHaveBeenCalledWith(
      'support:bundle',
      expect.any(Function),
    )
  })
})
