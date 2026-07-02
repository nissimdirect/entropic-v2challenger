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
    pythonProcess = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: srcDir,
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
