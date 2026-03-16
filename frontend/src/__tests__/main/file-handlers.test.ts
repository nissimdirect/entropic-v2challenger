import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { homedir } from 'os'

// Use real homedir for path tests (module-level constants are computed at import time)
const HOME = homedir()
const ENTROPIC = join(HOME, '.entropic')

// Hoisted mocks — shared references between mock factory and test code
const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  lstatSync: vi.fn(() => ({ isSymbolicLink: () => false })),
}))

const mockFileHandle = vi.hoisted(() => ({
  writeFile: vi.fn(),
  sync: vi.fn(),
  close: vi.fn(),
}))

const fsPromiseMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  open: vi.fn(() => Promise.resolve(mockFileHandle)),
  rename: vi.fn(),
  unlink: vi.fn(),
}))

// Mock electron before importing the module under test
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/userData'
      if (name === 'documents') return '/mock/documents'
      if (name === 'desktop') return '/mock/desktop'
      throw new Error(`Unknown path name: ${name}`)
    }),
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn() },
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    default: { ...actual, ...fsPromiseMocks },
    readFile: fsPromiseMocks.readFile,
    open: fsPromiseMocks.open,
    rename: fsPromiseMocks.rename,
    unlink: fsPromiseMocks.unlink,
  }
})

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    default: { ...actual, ...fsMocks },
    existsSync: fsMocks.existsSync,
    lstatSync: fsMocks.lstatSync,
  }
})

import { isPathAllowed, grantPath, clearGrantedPaths, registerFileHandlers } from '../../main/file-handlers'
import { ipcMain } from 'electron'

