import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import { app } from 'electron'
import { parseZmqPort } from './utils'

let pythonProcess: ChildProcess | null = null

export function spawnPython(): Promise<number> {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged
    const frontendDir = app.getAppPath()
    const backendDir = isDev
      ? path.join(frontendDir, '..', 'backend')
      : path.join(process.resourcesPath, 'backend')

    const pythonPath = isDev
      ? path.join(backendDir, '.venv', 'bin', 'python')
      : path.join(backendDir, 'main')

    const args = isDev ? [path.join(backendDir, 'src', 'main.py')] : []

    pythonProcess = spawn(pythonPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
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
