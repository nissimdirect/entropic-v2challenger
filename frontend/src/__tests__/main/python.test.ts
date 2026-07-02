/**
 * F6 — CREATRIX_APP_MODE provenance signal for the Python sidecar.
 *
 * Before this change, spawnPython() never told the sidecar whether it was
 * spawned from a packaged build, a dev launch, or an automated e2e test run
 * (frontend/tests/e2e/fixtures/electron-app.fixture.ts sets NODE_ENV=test on
 * the Electron process, but nothing forwarded a distinguishing signal to the
 * Python child on purpose). backend/src/audio/bake_log.py reads
 * CREATRIX_APP_MODE to tag each bake-log line so scripts/check_bake_gate.py
 * can exclude automated-test sessions from the real-usage clock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/mock/app'),
  },
}))

vi.mock('../../main/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
}

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', () => {
  const mod = {
    spawn: (...args: unknown[]) => spawnMock(...args),
    execSync: vi.fn(() => '/usr/bin/python3'),
  }
  return { ...mod, default: mod }
})

import { resolveAppMode, spawnPython } from '../../main/python'
import { app } from 'electron'

describe('resolveAppMode', () => {
  it('returns "test" when NODE_ENV=test, regardless of isPackaged', () => {
    // The e2e fixture launches the unpacked dev build (isPackaged=false)
    // with NODE_ENV=test — this must classify as "test", not "dev".
    expect(resolveAppMode(false, 'test')).toBe('test')
    expect(resolveAppMode(true, 'test')).toBe('test')
  })

  it('returns "packaged" when isPackaged=true and NODE_ENV is not "test"', () => {
    expect(resolveAppMode(true, undefined)).toBe('packaged')
    expect(resolveAppMode(true, 'production')).toBe('packaged')
  })

  it('returns "dev" when isPackaged=false and NODE_ENV is not "test"', () => {
    expect(resolveAppMode(false, undefined)).toBe('dev')
    expect(resolveAppMode(false, 'development')).toBe('dev')
  })
})

describe('spawnPython env wiring', () => {
  let fakeChild: FakeChildProcess

  beforeEach(() => {
    vi.clearAllMocks()
    fakeChild = new FakeChildProcess()
    spawnMock.mockReturnValue(fakeChild)
  })

  function resolveHandshake(): void {
    fakeChild.stdout.emit(
      'data',
      Buffer.from('ZMQ_PORT=5555\nZMQ_PING_PORT=5556\nZMQ_TOKEN=abc-123\n'),
    )
  }

  it('passes CREATRIX_APP_MODE="dev" in the spawn env for an unpackaged app', async () => {
    ;(app as unknown as { isPackaged: boolean }).isPackaged = false
    delete process.env.NODE_ENV

    const promise = spawnPython()
    resolveHandshake()
    await promise

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env: Record<string, string> }]
    expect(options.env.CREATRIX_APP_MODE).toBe('dev')
  })

  it('passes CREATRIX_APP_MODE="packaged" in the spawn env for a packaged app', async () => {
    ;(app as unknown as { isPackaged: boolean }).isPackaged = true
    delete process.env.NODE_ENV
    // Packaged-build code path reads process.resourcesPath (an Electron-
    // injected global that doesn't exist under vitest's node environment).
    ;(process as unknown as { resourcesPath: string }).resourcesPath = '/mock/resources'

    const promise = spawnPython()
    resolveHandshake()
    await promise

    const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env: Record<string, string> }]
    expect(options.env.CREATRIX_APP_MODE).toBe('packaged')

    ;(app as unknown as { isPackaged: boolean }).isPackaged = false
    delete (process as unknown as { resourcesPath?: string }).resourcesPath
  })

  it('passes CREATRIX_APP_MODE="test" when NODE_ENV=test even though isPackaged=false', async () => {
    // Mirrors the real electron-app.fixture.ts e2e launch condition.
    ;(app as unknown as { isPackaged: boolean }).isPackaged = false
    process.env.NODE_ENV = 'test'

    const promise = spawnPython()
    resolveHandshake()
    await promise

    const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env: Record<string, string> }]
    expect(options.env.CREATRIX_APP_MODE).toBe('test')

    delete process.env.NODE_ENV
  })

  it('still inherits the rest of process.env alongside CREATRIX_APP_MODE', async () => {
    ;(app as unknown as { isPackaged: boolean }).isPackaged = false
    delete process.env.NODE_ENV
    process.env.CREATRIX_F6_TEST_MARKER = 'present'

    const promise = spawnPython()
    resolveHandshake()
    await promise

    const [, , options] = spawnMock.mock.calls[0] as [string, string[], { env: Record<string, string> }]
    expect(options.env.CREATRIX_F6_TEST_MARKER).toBe('present')

    delete process.env.CREATRIX_F6_TEST_MARKER
  })
})
