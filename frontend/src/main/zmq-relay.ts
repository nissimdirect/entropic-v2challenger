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
  // Orphaned-mask-sidecar GC — backend handler + gc_orphan_sidecars() shipped
  // in #227, but no frontend caller was ever wired despite the commit message
  // (F5 audit finding). Allowlisted so the handler is reachable; the caller
  // (invoke on node-delete with the live node-id set) is a documented
  // follow-up, not built here.
  'mask_gc_sidecars',
  // MK.12 — AI subject matte (local RVM) offline bake job — stores/aiMatte.ts
  'mask_ai_generate', 'mask_ai_status', 'mask_ai_cancel',
  // Audio track clear — audio_mixer.clear() companion to audio_tracks_set,
  // needed by the EXPERIMENTAL_AUDIO_TRACKS flag work (F5 audit finding).
  'audio_tracks_clear',
  // Text-layer live preview — handler + dedicated tests (test_zmq_text.py)
  // shipped in phase12; not yet called by the renderer (text overlays
  // currently composite via apply_chain/render_composite, which calls the
  // render_text_frame() function directly, not this IPC command). Allowlisted
  // per the F5 audit decision — plausibly upcoming (isolated text preview),
  // not superseded.
  'render_text_frame',
  // Health
  'ping',
])

/**
 * Backend `zmq_server.py` dispatch commands that are intentionally NOT
 * relayed from the renderer — every command registered in the backend's
 * `handle_message()` dispatch table must appear in either ALLOWED_COMMANDS
 * or here. Enforced by the bidirectional half of relay-allowlist.test.ts
 * (task F5) so a new backend handler without an explicit wire/exclude
 * decision fails the test instead of silently going unreachable.
 */
export const BACKEND_ONLY_COMMANDS = new Set([
  // Main-process only — sent directly by Electron main on app quit, never
  // relayed from the renderer.
  'shutdown',
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

/**
 * Serialization gate for the single persistent REQ socket (#429).
 *
 * ROOT-CAUSE CHAIN: playback tick → App.tsx requestRenderFrame → preload
 * `ipcRenderer.invoke('send-command')` → ipcMain 'send-command' handler →
 * sendZmqCommand → ONE shared `persistentSocket` (getOrCreateSocket) →
 * backend zmq_server.py. The renderer's `isRenderingRef` only serializes
 * render calls against each OTHER — it does nothing about the interval-driven
 * pollers (audio meter useAudioMeterPoll, memory-pressure useMemoryPressurePoll,
 * aiMatte, timeline probe-ipc) that also call `send-command` on the SAME socket.
 * A zeromq.js REQ socket permits exactly one send→recv exchange at a time;
 * concurrent callers produce "Socket is busy writing; only one send operation
 * may be in progress" and, once REQ send/recv alternation is broken,
 * "Operation cannot be accomplished in current state". A recv that times out
 * while another caller has already sent leaves the socket unusable and the old
 * error path closed it out from under the in-flight caller ("Socket is closed").
 *
 * FIX: chain every socket exchange onto a single tail promise so exchanges run
 * strictly FIFO — never more than one in flight. Because a timed-out/errored
 * exchange holds the lock while it discards + recreates the socket, no other
 * caller can be mid-flight when that happens, which is what makes
 * close-on-error safe.
 */
let sendChain: Promise<unknown> = Promise.resolve()

function enqueueExchange<T>(fn: () => Promise<T>): Promise<T> {
  // Run `fn` after whatever is currently queued, regardless of that prior
  // exchange's outcome (success OR failure), so one bad exchange never wedges
  // the queue.
  const run = sendChain.then(fn, fn)
  // Keep the tail from carrying a rejection forward; swallow so the next link
  // always fires. Callers still receive `run`'s real resolution/rejection.
  sendChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Perform ONE send→recv exchange. Only ever called while holding the
 *  serialization lock (via enqueueExchange), so the socket is exclusive. */
async function doExchange(command: Record<string, unknown>): Promise<Record<string, unknown>> {
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
    // Discard the socket so the next exchange creates a fresh one — a timed-out
    // REQ recv leaves the socket in an unrecoverable state, and recreating it is
    // the only way to keep the relay usable for the NEXT request (#429). The
    // serialization lock guarantees no other EXCHANGE is mid-flight at this
    // point, so this close cannot race a concurrent send/recv. It does NOT stop
    // lifecycle callers (reconnectRelay, closeRelay, setRelayPort) from calling
    // closePersistentSocket() OUTSIDE the lock — but that is not a data race
    // either: an in-flight exchange simply observes the socket vanish and
    // self-heals by recreating it on the next call.
    closePersistentSocket()
    return {
      id: command.id as string,
      ok: false,
      error: humanizeError(err),
    }
  }
}

async function sendZmqCommand(command: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (currentPort === 0 || !currentToken) {
    return { id: command.id as string, ok: false, error: 'Engine not connected' }
  }

  const isRender = RENDER_COMMANDS.has(command.cmd as string)
  if (isRender) {
    setRenderInFlight(true)
  }

  try {
    return await enqueueExchange(() => doExchange(command))
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
