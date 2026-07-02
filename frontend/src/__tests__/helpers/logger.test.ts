/**
 * Logger tests — JSON line output, PII stripping, rotation.
 * Sprint 2A.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appendFileSync: vi.fn(),
  statSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: { ...actual, ...mocks },
    appendFileSync: mocks.appendFileSync,
    statSync: mocks.statSync,
    renameSync: mocks.renameSync,
    mkdirSync: mocks.mkdirSync,
    existsSync: mocks.existsSync,
  }
})

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => '/Users/testuser',
      userInfo: () => ({ username: 'testuser' }),
    },
    homedir: () => '/Users/testuser',
    userInfo: () => ({ username: 'testuser' }),
  }
})

const { logger } = await import('../../main/logger')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.existsSync.mockReturnValue(false)
  mocks.statSync.mockReturnValue({ size: 0 })
})

describe('logger', () => {
  it('writes valid JSON with expected fields', () => {
    logger.info('test message')

    expect(mocks.appendFileSync).toHaveBeenCalledOnce()
    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())

    expect(entry).toHaveProperty('timestamp')
    expect(entry.level).toBe('INFO')
    expect(entry.message).toBe('test message')
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
  })

  it('includes data when provided', () => {
    logger.info('with data', { port: 5555, status: 'ok' })

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())

    expect(entry.data).toEqual({ port: 5555, status: 'ok' })
  })

  it('writes correct level for warn', () => {
    logger.warn('warning message')

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())
    expect(entry.level).toBe('WARN')
  })

  it('writes correct level for error', () => {
    logger.error('error message')

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())
    expect(entry.level).toBe('ERROR')
  })

  it('strips home directory from messages', () => {
    logger.info('File at /Users/testuser/.entropic/logs/sidecar.log')

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())

    expect(entry.message).not.toContain('/Users/testuser')
    expect(entry.message).toContain('<HOME>')
  })

  it('strips username from messages', () => {
    logger.info('User testuser started session')

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())

    expect(entry.message).not.toContain('testuser')
    expect(entry.message).toContain('<USER>')
  })

  it('strips PII from data values', () => {
    logger.info('path info', { path: '/Users/testuser/.entropic/file.txt' })

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())

    expect(JSON.stringify(entry.data)).not.toContain('testuser')
  })

  it('strips /Users/<name> patterns even for unknown users', () => {
    logger.info('Error at /Users/otheruser/projects/app.js')

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    const entry = JSON.parse(written.trim())

    expect(entry.message).not.toContain('otheruser')
    expect(entry.message).toContain('/Users/<USER>')
  })

  it('triggers rotation when log exceeds 5MB', () => {
    mocks.existsSync.mockReturnValue(true)
    mocks.statSync.mockReturnValue({ size: 6 * 1024 * 1024 })

    logger.info('should trigger rotation')

    expect(mocks.renameSync).toHaveBeenCalled()
  })

  it('does not rotate when log is under 5MB', () => {
    mocks.existsSync.mockImplementation((p: string) =>
      p.endsWith('electron-main.log'),
    )
    mocks.statSync.mockReturnValue({ size: 1024 })

    logger.info('small log')

    expect(mocks.renameSync).not.toHaveBeenCalled()
  })

  it('does not throw when appendFileSync fails', () => {
    mocks.appendFileSync.mockImplementation(() => {
      throw new Error('disk full')
    })

    expect(() => logger.info('should not throw')).not.toThrow()
  })

  it('does not throw when mkdirSync fails', () => {
    mocks.mkdirSync.mockImplementation(() => {
      throw new Error('permission denied')
    })

    expect(() => logger.info('should not throw')).not.toThrow()
  })

  it('each log line ends with newline', () => {
    logger.info('test')

    const written = mocks.appendFileSync.mock.calls[0][1] as string
    expect(written.endsWith('\n')).toBe(true)
  })
})
