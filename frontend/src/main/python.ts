import { ChildProcess, spawn, execSync } from 'child_process'
import path from 'path'
import { app } from 'electron'
import { parseZmqPort } from './utils'

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

export function spawnPython(): Promise<number> {
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

    console.log(`[Python] isDev=${isDev} backendDir=${backendDir}`)
    console.log(`[Python] pythonPath=${pythonPath}`)
    console.log(`[Python] args=${args}`)

    const srcDir = path.join(backendDir, 'src')
    pythonProcess = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: srcDir,
    })

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[Python] ${data}`)
    })

    const timeout = setTimeout(() => {
      reject(new Error('Python failed to report ZMQ port within 10s'))
    }, 10_000)

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      const port = parseZmqPort(data.toString())
      if (port !== null) {
        clearTimeout(timeout)
        resolve(port)
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
