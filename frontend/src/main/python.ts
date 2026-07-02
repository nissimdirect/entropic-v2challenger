import { ChildProcess, spawn, execSync } from 'child_process'
import path from 'path'
import { app } from 'electron'
import { parseZmqPort, parseZmqPingPort, parseZmqToken } from './utils'
import { logger } from './logger'

let pythonProcess: ChildProcess | null = null

function findPython(_backendDir: string): string {
  // Use system python3 — venv exists but has incomplete deps in dev.
  // In production builds, the bundled binary is used instead.
  try {
    const systemPython = execSync('which python3', { encoding: 'utf-8' }).trim()
    if (systemPython) return systemPython
  } catch { /* ignore */ }

  return 'python3'
}

export interface PythonPorts {
  port: number
  pingPort: number
  token: string
}

/**
 * Resolve the app-mode provenance tag passed to the Python sidecar as
 * CREATRIX_APP_MODE. Read by backend/src/audio/bake_log.py so the audio
 * bake-gate (scripts/check_bake_gate.py) can exclude automated-test sessions
 * from the real-usage clock (F6 audit finding).
 *
 * NODE_ENV=test takes priority over isPackaged: Playwright's electron-e2e
 * fixture launches the unpacked dev build (app.isPackaged is false) with
 * NODE_ENV=test set on the Electron process env
 * (frontend/tests/e2e/fixtures/electron-app.fixture.ts) — without this
 * priority, e2e sessions would misclassify as "dev" real usage instead of
 * "test".
 */
export function resolveAppMode(isPackaged: boolean, nodeEnv: string | undefined): string {
  if (nodeEnv === 'test') return 'test'
  return isPackaged ? 'packaged' : 'dev'
}

export function spawnPython(): Promise<PythonPorts> {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged

    // In electron-vite dev, __dirname is the compiled out/main/ dir.
    // Walk up to find the monorepo root (parent of frontend/).
    const frontendRoot = isDev
      ? path.resolve(__dirname, '..', '..')
      : app.getAppPath()
    const backendDir = isDev
      ? path.join(frontendRoot, '..', 'backend')
      : path.join(process.resourcesPath, 'backend')

    const pythonPath = isDev
      ? findPython(backendDir)
      : path.join(backendDir, 'main')

    const args = isDev ? [path.join(backendDir, 'src', 'main.py')] : []

    logger.info('[Python] spawn config', { isDev, backendDir, pythonPath, args })

    const srcDir = path.join(backendDir, 'src')
    const appMode = resolveAppMode(app.isPackaged, process.env.NODE_ENV)
    pythonProcess = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: srcDir,
      env: { ...process.env, CREATRIX_APP_MODE: appMode },
    })

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      logger.error('[Python] stderr', { output: data.toString().trim() })
    })

    const timeout = setTimeout(() => {
      reject(new Error('Python failed to report ZMQ ports within 10s'))
    }, 10_000)

    let foundPort: number | null = null
    let foundPingPort: number | null = null
    let foundToken: string | null = null
    let stdoutBuffer = ''

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString()
      if (foundPort === null) foundPort = parseZmqPort(stdoutBuffer)
      if (foundPingPort === null) foundPingPort = parseZmqPingPort(stdoutBuffer)
      if (foundToken === null) foundToken = parseZmqToken(stdoutBuffer)

      if (foundPort !== null && foundPingPort !== null && foundToken !== null) {
        clearTimeout(timeout)
        resolve({ port: foundPort, pingPort: foundPingPort, token: foundToken })
      }
    })

    pythonProcess.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })

    pythonProcess.on('exit', (code: number | null) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`Python exited with code ${code}`))
      }
    })
  })
}

export function killPython(): void {
  if (pythonProcess) {
    pythonProcess.kill('SIGTERM')
    pythonProcess = null
  }
}
