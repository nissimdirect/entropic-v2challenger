import * as Sentry from '@sentry/electron/renderer'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useEngineStore } from './stores/engine'
import { useProjectStore } from './stores/project'
import { useEffectsStore } from './stores/effects'
import { useAudioStore } from './stores/audio'
import { useUndoStore } from './stores/undo'
import { useTimelineStore } from './stores/timeline'
import DropZone from './components/upload/DropZone'
import FileDialog from './components/upload/FileDialog'
import IngestProgress from './components/upload/IngestProgress'
import EffectBrowser from './components/effects/EffectBrowser'
import EffectRack from './components/effects/EffectRack'
import ParamPanel from './components/effects/ParamPanel'
import PreviewCanvas, { type PreviewState } from './components/preview/PreviewCanvas'
import PreviewControls from './components/preview/PreviewControls'
import ExportDialog from './components/export/ExportDialog'
import type { ExportSettings } from './components/export/ExportDialog'
import ExportProgress from './components/export/ExportProgress'
import Timeline from './components/timeline/Timeline'
import HistoryPanel from './components/layout/HistoryPanel'
import type { Asset, EffectInstance } from '../shared/types'
import type { WaveformPeaks } from './components/transport/useWaveform'
import { serializeEffectChain } from '../shared/ipc-serialize'
import { randomUUID } from './utils'
import { saveProject, loadProject, newProject, startAutosave, stopAutosave } from './project-persistence'
import './styles/transport.css'
import './styles/timeline.css'

class SentryErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#ef4444', fontFamily: 'JetBrains Mono, monospace' }}>
          <h2>Something went wrong.</h2>
          <p>The error has been reported. Please restart the application.</p>
        </div>
      )
    }
    return this.props.children
  }
}