describe('file-handlers', () => {
  beforeEach(() => {
    clearGrantedPaths()
    // Reset fs mocks to defaults
    fsMocks.existsSync.mockReturnValue(false)
    fsMocks.lstatSync.mockReturnValue({ isSymbolicLink: () => false })
    // Reset file handle mocks
    mockFileHandle.writeFile.mockResolvedValue(undefined)
    mockFileHandle.sync.mockResolvedValue(undefined)
    mockFileHandle.close.mockResolvedValue(undefined)
    fsPromiseMocks.open.mockResolvedValue(mockFileHandle)
    fsPromiseMocks.rename.mockResolvedValue(undefined)
    fsPromiseMocks.unlink.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('isPathAllowed', () => {
    // 1. ~/.entropic/ paths are allowed
    it('allows paths under ~/.entropic/', () => {
      expect(isPathAllowed(join(ENTROPIC, 'crash_reports', 'crash_001.json'))).toBe(true)
    })

    // 2. Traversal out of ~/.entropic/ is denied
    it('denies traversal out of ~/.entropic/', () => {
      expect(isPathAllowed(join(ENTROPIC, '..', '.ssh', 'id_rsa'))).toBe(false)
    })

    // 3. userData paths are allowed
    it('allows paths under userData', () => {
      expect(isPathAllowed('/mock/userData/settings.json')).toBe(true)
    })

    // 4. Arbitrary system paths are denied
    it('denies /etc/passwd', () => {
      expect(isPathAllowed('/etc/passwd')).toBe(false)
    })

    // 5. Traversal attacks are denied
    it('denies traversal attacks', () => {
      expect(isPathAllowed('/home/user/../../etc/shadow')).toBe(false)
    })

    // 6. Dialog-granted paths are allowed
    it('allows dialog-granted paths', () => {
      const testPath = '/tmp/test-project/myfile.glitch'
      grantPath(testPath)
      expect(isPathAllowed(testPath)).toBe(true)
    })

    // 7. Non-granted arbitrary paths are denied
    it('denies non-granted arbitrary paths', () => {
      expect(isPathAllowed('/tmp/random/file.txt')).toBe(false)
    })

    // 8. .autosave.glitch next to granted path is allowed
    it('allows .autosave.glitch sibling of granted path', () => {
      grantPath('/tmp/project/myfile.glitch')
      expect(isPathAllowed('/tmp/project/.autosave.glitch')).toBe(true)
    })

    // 9. .autosave.glitch in unrelated directory is denied
    it('denies .autosave.glitch in unrelated directory', () => {
      grantPath('/tmp/project/myfile.glitch')
      expect(isPathAllowed('/tmp/other/.autosave.glitch')).toBe(false)
    })

    // 13. Empty string is denied
    it('denies empty string', () => {
      expect(isPathAllowed('')).toBe(false)
    })

    // 14. Non-string is denied
    it('denies non-string input', () => {
      expect(isPathAllowed(null as unknown as string)).toBe(false)
      expect(isPathAllowed(undefined as unknown as string)).toBe(false)
      expect(isPathAllowed(42 as unknown as string)).toBe(false)
    })
  })

  describe('registerFileHandlers', () => {
    let handlers: Record<string, (...args: unknown[]) => Promise<unknown>>

    beforeEach(() => {
      handlers = {}
      vi.mocked(ipcMain.handle).mockImplementation((channel: string, handler) => {
        handlers[channel] = handler as (...args: unknown[]) => Promise<unknown>
        return undefined as unknown as Electron.IpcMain
      })
      registerFileHandlers()
    })

    // 10. app:getPath('userData') returns a path
    it('app:getPath returns path for allowed names', async () => {
      const result = await handlers['app:getPath']({} as Electron.IpcMainInvokeEvent, 'userData')
      expect(result).toBe('/mock/userData')
    })

    // 11. app:getPath('home') throws
    it('app:getPath throws for disallowed name "home"', async () => {
      await expect(
        handlers['app:getPath']({} as Electron.IpcMainInvokeEvent, 'home'),
      ).rejects.toThrow(/denied/)
    })

    // 12. app:getPath('exe') throws
    it('app:getPath throws for disallowed name "exe"', async () => {
      await expect(
        handlers['app:getPath']({} as Electron.IpcMainInvokeEvent, 'exe'),
      ).rejects.toThrow(/denied/)
    })

    // Type errors for file operations
    it('file:read throws TypeError for non-string path', async () => {
      await expect(
        handlers['file:read']({} as Electron.IpcMainInvokeEvent, 123),
      ).rejects.toThrow(TypeError)
    })

    it('file:write throws TypeError for non-string path', async () => {
      await expect(
        handlers['file:write']({} as Electron.IpcMainInvokeEvent, 123, 'data'),
      ).rejects.toThrow(TypeError)
    })

    it('file:write throws TypeError for non-string data', async () => {
      await expect(
        handlers['file:write']({} as Electron.IpcMainInvokeEvent, join(ENTROPIC, 'test'), 123),
      ).rejects.toThrow(TypeError)
    })

    it('file:delete throws TypeError for non-string path', async () => {
      await expect(
        handlers['file:delete']({} as Electron.IpcMainInvokeEvent, null),
      ).rejects.toThrow(TypeError)
    })

    // Access denied for ungated paths
    it('file:read throws access denied for non-allowed path', async () => {
      await expect(
        handlers['file:read']({} as Electron.IpcMainInvokeEvent, '/etc/passwd'),
      ).rejects.toThrow(/Access denied/)
    })

    it('file:write throws access denied for non-allowed path', async () => {
      await expect(
        handlers['file:write']({} as Electron.IpcMainInvokeEvent, '/etc/passwd', 'evil'),
      ).rejects.toThrow(/Access denied/)
    })

    it('file:delete throws access denied for non-allowed path', async () => {
      await expect(
        handlers['file:delete']({} as Electron.IpcMainInvokeEvent, '/etc/passwd'),
      ).rejects.toThrow(/Access denied/)
    })

    it('registers all 6 expected channels', () => {
      expect(Object.keys(handlers)).toEqual(
        expect.arrayContaining([
          'dialog:save',
          'dialog:open',
          'file:read',
          'file:write',
          'file:delete',
          'app:getPath',
        ]),
      )
    })

    // Atomic write tests
    it('file:write uses atomic write (open + writeFile + sync + rename)', async () => {
      const testPath = join(ENTROPIC, 'test.glitch')
      await handlers['file:write']({} as Electron.IpcMainInvokeEvent, testPath, '{"data":1}')
      // open() called with unique tmp suffix
      expect(fsPromiseMocks.open).toHaveBeenCalledTimes(1)
      const tmpPath = fsPromiseMocks.open.mock.calls[0][0] as string
      expect(tmpPath).toMatch(new RegExp(`^${testPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.tmp\\.\\d+\\.\\d+$`))
      // fsync called before rename
      expect(mockFileHandle.writeFile).toHaveBeenCalledWith('{"data":1}', 'utf8')
      expect(mockFileHandle.sync).toHaveBeenCalled()
      expect(mockFileHandle.close).toHaveBeenCalled()
      expect(fsPromiseMocks.rename).toHaveBeenCalledWith(tmpPath, testPath)
    })

    it('file:write cleans up .tmp on rename failure', async () => {
      fsPromiseMocks.rename.mockRejectedValueOnce(new Error('rename failed'))
      const testPath = join(ENTROPIC, 'test.glitch')
      await expect(
        handlers['file:write']({} as Electron.IpcMainInvokeEvent, testPath, '{"data":1}'),
      ).rejects.toThrow('rename failed')
      const tmpPath = fsPromiseMocks.open.mock.calls[0][0] as string
      expect(fsPromiseMocks.unlink).toHaveBeenCalledWith(tmpPath)
    })

    it('file:write closes file handle even on write error', async () => {
      mockFileHandle.writeFile.mockRejectedValueOnce(new Error('disk full'))
      const testPath = join(ENTROPIC, 'test.glitch')
      await expect(
        handlers['file:write']({} as Electron.IpcMainInvokeEvent, testPath, 'data'),
      ).rejects.toThrow('disk full')
      expect(mockFileHandle.close).toHaveBeenCalled()
    })
  })

  describe('isPathAllowed — .tmp sibling for atomic writes', () => {
    it('allows .tmp sibling of dialog-granted path', () => {
      grantPath('/tmp/project/myfile.glitch')
      expect(isPathAllowed('/tmp/project/myfile.glitch.tmp')).toBe(true)
    })

    it('denies .tmp for non-granted path', () => {
      expect(isPathAllowed('/tmp/random/file.glitch.tmp')).toBe(false)
    })

    it('allows .tmp.PID.TIMESTAMP sibling of dialog-granted path', () => {
      grantPath('/tmp/project/myfile.glitch')
      expect(isPathAllowed('/tmp/project/myfile.glitch.tmp.12345.1710600000000')).toBe(true)
    })

    it('denies .tmp.PID.TIMESTAMP for non-granted path', () => {
      expect(isPathAllowed('/tmp/random/file.glitch.tmp.12345.1710600000000')).toBe(false)
    })
  })

  describe('isPathAllowed — symlink rejection', () => {
    it('denies symlink paths even under allowed dirs', () => {
      fsMocks.existsSync.mockReturnValue(true)
      fsMocks.lstatSync.mockReturnValue({ isSymbolicLink: () => true })
      expect(isPathAllowed(join(ENTROPIC, 'evil-link'))).toBe(false)
    })

    it('allows non-symlink paths under allowed dirs', () => {
      fsMocks.existsSync.mockReturnValue(true)
      fsMocks.lstatSync.mockReturnValue({ isSymbolicLink: () => false })
      expect(isPathAllowed(join(ENTROPIC, 'legit-file'))).toBe(true)
    })
  })
})
