import { ipcMain, dialog, BrowserWindow, type SaveDialogOptions } from 'electron'
import { Request } from 'zeromq'
import { randomUUID } from 'crypto'
import { extname } from 'node:path'
import { setRenderInFlight } from './watchdog'
import { logger } from './logger'
import { FF } from '../shared/feature-flags'

const ZMQ_TIMEOUT = 10_000
const EXPORT_POLL_INTERVAL = 500

/** Map technical error messages to user-friendly descriptions (Phase 12). */
function humanizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('timed out') || msg.includes('ETIMEDOUT') || msg.includes('timeout'))
    return 'Engine took too long to respond. Try removing the last effect or reducing chain length.'
  if (msg.includes('ECONNREFUSED') || msg.includes('connect'))
    return 'Could not connect to the engine. It may be restarting — try again in a moment.'
  if (msg.includes('EPIPE') || msg.includes('broken pipe'))
    return 'Lost connection to the engine. It will restart automatically.'
  if (msg.includes('memory') || msg.includes('MemoryError'))
    return 'Engine ran out of memory. Try removing effects or using a smaller video.'
  if (msg.includes('decode') || msg.includes('codec'))
    return 'Could not decode the video. The file may be corrupt or use an unsupported codec.'
  return `Engine error: ${msg}`
}

/** Commands that trigger heavy Python work and may block pings (BUG-4). */
const RENDER_COMMANDS = new Set(['render_frame', 'apply_chain', 'export_start'])

/**
 * Commands the renderer is allowed to send to the Python engine.
 * Adding a new Python handler requires a corresponding entry here.
 * NOTE: 'shutdown' is intentionally excluded — it is main-process only.
 *
 * CONTRACT: every literal cmd value sent from frontend/src/renderer/** must
 * appear in this set. The contract test in
 * src/__tests__/contracts/relay-allowlist.test.ts enforces this automatically.
 */
export const ALLOWED_COMMANDS = new Set([
  // Playback & rendering
  'render_frame', 'render_composite', 'apply_chain', 'seek',
  // Ingest & info
  'ingest', 'thumbnails', 'list_effects', 'effect_health', 'effect_stats',
  // Export
  'export_start', 'export_cancel', 'export_status',
  // Export — single-frame PNG (task #89 cohesion fix)
  'export_frame',
  // Audio playback & metering
  'audio_decode', 'audio_load', 'audio_play', 'audio_pause',
  'audio_stop', 'audio_seek', 'audio_volume', 'audio_position', 'waveform',
  // Audio meter poll — stores/audio.ts (task #89 cohesion fix)
  'audio_meter',
  // Audio track sync — audio-bridge.ts (task #89 cohesion fix)
  'audio_tracks_set',
  // Clock
  'clock_sync', 'clock_set_fps',
  // Project clock — audio-bridge.ts (task #89 cohesion fix)
  'project_clock_play', 'project_clock_pause', 'project_clock_seek',
  'project_clock_set_duration', 'project_clock_state',
  // Freeze & cache
  'freeze_prefix', 'read_freeze', 'flatten', 'invalidate_cache',
  // Performance freeze bake — App.tsx + stores/performanceFreeze.ts (task #89 cohesion fix)
  'bake_performance_track',
  // State
  'flush_state', 'memory_status',
  // P5b.1 (SG-8) — memory-pressure poll
  'pressure_status',
  // Routing
  'check_dag',
  // P6.8 (I1) Inspector probes — registry lifecycle + snapshot polling
  'probe_register', 'probe_unregister', 'probe_mount', 'probe_unmount', 'probe_snapshot',
  // P6.9 (I2) Routing Canvas — graph projection + edge update round-trip
  'routing_graph_get', 'routing_edge_update',
  // Font picker — hooks/useFonts.ts (task #89 cohesion fix)
  'list_fonts',
  // Inline actions — components/inline-actions/useInlineActions.ts (task #89 cohesion fix)
  'inline_actions_list', 'inline_actions_invoke',
  // Mask thumbnails — components/device-chain/DeviceCard.tsx (task #89 cohesion fix)
  'mask_thumbnail',
  // Magic-wand mask selection — components/preview/MaskSelectOverlay.tsx (task #89 cohesion fix)
  'mask_wand_sample',
  // Health
  'ping',
])

let currentPort = 0
let currentToken = ''
let persistentSocket: InstanceType<typeof Request> | null = null
let exportPollTimer: ReturnType<typeof setInterval> | null = null

export function setRelayPort(port: number, token: string): void {
  // Close existing socket if port changes
  if (currentPort !== port) {
    closePersistentSocket()
  }
  currentPort = port
  currentToken = token
}

/** Called by watchdog on restart to switch to new Python process. */
export function reconnectRelay(port: number, token: string): void {
  closePersistentSocket()
  currentPort = port
  currentToken = token
}

/** Called on app shutdown to clean up the persistent socket. */
export function closeRelay(): void {
  stopExportPoll()
  closePersistentSocket()
  currentPort = 0
  currentToken = ''
}

function closePersistentSocket(): void {
  if (persistentSocket) {
    try {
      persistentSocket.close()
    } catch {
      /* socket may already be closed */
    }
    persistentSocket = null
  }
}

function getOrCreateSocket(): InstanceType<typeof Request> {
  if (!persistentSocket) {
    persistentSocket = new Request()
    persistentSocket.receiveTimeout = ZMQ_TIMEOUT
    persistentSocket.linger = 0
    persistentSocket.connect(`tcp://127.0.0.1:${currentPort}`)
  }
  return persistentSocket
}