function AppInner() {
  const { status, uptime } = useEngineStore()
  const {
    assets,
    effectChain,
    selectedEffectId,
    currentFrame,
    totalFrames,
    isIngesting,
    ingestError,
    projectName,
    addAsset,
    addEffect,
    removeEffect,
    reorderEffect,
    updateParam,
    setMix,
    toggleEffect,
    selectEffect,
    setCurrentFrame,
    setTotalFrames,
    setIngesting,
    setIngestError,
  } = useProjectStore()

  const isDirty = useUndoStore((s) => s.isDirty)

  const { registry, isLoading: effectsLoading, fetchRegistry } = useEffectsStore()

  const audioStore = useAudioStore()

  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const [frameHeight, setFrameHeight] = useState(0)
  const [activeFps, setActiveFps] = useState(30)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportJobId, setExportJobId] = useState<string | null>(null)
  const [isGlobalDragOver, setIsGlobalDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>('empty')
  const [renderError, setRenderError] = useState<string | null>(null)
  const [isTimerPlaying, setIsTimerPlaying] = useState(false)

  // Audio-specific state
  const [hasAudio, setHasAudio] = useState(false)
  const [waveformPeaks, setWaveformPeaks] = useState<WaveformPeaks | null>(null)

  const activeAssetPath = useRef<string | null>(null)
  const isRenderingRef = useRef(false)
  const pendingFrameRef = useRef<number | null>(null)
  const playbackRafRef = useRef<number | null>(null)
  const clockSyncRafRef = useRef<number | null>(null)

  // Window title — show project name + dirty indicator
  useEffect(() => {
    const title = isDirty ? `${projectName} * — Entropic` : `${projectName} — Entropic`
    document.title = title
  }, [projectName, isDirty])

  // Start autosave on mount, stop on unmount
  useEffect(() => {
    startAutosave()
    return () => stopAutosave()
  }, [])

  // Keyboard shortcuts: undo/redo, zoom, save/load/new, split, marker, loop I/O
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when typing in input fields
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      const mod = e.metaKey || e.ctrlKey

      // Undo/Redo
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useUndoStore.getState().undo()
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        useUndoStore.getState().redo()
      }
      // Zoom
      else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        const z = useTimelineStore.getState().zoom
        useTimelineStore.getState().setZoom(z + 10)
      } else if (mod && e.key === '-') {
        e.preventDefault()
        const z = useTimelineStore.getState().zoom
        useTimelineStore.getState().setZoom(z - 10)
      } else if (mod && e.key === '0') {
        e.preventDefault()
        useTimelineStore.getState().setZoom(50)
      }
      // Save/Load/New
      else if (mod && e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        saveProject()
      } else if (mod && e.key === 'o' && !e.shiftKey) {
        e.preventDefault()
        loadProject()
      } else if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        newProject()
      }
      // Split clip at playhead (Cmd+Shift+K)
      else if (mod && e.key === 'k' && e.shiftKey) {
        e.preventDefault()
        const timeline = useTimelineStore.getState()
        const selectedClip = timeline.selectedClipId
        if (selectedClip) {
          timeline.splitClip(selectedClip, timeline.playheadTime)
        }
      }
      // Add marker (Cmd+M)
      else if (mod && e.key === 'm') {
        e.preventDefault()
        const timeline = useTimelineStore.getState()
        timeline.addMarker(timeline.playheadTime, `Marker`, '#f59e0b')
      }
      // Loop in/out (I / O keys)
      else if (e.key === 'i' && !mod) {
        const timeline = useTimelineStore.getState()
        const currentOut = timeline.loopRegion?.out ?? timeline.duration
        if (timeline.playheadTime < currentOut) {
          timeline.setLoopRegion(timeline.playheadTime, currentOut)
        }
      } else if (e.key === 'o' && !mod) {
        const timeline = useTimelineStore.getState()
        const currentIn = timeline.loopRegion?.in ?? 0
        if (timeline.playheadTime > currentIn) {
          timeline.setLoopRegion(currentIn, timeline.playheadTime)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fetch effect registry when engine connects
  useEffect(() => {
    if (status === 'connected') {
      fetchRegistry()
    }
  }, [status, fetchRegistry])

  // Listen for export progress
  useEffect(() => {
    if (typeof window === 'undefined' || !window.entropic) return
    const cleanup = window.entropic.onExportProgress(({ jobId, progress, done, error }) => {
      if (exportJobId && jobId !== exportJobId) return
      setExportProgress(progress)
      if (done) {
        setIsExporting(false)
        setExportJobId(null)
      }
      if (error) {
        setExportError(error)
        setIsExporting(false)
        setExportJobId(null)
      }
    })
    return cleanup
  }, [exportJobId])

  const requestRenderFrame = useCallback(
    async (frame: number, chainOverride?: EffectInstance[]) => {
      if (!window.entropic || !activeAssetPath.current) return

      // If a render is in flight, queue this frame and return.
      // When the in-flight render completes, it will pick up the pending frame.
      if (isRenderingRef.current) {
        pendingFrameRef.current = frame
        return
      }

      isRenderingRef.current = true
      pendingFrameRef.current = null
      setRenderError(null)

      const chain = chainOverride ?? effectChain

      try {
        const res = await window.entropic.sendCommand({
          cmd: 'render_frame',
          path: activeAssetPath.current,
          frame_index: frame,
          chain: serializeEffectChain(chain),
          project_seed: Date.now() % 2147483647,
        })

        if (res.ok && res.frame_data) {
          setFrameDataUrl(`data:image/jpeg;base64,${res.frame_data as string}`)
          if (res.width) setFrameWidth(res.width as number)
          if (res.height) setFrameHeight(res.height as number)
          setPreviewState('ready')
          setRenderError(null)
        } else if (!res.ok) {
          console.error('[Render] frame', frame, 'error:', res.error)

          // Auto-retry once with empty chain to at least show raw frame
          if (chain.length > 0) {
            console.warn('[Render] retrying frame', frame, 'with empty chain')
            isRenderingRef.current = false
            requestRenderFrame(frame, [])
            return
          }

          // Empty chain also failed — show error state
          setRenderError((res.error as string) ?? 'Render failed')
          setPreviewState('error')
        }
      } catch (err) {
        console.error('[Render] frame', frame, 'exception:', err)
        setRenderError(err instanceof Error ? err.message : 'Render failed')
        setPreviewState('error')
      }

      isRenderingRef.current = false

      // Process the most recent pending frame
      const pending = pendingFrameRef.current
      if (pending !== null) {
        pendingFrameRef.current = null
        requestRenderFrame(pending)
      }
    },
    [effectChain],
  )

  // Render immediately on frame or chain change — no debounce
  useEffect(() => {
    if (!activeAssetPath.current) return
    requestRenderFrame(currentFrame)
  }, [currentFrame, effectChain, requestRenderFrame])

  // Load waveform data after audio is loaded
  const loadWaveform = useCallback(async (path: string) => {
    if (!window.entropic) return
    try {
      const res = await window.entropic.sendCommand({
        cmd: 'waveform',
        path,
        num_bins: 800,
      })
      if (res.ok && res.peaks) {
        setWaveformPeaks(res.peaks as WaveformPeaks)
      }
    } catch (err) {
      console.warn('[Audio] waveform load failed:', err)
    }
  }, [])

  const handleFileIngest = useCallback(
    async (path: string) => {
      if (!window.entropic) return

      setIngesting(true)
      setIngestError(null)
      setPreviewState('loading')

      const res = await window.entropic.sendCommand({
        cmd: 'ingest',
        path,
      })

      if (res.ok) {
        const assetHasAudio = res.has_audio as boolean
        const asset: Asset = {
          id: randomUUID(),
          path,
          type: 'video',
          meta: {
            width: res.width as number,
            height: res.height as number,
            duration: res.duration_s as number,
            fps: res.fps as number,
            codec: res.codec as string,
            hasAudio: assetHasAudio,
          },
        }
        addAsset(asset)
        setTotalFrames(res.frame_count as number)
        setFrameWidth(res.width as number)
        setFrameHeight(res.height as number)
        setActiveFps(res.fps as number)
        activeAssetPath.current = path
        setCurrentFrame(0)
        setHasAudio(assetHasAudio)

        // Load audio if present
        if (assetHasAudio) {
          const audioLoaded = await audioStore.loadAudio(path)
          if (audioLoaded) {
            await audioStore.setFps(res.fps as number)
            loadWaveform(path)
          } else {
            console.warn('[Audio] failed to load audio, falling back to silent playback')
            setHasAudio(false)
          }
        } else {
          // Reset audio state for silent video
          audioStore.reset()
          setWaveformPeaks(null)
        }

        // BUG-3 fix: render frame 0 with empty chain first (guaranteed success).
        // This ensures the user sees the video immediately regardless of effects.
        // The useEffect hook will then trigger a re-render with the current effectChain.
        await requestRenderFrame(0, [])
      } else {
        setIngestError(res.error as string)
        setPreviewState('empty')
      }

      setIngesting(false)
    },
    [addAsset, setTotalFrames, setCurrentFrame, setIngesting, setIngestError, requestRenderFrame, audioStore, loadWaveform],
  )

  const handleRenderRetry = useCallback(() => {
    if (!activeAssetPath.current) return
    setPreviewState('loading')
    requestRenderFrame(currentFrame, [])
  }, [currentFrame, requestRenderFrame])

  const handleSeek = useCallback(
    (frame: number) => {
      setCurrentFrame(frame)
      // Sync audio seek when audio is active
      if (hasAudio && audioStore.isLoaded && activeFps > 0) {
        audioStore.seek(frame / activeFps)
      }
    },
    [setCurrentFrame, hasAudio, audioStore, activeFps],
  )

  const handleAudioSeek = useCallback(
    (time: number) => {
      if (activeFps > 0) {
        const frame = Math.floor(time * activeFps)
        setCurrentFrame(frame)
      }
      audioStore.seek(time)
    },
    [setCurrentFrame, activeFps, audioStore],
  )

  // Timeline playhead seek — syncs audio position and video frame
  const handleTimelineSeek = useCallback(
    (time: number) => {
      if (activeFps > 0) {
        const frame = Math.floor(time * activeFps)
        setCurrentFrame(frame)
      }
      useTimelineStore.getState().setPlayheadTime(time)
      if (hasAudio && audioStore.isLoaded) {
        audioStore.seek(time)
      }
    },
    [setCurrentFrame, activeFps, hasAudio, audioStore],
  )

  const handlePlayPause = useCallback(() => {
    if (hasAudio && audioStore.isLoaded) {
      // Audio-driven playback: toggle audio, video follows via clock sync
      audioStore.togglePlayback()
    } else {
      // Silent video: use timer-based playback (existing behavior)
      setIsTimerPlaying((prev) => !prev)
    }
  }, [hasAudio, audioStore])

  // Clock sync loop: when audio is playing, poll audio position at ~60Hz
  // and drive video frame from audio clock (audio is master, video is slave)
  useEffect(() => {
    if (!hasAudio || !audioStore.isPlaying) {
      if (clockSyncRafRef.current !== null) {
        cancelAnimationFrame(clockSyncRafRef.current)
        clockSyncRafRef.current = null
      }
      return
    }

    let lastFrame = -1

    const tick = async () => {
      await audioStore.syncClock()
      const { targetFrame, currentTime } = useAudioStore.getState()
      if (targetFrame !== lastFrame) {
        lastFrame = targetFrame
        setCurrentFrame(targetFrame)
        useTimelineStore.getState().setPlayheadTime(currentTime)
      }

      // Loop region: when playhead reaches loop out, jump back to loop in
      const loopRegion = useTimelineStore.getState().loopRegion
      if (loopRegion && currentTime >= loopRegion.out) {
        audioStore.seek(loopRegion.in)
        useTimelineStore.getState().setPlayheadTime(loopRegion.in)
      }

      clockSyncRafRef.current = requestAnimationFrame(tick)
    }

    clockSyncRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (clockSyncRafRef.current !== null) {
        cancelAnimationFrame(clockSyncRafRef.current)
        clockSyncRafRef.current = null
      }
    }
  }, [hasAudio, audioStore.isPlaying, setCurrentFrame, audioStore])

  // Timer-based playback loop for silent videos (no audio)
  // Only runs when there's no audio to drive the clock
  useEffect(() => {
    if (!isTimerPlaying || totalFrames === 0) return

    const frameDuration = 1000 / activeFps
    let lastFrameTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - lastFrameTime
      if (elapsed >= frameDuration) {
        const framesToAdvance = Math.max(1, Math.floor(elapsed / frameDuration))
        lastFrameTime = now - (elapsed % frameDuration)
        const current = useProjectStore.getState().currentFrame
        const nextFrame = (current + framesToAdvance) % totalFrames
        setCurrentFrame(nextFrame)
      }
      playbackRafRef.current = requestAnimationFrame(tick)
    }

    playbackRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (playbackRafRef.current !== null) {
        cancelAnimationFrame(playbackRafRef.current)
        playbackRafRef.current = null
      }
    }
  }, [isTimerPlaying, totalFrames, activeFps, setCurrentFrame])

  const handleExport = useCallback(
    async (settings: ExportSettings) => {
      if (!window.entropic || !activeAssetPath.current) return

      setShowExportDialog(false)
      setIsExporting(true)
      setExportProgress(0)
      setExportError(null)

      const res = await window.entropic.sendCommand({
        cmd: 'export_start',
        input_path: activeAssetPath.current,
        output_path: settings.outputPath,
        chain: serializeEffectChain(effectChain),
        project_seed: 42,
      })

      if (res.ok) {
        setExportJobId(res.job_id as string)
      } else {
        setExportError(res.error as string)
        setIsExporting(false)
      }
    },
    [effectChain, totalFrames],
  )

  const handleExportCancel = useCallback(async () => {
    if (!window.entropic || !exportJobId) return
    await window.entropic.sendCommand({
      cmd: 'export_cancel',
      job_id: exportJobId,
    })
    setIsExporting(false)
    setExportJobId(null)
  }, [exportJobId])

  // Global window drop handler — accepts video drops anywhere
  const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv']

  const dragCountRef = useRef(0)

  const handleGlobalDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current++
    if (!isIngesting) setIsGlobalDragOver(true)
  }, [isIngesting])

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current--
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0
      setIsGlobalDragOver(false)
    }
  }, [])

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current = 0
    setIsGlobalDragOver(false)
    if (isIngesting) return

    const files = e.dataTransfer.files
    if (files.length === 0) return

    const file = files[0]
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setDropError(`Unsupported format: ${ext}. Use ${ALLOWED_EXTENSIONS.join(', ')}`)
      return
    }

    const filePath = window.entropic?.getPathForFile
      ? window.entropic.getPathForFile(file)
      : file.path
    if (filePath) {
      setDropError(null)
      handleFileIngest(filePath)
    } else {
      setDropError('Could not resolve file path. Try using the file picker instead.')
    }
  }, [isIngesting, handleFileIngest])

  const hasAssets = Object.keys(assets).length > 0
  const selectedEffect = effectChain.find((e) => e.id === selectedEffectId) ?? null
  const selectedEffectInfo = selectedEffect
    ? registry.find((r) => r.id === selectedEffect.effectId) ?? null
    : null

  // Determine playback state: audio-driven or timer-driven
  const isPlaying = hasAudio ? audioStore.isPlaying : isTimerPlaying

  const statusColor: Record<string, string> = {
    connected: '#4ade80',
    disconnected: '#ef4444',
    restarting: '#f59e0b',
  }

  const statusLabel: Record<string, string> = {
    connected: 'Engine: Connected',
    disconnected: 'Engine: Disconnected',
    restarting: 'Engine: Restarting...',
  }

  return (
    <div
      className="app"
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      {isGlobalDragOver && (
        <div className="app__drop-overlay">
          <span>Drop video file here</span>
        </div>
      )}
      <div className="app__sidebar">
        {!hasAssets && (
          <div className="app__upload">
            <DropZone onFileDrop={handleFileIngest} disabled={isIngesting} />
            <FileDialog onFileSelect={handleFileIngest} disabled={isIngesting} />
            <IngestProgress isIngesting={isIngesting} error={ingestError} />
          </div>
        )}
        {(dropError || (hasAssets && ingestError)) && (
          <div className="app__error-banner" style={{
            padding: '8px 12px',
            margin: '0 8px 8px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 6,
            color: '#ef4444',
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
          }}>
            {dropError || ingestError}
          </div>
        )}
        {hasAssets && (
          <div className="app__asset-info">
            {Object.values(assets).map((asset) => (
              <div key={asset.id} className="asset-badge">
                <span className="asset-badge__name">{asset.path.split('/').pop()}</span>
                <span className="asset-badge__meta">
                  {asset.meta.width}x{asset.meta.height} | {asset.meta.fps}fps
                </span>
              </div>
            ))}
            <FileDialog onFileSelect={handleFileIngest} disabled={isIngesting} label="Replace" />
          </div>
        )}
        <EffectBrowser
          registry={registry}
          isLoading={effectsLoading}
          onAddEffect={addEffect}
          chainLength={effectChain.length}
        />
        <EffectRack
          chain={effectChain}
          registry={registry}
          selectedEffectId={selectedEffectId}
          onSelect={selectEffect}
          onToggle={toggleEffect}
          onRemove={removeEffect}
          onReorder={reorderEffect}
        />
        <HistoryPanel />
      </div>

      <div className="app__main">
        <div className="app__preview">
          <PreviewCanvas
            frameDataUrl={frameDataUrl}
            width={frameWidth}
            height={frameHeight}
            previewState={previewState}
            renderError={renderError}
            onRetry={handleRenderRetry}
          />
          <PreviewControls
            currentFrame={currentFrame}
            totalFrames={totalFrames}
            fps={activeFps}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlayPause={handlePlayPause}
            hasAudio={hasAudio}
            volume={audioStore.volume}
            isMuted={audioStore.isMuted}
            onVolumeChange={(v) => audioStore.setVolume(v)}
            onToggleMute={() => audioStore.toggleMute()}
            waveformPeaks={waveformPeaks}
            audioDuration={audioStore.duration}
            audioCurrentTime={audioStore.currentTime}
            onAudioSeek={handleAudioSeek}
          />
        </div>
        <div className="app__params">
          <ParamPanel
            effect={selectedEffect}
            effectInfo={selectedEffectInfo}
            onUpdateParam={updateParam}
            onSetMix={setMix}
          />
        </div>
        <ExportProgress
          isExporting={isExporting}
          progress={exportProgress}
          error={exportError}
          onCancel={handleExportCancel}
        />
      </div>

      <div className="app__timeline">
        <Timeline onSeek={handleTimelineSeek} />
      </div>

      <div className="status-bar">
        <div className="status-bar__left">
          <div
            className="status-indicator"
            style={{ backgroundColor: statusColor[status] }}
          />
          <span className="status-text">{statusLabel[status]}</span>
          {status === 'connected' && uptime !== undefined && (
            <span className="uptime">Uptime: {uptime}s</span>
          )}
        </div>
        <div className="status-bar__right">
          {hasAssets && (
            <button
              className="export-btn"
              onClick={() => setShowExportDialog(true)}
              disabled={isExporting}
            >
              Export
            </button>
          )}
        </div>
      </div>

      <ExportDialog
        isOpen={showExportDialog}
        totalFrames={totalFrames}
        onExport={handleExport}
        onClose={() => setShowExportDialog(false)}
      />
    </div>
  )
}

export default function App() {
  return (
    <SentryErrorBoundary>
      <AppInner />
    </SentryErrorBoundary>
  )
}