async function sendZmqCommand(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (currentPort === 0 || !currentToken) {
    return { id: command.id as string, ok: false, error: 'Engine not connected' }
  }

  const isRender = RENDER_COMMANDS.has(command.cmd as string)
  if (isRender) {
    setRenderInFlight(true)
  }

  const sock = getOrCreateSocket()

  const tsSend = Date.now()

  try {
    command._token = currentToken
    command._ts_send = tsSend
    await sock.send(JSON.stringify(command))
    const [raw] = await sock.receive()
    const result = JSON.parse(raw.toString())
    const roundtripMs = Date.now() - tsSend
    logger.info('[IPC] command complete', {
      id: command.id,
      cmd: command.cmd,
      roundtrip_ms: roundtripMs,
    })
    return result
  } catch (err) {
    // On error, destroy the socket so the next call creates a fresh one
    closePersistentSocket()
    return {
      id: command.id as string,
      ok: false,
      error: humanizeError(err),
    }
  } finally {
    if (isRender) {
      setRenderInFlight(false)
    }
  }
}

function stopExportPoll(): void {
  if (exportPollTimer) {
    clearInterval(exportPollTimer)
    exportPollTimer = null
  }
}

function startExportPoll(): void {
  stopExportPoll()
  exportPollTimer = setInterval(async () => {
    const res = await sendZmqCommand({ cmd: 'export_status', id: randomUUID() })
    if (!res.ok) return

    const progress = (res.progress as number) ?? 0
    const exportState = res.status as string
    const done = exportState === 'complete' || exportState === 'cancelled'
    const failed = exportState === 'error'
    const error = failed ? (res.error as string) ?? 'Export failed' : undefined

    // P5b.8 (SG-5): forward cycle_warning + cycle_warning_source so the
    // renderer can raise a once-per-job toast (source=sg5-cycle).
    const cycleWarning =
      typeof res.cycle_warning === 'string' && res.cycle_warning.length > 0
        ? (res.cycle_warning as string)
        : undefined
    const cycleWarningSource =
      typeof res.cycle_warning_source === 'string' && res.cycle_warning_source.length > 0
        ? (res.cycle_warning_source as string)
        : undefined

    // task #89 cohesion fix: forward frame-counter / ETA / output-path fields
    // that App.tsx reads at onExportProgress. The export-progress payload is
    // hand-built here (not serialised through the camelCase auto-converter),
    // so snake_case→camelCase must be mapped explicitly.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('export-progress', {
        jobId: null,
        progress,
        done: done || failed,
        error,
        cycleWarning,
        cycleWarningSource,
        currentFrame: res.current_frame as number | undefined,
        totalFrames: res.total_frames as number | undefined,
        etaSeconds: res.eta_seconds as number | undefined,
        outputPath: res.output_path as string | undefined,
      })
    }

    if (done || failed || exportState === 'idle') {
      stopExportPoll()
    }
  }, EXPORT_POLL_INTERVAL)
}

export function registerRelayHandlers(): void {
  ipcMain.handle('send-command', async (_event, command: Record<string, unknown>) => {
    const cmd = command.cmd as string | undefined
    if (!cmd || !ALLOWED_COMMANDS.has(cmd)) {
      return { id: command.id ?? randomUUID(), ok: false, error: `Unknown command: ${cmd}` }
    }
    if (!command.id) {
      command.id = randomUUID()
    }
    const result = await sendZmqCommand(command)

    // Start polling after successful export_start
    if (command.cmd === 'export_start' && result.ok) {
      startExportPoll()
    }

    // Stop polling on export_cancel
    if (command.cmd === 'export_cancel') {
      stopExportPoll()
    }

    return result
  })

  ipcMain.handle('select-file', async (_event, filters: { name: string; extensions: string[] }[]) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters,
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('select-save-path', async (_event, defaultName: string) => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null

    let dialogOptions: SaveDialogOptions
    if (FF.F_0512_23_DERIVED_FILTER) {
      // F-0512-23: derive the dialog filter from the defaultName's extension
      // so image-sequence (no extension) doesn't get forced into ".mp4", and
      // so GIF / MOV / etc. exports honor their own format.
      const defaultExt = extname(defaultName).toLowerCase().replace(/^\./, '')
      dialogOptions = { defaultPath: defaultName }
      if (defaultExt) {
        dialogOptions.filters = [{ name: defaultExt.toUpperCase(), extensions: [defaultExt] }]
      }
    } else {
      // Legacy: filter hardcoded to mp4 regardless of export type.
      dialogOptions = {
        defaultPath: defaultName,
        filters: [{ name: 'Video', extensions: ['mp4'] }],
      }
    }

    const result = await dialog.showSaveDialog(win, dialogOptions)

    if (result.canceled || !result.filePath) return null

    const filePath = result.filePath
    if (FF.F_0512_7_EXPORT_DOUBLE_EXT) {
      // F-0512-7: macOS appends the filter extension even when the user-typed
      // name already ends with it ("foo.mp4" → "foo.mp4.mp4"). Strip the outer
      // copy when the last two extensions are identical.
      const outer = extname(filePath).toLowerCase()
      if (outer && extname(filePath.slice(0, -outer.length)).toLowerCase() === outer) {
        return filePath.slice(0, -outer.length)
      }
    }
    return filePath
  })
}
