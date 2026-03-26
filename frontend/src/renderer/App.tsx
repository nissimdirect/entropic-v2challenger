import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useEngineStore } from './stores/engine'
import { useProjectStore } from './stores/project'
import { useEffectsStore } from './stores/effects'
import { useAudioStore } from './stores/audio'
import { useUndoStore } from './stores/undo'
import { useTimelineStore } from './stores/timeline'
import FileDialog from './components/upload/FileDialog'
import IngestProgress from './components/upload/IngestProgress'
import EffectBrowser from './components/effects/EffectBrowser'
// Phase 13C: EffectRack + ParamPanel removed — replaced by DeviceChain
import PreviewCanvas, { type PreviewState } from './components/preview/PreviewCanvas'
import TextPanel from './components/text/TextPanel'
import TextOverlay from './components/text/TextOverlay'
import PreviewControls from './components/preview/PreviewControls'
import ExportDialog from './components/export/ExportDialog'
import type { ExportSettings } from './components/export/ExportDialog'
import ExportProgress from './components/export/ExportProgress'
import Timeline from './components/timeline/Timeline'
// Phase 13C: HistoryPanel removed from sidebar
import DeviceChain from './components/device-chain/DeviceChain'
import TransformPanel from './components/timeline/TransformPanel'
import HelpPanel from './components/effects/HelpPanel'
import type { Asset, EffectInstance } from '../shared/types'
import type { WaveformPeaks } from './components/transport/useWaveform'
import { serializeEffectChain, serializeTextConfig } from '../shared/ipc-serialize'
import { randomUUID } from './utils'
import { shortcutRegistry } from './utils/shortcuts'
import { DEFAULT_SHORTCUTS } from './utils/default-shortcuts'
import { saveProject, loadProject, newProject, startAutosave, stopAutosave, restoreAutosave } from './project-persistence'
import { useSettingsStore } from './stores/settings'
import TelemetryConsentDialog from './components/dialogs/TelemetryConsentDialog'
import CrashRecoveryDialog from './components/dialogs/CrashRecoveryDialog'
import FeedbackDialog from './components/dialogs/FeedbackDialog'
import PerformancePanel from './components/performance/PerformancePanel'
import PadEditor from './components/performance/PadEditor'
import { usePerformanceStore } from './stores/performance'
import { applyPadModulations } from './components/performance/applyPadModulations'
import { applyCCModulations } from './components/performance/applyCCModulations'
import { useMIDIStore } from './stores/midi'
import { useMIDI } from './hooks/useMIDI'
import { handlePadTrigger, releasePadWithCapture } from './components/performance/padActions'
// Operators removed from UI (Sprint 2) — components stay in codebase for future re-enable
import { useOperatorStore } from './stores/operators'
import { useAutomationStore } from './stores/automation'
import { resolveGhostValues } from './utils/resolveGhostValues'
import { evaluateAutomationOverrides } from './utils/evaluateAutomationOverrides'
import AutomationToolbar from './components/automation/AutomationToolbar'
import PresetBrowser from './components/library/PresetBrowser'
import PresetSaveDialog from './components/library/PresetSaveDialog'
import { useLibraryStore } from './stores/library'
import { useFreezeStore } from './stores/freeze'
import { useToastStore } from './stores/toast'
import { useLayoutStore } from './stores/layout'
import Toast from './components/common/Toast'
import Tooltip from './components/common/Tooltip'
import UpdateBanner from './components/layout/UpdateBanner'
import type { Preset } from '../shared/types'
import './styles/transport.css'
import './styles/timeline.css'
import './styles/performance.css'
import './styles/operators.css'
import './styles/automation.css'
import './styles/library.css'
import './styles/toast.css'
import './styles/export.css'
import './styles/text.css'
import './styles/device-chain.css'
import WelcomeScreen from './components/layout/WelcomeScreen'
import Preferences from './components/layout/Preferences'
import AboutDialog from './components/layout/AboutDialog'
import RenderQueue from './components/export/RenderQueue'
import ErrorBoundary from './components/layout/ErrorBoundary'
import { loadRecentProjects, type RecentProject } from './project-persistence'

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
  const isPerformMode = usePerformanceStore((s) => s.isPerformMode)

  // Initialize MIDI (Web MIDI API)
  useMIDI()

  const { registry, isLoading: effectsLoading, fetchRegistry } = useEffectsStore()

  const audioStore = useAudioStore()

  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const [frameHeight, setFrameHeight] = useState(0)
  const [activeFps, setActiveFps] = useState(30)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showRenderQueue, setShowRenderQueue] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportJobId, setExportJobId] = useState<string | null>(null)
  const [exportCurrentFrame, setExportCurrentFrame] = useState(0)
  const [exportTotalFrames, setExportTotalFrames] = useState(0)
  const [exportEta, setExportEta] = useState<number | null>(null)
  const [exportOutputPath, setExportOutputPath] = useState<string | null>(null)
  const [isGlobalDragOver, setIsGlobalDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>('empty')
  const [renderError, setRenderError] = useState<string | null>(null)
  const [isTimerPlaying, setIsTimerPlaying] = useState(false)
  const [operatorValues, setOperatorValues] = useState<Record<string, number>>({})

  // Audio-specific state
  const [hasAudio, setHasAudio] = useState(false)
  const [waveformPeaks, setWaveformPeaks] = useState<WaveformPeaks | null>(null)
  const [clipThumbnails, setClipThumbnails] = useState<{ time: number; data: string }[]>([])

  // Startup diagnostics state
  const { telemetryConsent, consentChecked, checkConsent, setConsent } = useSettingsStore()
  const [crashReports, setCrashReports] = useState<Record<string, unknown>[]>([])
  const [autosavePath, setAutosavePath] = useState<string | null>(null)
  const [startupChecked, setStartupChecked] = useState(false)
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false)
  const [editingPadId, setEditingPadId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'effects' | 'presets'>('effects')
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [showPresetSave, setShowPresetSave] = useState<{ mode: 'single_effect' | 'effect_chain'; instanceId?: string } | null>(null)

  const activeAssetPath = useRef<string | null>(null)
  const isRenderingRef = useRef(false)
  const pendingFrameRef = useRef<number | null>(null)
  const playbackRafRef = useRef<number | null>(null)
  const clockSyncRafRef = useRef<number | null>(null)
  const handlePlayPauseRef = useRef<() => void>(() => {})
  const renderSeqRef = useRef(0)
  const lastDisabledEffectsRef = useRef<string>('')

  // Layout store for sidebar/timeline collapse
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const timelineCollapsed = useLayoutStore((s) => s.timelineCollapsed)

  // Engine store for frame timing
  const lastFrameMs = useEngineStore((s) => s.lastFrameMs)

  // Startup: check telemetry consent, then crash reports + autosave
  useEffect(() => {
    checkConsent().then(async () => {
      if (!window.entropic) {
        setStartupChecked(true)
        return
      }
      try {
        const [reports, autosave] = await Promise.all([
          window.entropic.readCrashReports(),
          window.entropic.findAutosave(),
        ])
        if (reports.length > 0 || autosave) {
          setCrashReports(reports)
          setAutosavePath(autosave)
        }
      } catch {
        // Non-critical — proceed normally
      }
      setStartupChecked(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConsentDecision = useCallback((consent: boolean) => {
    setConsent(consent)
  }, [setConsent])

  const handleCrashRestore = useCallback(async (_sendReport: boolean) => {
    if (autosavePath) {
      await restoreAutosave(autosavePath)
    }
    if (window.entropic) {
      await window.entropic.clearCrashReports()
    }
    setCrashReports([])
    setAutosavePath(null)
  }, [autosavePath])

  const handleCrashDiscard = useCallback(async (_sendReport: boolean) => {
    if (autosavePath && window.entropic) {
      try {
        await window.entropic.deleteFile(autosavePath)
      } catch {
        // Best-effort
      }
    }
    if (window.entropic) {
      await window.entropic.clearCrashReports()
    }
    setCrashReports([])
    setAutosavePath(null)
  }, [autosavePath])

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

  // Load recent projects for WelcomeScreen
  useEffect(() => {
    loadRecentProjects().then(setRecentProjects).catch(() => {})
  }, [])

  // Initialize shortcut registry and keyboard listeners
  useEffect(() => {
    shortcutRegistry.loadDefaults(DEFAULT_SHORTCUTS)

    // Register all shortcut handlers
    shortcutRegistry.register('undo', () => useUndoStore.getState().undo())
    shortcutRegistry.register('redo', () => useUndoStore.getState().redo())
    shortcutRegistry.register('zoom_in', () => {
      const z = useTimelineStore.getState().zoom
      useTimelineStore.getState().setZoom(Math.min(500, z * 1.25))
    })
    shortcutRegistry.register('zoom_out', () => {
      const z = useTimelineStore.getState().zoom
      useTimelineStore.getState().setZoom(Math.max(0.5, z * 0.8))
    })
    shortcutRegistry.register('zoom_fit', () => {
      const dur = useTimelineStore.getState().duration
      // Fit entire duration in ~80% of viewport width
      const viewportWidth = window.innerWidth * 0.6
      useTimelineStore.getState().setZoom(Math.max(0.5, viewportWidth / Math.max(1, dur)))
    })
    shortcutRegistry.register('save', () => saveProject())
    shortcutRegistry.register('open', () => loadProject())
    shortcutRegistry.register('new_project', () => newProject())
    shortcutRegistry.register('split_clip', () => {
      const timeline = useTimelineStore.getState()
      if (timeline.selectedClipId) {
        timeline.splitClip(timeline.selectedClipId, timeline.playheadTime)
      }
    })
    shortcutRegistry.register('add_marker', () => {
      const timeline = useTimelineStore.getState()
      timeline.addMarker(timeline.playheadTime, 'Marker', '#f59e0b')
    })
    shortcutRegistry.register('toggle_automation', () => {
      const timeline = useTimelineStore.getState()
      if (timeline.selectedTrackId) {
        const autoStore = useAutomationStore.getState()
        const lanes = autoStore.getLanesForTrack(timeline.selectedTrackId)
        for (const lane of lanes) {
          autoStore.setLaneVisible(timeline.selectedTrackId, lane.id, !lane.isVisible)
        }
      }
    })
    shortcutRegistry.register('toggle_sidebar', () => useLayoutStore.getState().toggleSidebar())
    shortcutRegistry.register('toggle_focus', () => useLayoutStore.getState().toggleFocusMode())
    shortcutRegistry.register('toggle_perform', () => {
      const perfStore = usePerformanceStore.getState()
      perfStore.setPerformMode(!perfStore.isPerformMode)
    })
    shortcutRegistry.register('loop_in', () => {
      const timeline = useTimelineStore.getState()
      const currentOut = timeline.loopRegion?.out ?? timeline.duration
      if (timeline.playheadTime < currentOut) {
        timeline.setLoopRegion(timeline.playheadTime, currentOut)
      }
    })
    shortcutRegistry.register('loop_out', () => {
      const timeline = useTimelineStore.getState()
      const currentIn = timeline.loopRegion?.in ?? 0
      if (timeline.playheadTime > currentIn) {
        timeline.setLoopRegion(currentIn, timeline.playheadTime)
      }
    })
    shortcutRegistry.register('export', () => setShowExportDialog(true))
    shortcutRegistry.register('preferences', () => setShowPreferences(true))
    shortcutRegistry.register('about', () => setShowAbout(true))
    shortcutRegistry.register('feedback_dialog', () => setShowFeedbackDialog(true))
    shortcutRegistry.register('support_bundle', () => {
      if (window.entropic) {
        window.entropic.generateSupportBundle().then((path) => {
          console.log('[Support] Bundle saved to:', path)
        })
      }
    })
    shortcutRegistry.register('play_pause', () => {
      const audio = useAudioStore.getState()
      if (audio.isLoaded) {
        audio.togglePlayback()
      } else {
        handlePlayPauseRef.current()
      }
    })
    shortcutRegistry.register('import_media', () => handleImportMedia())
    shortcutRegistry.register('add_text_track', () => handleAddTextTrack())
    shortcutRegistry.register('toggle_quantize', () => useLayoutStore.getState().toggleQuantize())
    shortcutRegistry.register('split_at_playhead', () => {
      const ts = useTimelineStore.getState()
      for (const clipId of ts.selectedClipIds) {
        for (const track of ts.tracks) {
          const clip = track.clips.find((c) => c.id === clipId)
          if (clip && ts.playheadTime > clip.position && ts.playheadTime < clip.position + clip.duration) {
            ts.splitClip(clipId, ts.playheadTime)
            break
          }
        }
      }
    })

    // Main keyboard listener — delegates to registry for normal shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      if (isInput) return

      const perfStore = usePerformanceStore.getState()

      // Perform mode pad handling (NOT in registry — uses e.code for pad bindings)
      if (perfStore.isPerformMode && !(e.metaKey || e.ctrlKey)) {
        if (e.code === 'Escape') {
          e.preventDefault()
          perfStore.panicAll()
          return
        }

        // PadEditor open → keys don't trigger pads
        if (perfStore.isPadEditorOpen) return

        // Ignore repeat events (held key)
        if (e.repeat) return

        // Lookup pad by e.code
        const pad = perfStore.drumRack.pads.find((p) => p.keyBinding === e.code)
        if (pad) {
          e.preventDefault()
          e.stopPropagation()
          handlePadTrigger(pad, perfStore, currentFrame, 'keyboard')
          return
        }

        // Consume bare keys in perform mode (block i/o shortcuts etc.)
        e.preventDefault()
        return
      }

      // Direct spacebar → play/pause (bypasses registry — most reliable)
      if (e.code === 'Space') {
        e.preventDefault()
        const audio = useAudioStore.getState()
        if (audio.isLoaded) {
          audio.togglePlayback()
        }
        return
      }

      // Normal shortcuts — delegate to registry
      shortcutRegistry.handleKeyEvent(e)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      const perfStore = usePerformanceStore.getState()
      if (!perfStore.isPerformMode) return
      if (perfStore.isPadEditorOpen) return

      const pad = perfStore.drumRack.pads.find((p) => p.keyBinding === e.code)
      if (!pad) return

      // Gate: release on keyup. One-shot: start release on keyup. Toggle: no action.
      if (pad.mode === 'gate' || pad.mode === 'one-shot') {
        releasePadWithCapture(pad, perfStore, currentFrame, 'keyboard')
      }
    }

    // H2: Window blur → panic all gate-mode pads (stuck key recovery)
    // Also reset drag state (fixes overlay stuck after Cmd+Tab)
    const handleBlur = () => {
      usePerformanceStore.getState().panicAll()
      dragCountRef.current = 0
      setIsGlobalDragOver(false)
    }

    // Capture phase ensures shortcuts fire before any child stopPropagation()
    // (e.g. PadEditor key capture). Per Electron docs best practice.
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      window.removeEventListener('blur', handleBlur)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch effect registry when engine connects
  useEffect(() => {
    if (status === 'connected') {
      fetchRegistry()
    }
  }, [status, fetchRegistry])

  // Listen for export progress
  useEffect(() => {
    if (typeof window === 'undefined' || !window.entropic) return
    const cleanup = window.entropic.onExportProgress(({ jobId, progress, done, error, currentFrame: cf, totalFrames: tf, etaSeconds, outputPath }) => {
      if (exportJobId && jobId !== exportJobId) return
      setExportProgress(progress)
      if (cf !== undefined) setExportCurrentFrame(cf)
      if (tf !== undefined) setExportTotalFrames(tf)
      if (etaSeconds !== undefined) setExportEta(etaSeconds)
      if (outputPath !== undefined) setExportOutputPath(outputPath)
      if (done) {
        setIsExporting(false)
        setExportJobId(null)
      }
      if (error) {
        setExportError(error)
        setIsExporting(false)
        setExportJobId(null)
        useToastStore.getState().addToast({
          level: 'error',
          message: 'Export failed',
          source: 'export',
          details: error,
        })
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

      let chain = chainOverride ?? effectChain

      // Apply pad modulations to the chain before sending to backend
      if (!chainOverride) {
        const perfStore = usePerformanceStore.getState()
        const envelopeValues = perfStore.getEnvelopeValues(frame)
        if (Object.keys(envelopeValues).length > 0) {
          chain = applyPadModulations(chain, perfStore.drumRack.pads, envelopeValues)
        }

        // Apply MIDI CC modulations (absolute set, after pad ADSR)
        const midiStore = useMIDIStore.getState()
        if (midiStore.ccMappings.length > 0 && Object.keys(midiStore.ccValues).length > 0) {
          chain = applyCCModulations(chain, midiStore.ccMappings, midiStore.ccValues)
        }
      }

      try {
        // Include operators in render request for backend modulation
        const serializedOps = useOperatorStore.getState().getSerializedOperators()

        // Phase 7: Evaluate automation overrides at current playhead time
        const currentTime = useTimelineStore.getState().playheadTime
        const allLanes = useAutomationStore.getState().getAllLanes()
        const autoOverrides = allLanes.length > 0
          ? evaluateAutomationOverrides(allLanes, currentTime, registry)
          : undefined

        // Check for active text clips at current time
        const timelineState = useTimelineStore.getState()
        const activeTextClips = timelineState.tracks
          .filter((t) => t.type === 'text' && !t.isMuted)
          .flatMap((t) => t.clips.filter((c) =>
            c.textConfig && currentTime >= c.position && currentTime < c.position + c.duration,
          ))

        // Find active video clip transform at current time
        const activeVideoClip = timelineState.tracks
          .filter((t) => t.type === 'video' && !t.isMuted)
          .flatMap((t) => t.clips)
          .find((c) => c.isEnabled !== false && currentTime >= c.position && currentTime < c.position + c.duration)
        const clipTransform = activeVideoClip?.transform

        let res
        if (activeTextClips.length > 0) {
          // Use render_composite to layer video + text
          const layers: Record<string, unknown>[] = [
            {
              layer_type: 'video',
              asset_path: activeAssetPath.current,
              frame_index: frame,
              chain: serializeEffectChain(chain),
              opacity: 1.0,
              blend_mode: 'normal',
              ...(clipTransform && (clipTransform.x !== 0 || clipTransform.y !== 0 || clipTransform.scale !== 1 || clipTransform.rotation !== 0)
                ? { transform: clipTransform } : {}),
            },
            ...activeTextClips.map((clip) => ({
              layer_type: 'text',
              text_config: serializeTextConfig(clip.textConfig!),
              frame_index: Math.max(0, Math.round((currentTime - clip.position) * (timelineState.tracks[0]?.clips[0]?.speed ?? 30))),
              fps: 30,
              chain: [],
              opacity: clip.textConfig!.opacity,
              blend_mode: 'normal',
            })),
          ]
          res = await window.entropic.sendCommand({
            cmd: 'render_composite',
            layers,
            resolution: [frameWidth || 1920, frameHeight || 1080],
            project_seed: Date.now() % 2147483647,
          })
        } else {
          res = await window.entropic.sendCommand({
            cmd: 'render_frame',
            path: activeAssetPath.current,
            frame_index: frame,
            chain: serializeEffectChain(chain),
            project_seed: Date.now() % 2147483647,
            ...(serializedOps.length > 0 ? { operators: serializedOps } : {}),
            ...(autoOverrides && Object.keys(autoOverrides).length > 0 ? { automation_overrides: autoOverrides } : {}),
            ...(clipTransform && (clipTransform.x !== 0 || clipTransform.y !== 0 || clipTransform.scale !== 1 || clipTransform.rotation !== 0)
              ? { transform: clipTransform } : {}),
          })
        }

        if (res.ok && res.frame_data) {
          const dataUrl = `data:image/jpeg;base64,${res.frame_data as string}`
          setFrameDataUrl(dataUrl)
          // Relay frame to pop-out window if open
          window.entropic.sendFrameToPopOut(dataUrl)
          if (res.width) setFrameWidth(res.width as number)
          if (res.height) setFrameHeight(res.height as number)
          setPreviewState('ready')
          setRenderError(null)
          // Store operator values for UI indicators
          if (res.operator_values) {
            setOperatorValues(res.operator_values as Record<string, number>)
          }
          // Wire disabled_effects to toast (deduplicated)
          if (res.disabled_effects) {
            const disabledKey = JSON.stringify(res.disabled_effects)
            if (disabledKey !== lastDisabledEffectsRef.current) {
              lastDisabledEffectsRef.current = disabledKey
              const count = (res.disabled_effects as string[]).length
              if (count > 0) {
                useToastStore.getState().addToast({
                  level: 'state',
                  message: `${count} effect(s) auto-disabled`,
                  source: 'engine',
                  persistent: true,
                })
              }
            }
          }
        } else if (!res.ok) {
          console.error('[Render] frame', frame, 'error:', res.error)
          useToastStore.getState().addToast({
            level: 'error',
            message: 'Frame render failed',
            source: 'render',
            details: res.error as string,
          })

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
        const errMsg = err instanceof Error ? err.message : 'Render failed'
        setRenderError(errMsg)
        setPreviewState('error')
        useToastStore.getState().addToast({
          level: 'error',
          message: 'Frame render failed',
          source: 'render',
          details: errMsg,
        })
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
        const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.bmp', '.heic', '.heif']
        const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
        const isImage = IMAGE_EXTS.includes(ext)
        const asset: Asset = {
          id: randomUUID(),
          path,
          type: isImage ? 'image' : 'video',
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

        // Auto-create track + clip on import (CapCut behavior)
        // Grouped as single undo entry so Cmd+Z reverses the entire import
        const undoStore = useUndoStore.getState()
        undoStore.beginTransaction('Import media')
        const timeline = useTimelineStore.getState()
        const trackColors = ['#ef4444', '#f59e0b', '#4ade80', '#3b82f6', '#a855f7', '#ec4899']
        const trackColor = trackColors[timeline.tracks.length % trackColors.length]
        const trackName = `Track ${timeline.tracks.length + 1}`
        const trackId = timeline.addTrack(trackName, trackColor)
        if (trackId) {
          const clipDuration = isImage ? 5 : (res.duration_s as number)
          // Place new clips at position 0 on their own track (NLE convention)
          // Auto-fit transform: scale media to fit project canvas
          const canvasW = frameWidth || 1920
          const canvasH = frameHeight || 1080
          const srcW = asset.meta.width
          const srcH = asset.meta.height
          const fitScale = (srcW > canvasW || srcH > canvasH)
            ? Math.min(canvasW / srcW, canvasH / srcH)
            : 1
          const clipTransform = fitScale !== 1
            ? { x: 0, y: 0, scale: Math.round(fitScale * 100) / 100, rotation: 0 }
            : undefined

          timeline.addClip(trackId, {
            id: randomUUID(),
            assetId: asset.id,
            trackId,
            position: 0,
            duration: clipDuration,
            inPoint: 0,
            outPoint: clipDuration,
            speed: 1,
            transform: clipTransform,
          })
        }
        undoStore.commitTransaction()

        // For images: use the clip duration (5s) * default fps to get a playable frame count
        // The sidecar's ImageReader returns the same frame for any index, so playback shows the held image
        const imageFps = 30
        const imageFrameCount = 5 * imageFps // 150 frames = 5 seconds
        setTotalFrames(isImage ? imageFrameCount : (res.frame_count as number))
        setFrameWidth(res.width as number)
        setFrameHeight(res.height as number)
        setActiveFps(isImage ? imageFps : (res.fps as number))
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

        // Auto-fit zoom so the entire clip is visible on import
        const clipDur = isImage ? 5 : (res.duration_s as number)
        if (clipDur > 0) {
          const viewW = window.innerWidth * 0.6 // approximate timeline viewport width
          const fitZoom = Math.max(0.5, Math.min(500, viewW / clipDur))
          useTimelineStore.getState().setZoom(fitZoom)
          useTimelineStore.getState().setScrollX(0)
        }

        // Load clip thumbnails for timeline display (fire-and-forget)
        if (!isImage && window.entropic) {
          window.entropic.sendCommand({ cmd: 'thumbnails', path, count: 12 }).then((thumbRes: Record<string, unknown>) => {
            if (thumbRes.ok && Array.isArray(thumbRes.thumbnails)) {
              setClipThumbnails(thumbRes.thumbnails as { time: number; data: string }[])
            }
          }).catch(() => { /* thumbnails are optional */ })
        }
      } else {
        setIngestError(res.error as string)
        setPreviewState('empty')
        useToastStore.getState().addToast({
          level: 'error',
          message: 'Media ingest failed',
          source: 'ingest',
          details: res.error as string,
        })
      }

      setIngesting(false)
    },
    [addAsset, setTotalFrames, setCurrentFrame, setIngesting, setIngestError, requestRenderFrame, audioStore, loadWaveform],
  )

  // --- Menu / shortcut action handlers ---
  const handleImportMedia = useCallback(async () => {
    if (!window.entropic || isIngesting) return
    const path = await window.entropic.showOpenDialog({
      title: 'Import Media',
      filters: [{ name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mxf', 'ts', 'png', 'jpg', 'jpeg', 'tiff', 'tif', 'webp', 'bmp', 'heic', 'heif', 'wav', 'mp3', 'm4a', 'aif', 'aiff', 'ogg', 'flac'] }],
    })
    if (path) handleFileIngest(path)
  }, [isIngesting, handleFileIngest])

  const handleAddTextTrack = useCallback(() => {
    const timeline = useTimelineStore.getState()
    const textCount = timeline.tracks.filter((t) => t.type === 'text').length
    timeline.addTextTrack(`Text ${textCount + 1}`, '#6366f1')
  }, [])

  // Listen for menu actions from main process
  useEffect(() => {
    if (typeof window === 'undefined' || !window.entropic?.onMenuAction) return
    const cleanup = window.entropic.onMenuAction((action: string) => {
      switch (action) {
        case 'import-media': handleImportMedia(); break
        case 'add-text-track': handleAddTextTrack(); break
        case 'new-project': newProject(); break
        case 'open-project': loadProject(); break
        case 'save': saveProject(); break
        case 'save-as': saveProject(); break
        case 'export': setShowExportDialog(true); break
        case 'toggle-sidebar': useLayoutStore.getState().toggleSidebar(); break
        case 'toggle-focus': useLayoutStore.getState().toggleFocusMode(); break
        case 'toggle-quantize': useLayoutStore.getState().toggleQuantize(); break

        // Select menu
        case 'select-all-clips': useTimelineStore.getState().selectAllClips(); break
        case 'deselect-all': useTimelineStore.getState().clearSelection(); break
        case 'invert-selection': useTimelineStore.getState().invertSelection(); break
        case 'select-by-track': {
          const trackId = useTimelineStore.getState().selectedTrackId
          if (trackId) useTimelineStore.getState().selectClipsByTrack(trackId)
          break
        }

        // Clip menu
        case 'split-at-playhead': {
          const ts = useTimelineStore.getState()
          for (const clipId of ts.selectedClipIds) {
            for (const track of ts.tracks) {
              const clip = track.clips.find((c) => c.id === clipId)
              if (clip && ts.playheadTime > clip.position && ts.playheadTime < clip.position + clip.duration) {
                ts.splitClip(clipId, ts.playheadTime)
                break // clip can only be in one track
              }
            }
          }
          break
        }
        case 'clip-speed': {
          const ts2 = useTimelineStore.getState()
          if (ts2.selectedClipIds.length === 1) {
            const val = window.prompt('Speed (0.1 - 10):', '1')
            if (val !== null) {
              const parsed = Number(val)
              const speed = Math.max(0.1, Math.min(10, Number.isFinite(parsed) ? parsed : 1))
              ts2.setClipSpeed(ts2.selectedClipIds[0], speed)
            }
          }
          break
        }
        case 'clip-reverse': {
          const ts3 = useTimelineStore.getState()
          for (const clipId of ts3.selectedClipIds) ts3.reverseClip(clipId)
          break
        }
        case 'clip-toggle-enabled': {
          const ts4 = useTimelineStore.getState()
          for (const clipId of ts4.selectedClipIds) ts4.toggleClipEnabled(clipId)
          break
        }

        // Timeline menu
        case 'add-video-track': {
          const tracks = useTimelineStore.getState().tracks
          const colors = ['#ef4444', '#f59e0b', '#4ade80', '#3b82f6', '#a855f7', '#ec4899']
          useTimelineStore.getState().addTrack(`Track ${tracks.length + 1}`, colors[tracks.length % colors.length])
          break
        }
        case 'delete-selected-track': {
          const tid = useTimelineStore.getState().selectedTrackId
          if (tid) useTimelineStore.getState().removeTrack(tid)
          break
        }
        case 'move-track-up': {
          const ts5 = useTimelineStore.getState()
          const idx = ts5.tracks.findIndex((t) => t.id === ts5.selectedTrackId)
          if (idx > 0) ts5.reorderTrack(idx, idx - 1)
          break
        }
        case 'move-track-down': {
          const ts6 = useTimelineStore.getState()
          const idx2 = ts6.tracks.findIndex((t) => t.id === ts6.selectedTrackId)
          if (idx2 >= 0 && idx2 < ts6.tracks.length - 1) ts6.reorderTrack(idx2, idx2 + 1)
          break
        }
        case 'toggle-automation': {
          const tl = useTimelineStore.getState()
          if (tl.selectedTrackId) {
            const autoStore = useAutomationStore.getState()
            const lanes = autoStore.getLanesForTrack(tl.selectedTrackId)
            for (const lane of lanes) {
              autoStore.setLaneVisible(tl.selectedTrackId, lane.id, !lane.isVisible)
            }
          }
          break
        }
        case 'zoom-in': useTimelineStore.getState().setZoom(Math.min(500, useTimelineStore.getState().zoom * 1.25)); break
        case 'zoom-out': useTimelineStore.getState().setZoom(Math.max(0.5, useTimelineStore.getState().zoom * 0.8)); break
        case 'zoom-fit': {
          const dur = useTimelineStore.getState().duration
          useTimelineStore.getState().setZoom(Math.max(0.5, (window.innerWidth * 0.6) / Math.max(1, dur)))
          break
        }
        case 'show-shortcuts': setShowPreferences(true); break
        case 'show-feedback': setShowFeedbackDialog(true); break
        default:
          // Handle add-effect:{effectId} actions from Adjustments menu
          if (action.startsWith('add-effect:')) {
            const effectId = action.slice('add-effect:'.length)
            const info = registry.find((e) => e.id === effectId)
            if (info) {
              addEffect({
                id: randomUUID(),
                effectId: info.id,
                isEnabled: true,
                isFrozen: false,
                parameters: Object.fromEntries(
                  Object.entries(info.params).map(([key, def]) => [key, def.default]),
                ),
                modulations: {},
                mix: 1.0,
                mask: null,
              })
            }
          }
      }
    })
    return cleanup
  }, [handleImportMedia, handleAddTextTrack, newProject, loadProject, saveProject, registry, addEffect])

  // Unsaved work prompt on close
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  useEffect(() => {
    if (!window.entropic?.onCloseRequested) return
    const cleanup = window.entropic.onCloseRequested(() => {
      const dirty = useUndoStore.getState().isDirty
      if (!dirty) {
        window.entropic.confirmClose()
        return
      }
      setShowCloseDialog(true)
    })
    return cleanup
  }, [])

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
  handlePlayPauseRef.current = handlePlayPause

  const handleStop = useCallback(() => {
    if (hasAudio && audioStore.isLoaded) {
      if (audioStore.isPlaying) audioStore.togglePlayback()
      audioStore.seek(0)
    }
    setIsTimerPlaying(false)
    setCurrentFrame(0)
    useTimelineStore.getState().setPlayheadTime(0)
  }, [hasAudio, audioStore, setCurrentFrame])

  const handleToggleLoop = useCallback(() => {
    const ts = useTimelineStore.getState()
    if (ts.loopRegion) {
      ts.clearLoopRegion()
    } else {
      // Default loop: full duration
      ts.setLoopRegion(0, ts.duration)
    }
  }, [])

  // Clock sync loop: when audio is playing, poll audio position at ~60Hz
  // and drive video frame from audio clock (audio is master, video is slave)
  //
  // IMPORTANT: Dependencies must NOT include the entire audioStore object.
  // syncClock() calls set() on the store, which would trigger effect cleanup
  // and restart the RAF loop on every frame — killing playback.
  const audioIsPlaying = useAudioStore((s) => s.isPlaying)
  useEffect(() => {
    if (!hasAudio || !audioIsPlaying) {
      if (clockSyncRafRef.current !== null) {
        cancelAnimationFrame(clockSyncRafRef.current)
        clockSyncRafRef.current = null
      }
      return
    }

    let lastFrame = -1
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      const store = useAudioStore.getState()
      await store.syncClock()
      if (cancelled) return
      const { targetFrame, currentTime } = useAudioStore.getState()
      if (targetFrame !== lastFrame) {
        lastFrame = targetFrame
        setCurrentFrame(targetFrame)
        useTimelineStore.getState().setPlayheadTime(currentTime)
      }

      // Loop region: when playhead reaches loop out, jump back to loop in
      const loopRegion = useTimelineStore.getState().loopRegion
      if (loopRegion && currentTime >= loopRegion.out) {
        await useAudioStore.getState().seek(loopRegion.in)
        useTimelineStore.getState().setPlayheadTime(loopRegion.in)
      }

      if (!cancelled) {
        clockSyncRafRef.current = requestAnimationFrame(tick)
      }
    }

    clockSyncRafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      if (clockSyncRafRef.current !== null) {
        cancelAnimationFrame(clockSyncRafRef.current)
        clockSyncRafRef.current = null
      }
    }
  }, [hasAudio, audioIsPlaying, setCurrentFrame])

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
        // Sync timeline playhead for silent/image playback (audio path does this in clock sync)
        if (activeFps > 0) {
          useTimelineStore.getState().setPlayheadTime(nextFrame / activeFps)
        }
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

      setExportCurrentFrame(0)
      setExportTotalFrames(totalFrames)
      setExportEta(null)
      setExportOutputPath(settings.outputPath)

      // Collect text layers for export compositing
      const exportTextLayers = useTimelineStore.getState().tracks
        .filter((t) => t.type === 'text' && !t.isMuted)
        .flatMap((t) => t.clips
          .filter((c) => c.textConfig)
          .map((c) => ({
            text_config: serializeTextConfig(c.textConfig!),
            opacity: c.textConfig!.opacity,
            position_s: c.position,
            duration_s: c.duration,
          })),
        )

      const res = await window.entropic.sendCommand({
        cmd: 'export_start',
        input_path: activeAssetPath.current,
        output_path: settings.outputPath,
        chain: serializeEffectChain(effectChain),
        project_seed: 42,
        ...(exportTextLayers.length > 0 ? { text_layers: exportTextLayers } : {}),
        settings: {
          codec: settings.codec,
          resolution: settings.resolution,
          custom_width: settings.customWidth,
          custom_height: settings.customHeight,
          fps: settings.fps,
          quality_preset: settings.qualityPreset,
          bitrate: settings.bitrateMode === 'cbr' ? settings.bitrate * 1_000_000 : undefined,
          crf: settings.bitrateMode === 'crf' ? settings.crf : undefined,
          region: settings.region,
          start_frame: settings.startFrame,
          end_frame: settings.endFrame,
          include_audio: settings.includeAudio,
          export_type: settings.exportType,
          gif_max_width: settings.gifMaxWidth,
          gif_dithering: settings.gifDithering,
          image_format: settings.imageFormat,
          jpeg_quality: settings.jpegQuality,
        },
      })

      if (res.ok) {
        setExportJobId(res.job_id as string)
      } else {
        setExportError(res.error as string)
        setIsExporting(false)
        useToastStore.getState().addToast({
          level: 'error',
          message: 'Export failed',
          source: 'export',
          details: res.error as string,
        })
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
  const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.mxf', '.ts', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.bmp', '.heic', '.heif', '.wav', '.mp3', '.m4a', '.aif', '.aiff', '.ogg', '.flac']

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

  // Derive selected text clip via Zustand selector (reactive — re-renders on change)
  const loopRegion = useTimelineStore((s) => s.loopRegion)
  const projectBpm = useProjectStore((s) => s.bpm)
  const quantizeEnabled = useLayoutStore((s) => s.quantizeEnabled)
  const quantizeDivision = useLayoutStore((s) => s.quantizeDivision)

  const selectedClip = useTimelineStore((s) => {
    if (s.selectedClipIds.length !== 1) return null
    for (const track of s.tracks) {
      const clip = track.clips.find((c) => c.id === s.selectedClipIds[0])
      if (clip) return clip
    }
    return null
  })

  const selectedTextClip = useTimelineStore((s) => {
    if (s.selectedClipIds.length !== 1) return null
    for (const track of s.tracks) {
      if (track.type !== 'text') continue
      const clip = track.clips.find((c) => c.id === s.selectedClipIds[0])
      if (clip?.textConfig) return clip
    }
    return null
  })

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
      style={{
        gridTemplateColumns: sidebarCollapsed ? 'var(--sidebar-width-collapsed) 1fr' : 'var(--sidebar-width) 1fr',
      }}
      onDragEnter={handleGlobalDragEnter}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onDrop={handleGlobalDrop}
    >
      <UpdateBanner />
      <div className="app__transport-bar">
        <div className="app__transport-controls">
          <button
            className={`app__transport-btn ${isPlaying ? 'app__transport-btn--active' : ''}`}
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="app__transport-btn" onClick={handleStop} title="Stop">
            ⏹
          </button>
        </div>
        <span className="app__transport-timecode">
          {(() => {
            const t = useTimelineStore.getState().playheadTime
            const m = Math.floor(t / 60)
            const s = t % 60
            return `${m}:${s.toFixed(1).padStart(4, '0')}`
          })()}
          {' / '}
          {(() => {
            const t = useTimelineStore.getState().duration
            const m = Math.floor(t / 60)
            const s = t % 60
            return `${m}:${s.toFixed(1).padStart(4, '0')}`
          })()}
        </span>
        <div className="app__transport-bpm">
          <label>BPM</label>
          <input
            type="number"
            min={1}
            max={300}
            value={projectBpm}
            onChange={(e) => useProjectStore.getState().setBpm(Number(e.target.value))}
          />
        </div>
        <div className="app__transport-quant">
          <button
            className={`app__transport-btn ${quantizeEnabled ? 'app__transport-btn--active' : ''}`}
            onClick={() => useLayoutStore.getState().toggleQuantize()}
            title="Toggle quantize grid (Cmd+U)"
          >
            Q
          </button>
          <select
            className="app__transport-select"
            value={quantizeDivision}
            onChange={(e) => useLayoutStore.getState().setQuantizeDivision(Number(e.target.value))}
          >
            <option value={1}>1/1</option>
            <option value={2}>1/2</option>
            <option value={4}>1/4</option>
            <option value={8}>1/8</option>
            <option value={16}>1/16</option>
            <option value={32}>1/32</option>
          </select>
        </div>
      </div>
      <div className={`app__drop-overlay ${isGlobalDragOver ? 'app__drop-overlay--active' : ''}`} />
      <div className="app__sidebar" style={sidebarCollapsed ? { display: 'none' } : undefined}>
        {!hasAssets && (
          <div className="app__upload">
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
            {/* Replace accessible via File > Import Media (Cmd+I) or right-click track context menu */}
          </div>
        )}
        {selectedClip && !selectedClip.textConfig && (
          <TransformPanel
            transform={selectedClip.transform ?? { x: 0, y: 0, scale: 1, rotation: 0 }}
            onChange={(t) => useTimelineStore.getState().setClipTransform(selectedClip.id, t)}
            canvasWidth={frameWidth || 1920}
            canvasHeight={frameHeight || 1080}
            sourceWidth={(() => {
              const asset = assets[selectedClip.assetId]
              return asset?.meta.width ?? 1920
            })()}
            sourceHeight={(() => {
              const asset = assets[selectedClip.assetId]
              return asset?.meta.height ?? 1080
            })()}
          />
        )}
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tabs__btn ${sidebarTab === 'effects' ? 'sidebar-tabs__btn--active' : ''}`}
            onClick={() => setSidebarTab('effects')}
          >
            Effects
          </button>
          <button
            className={`sidebar-tabs__btn ${sidebarTab === 'presets' ? 'sidebar-tabs__btn--active' : ''}`}
            onClick={() => setSidebarTab('presets')}
          >
            Presets
          </button>
        </div>
        {sidebarTab === 'effects' ? (
          <EffectBrowser
            registry={registry}
            isLoading={effectsLoading}
            onAddEffect={addEffect}
            chainLength={effectChain.length}
            onAddTextTrack={handleAddTextTrack}
          />
        ) : (
          <PresetBrowser
            onApplyPreset={(preset: Preset) => {
              if (preset.type === 'single_effect' && preset.effectData) {
                addEffect({
                  id: randomUUID(),
                  effectId: preset.effectData.effectId,
                  isEnabled: true,
                  isFrozen: false,
                  parameters: { ...preset.effectData.parameters },
                  modulations: { ...(preset.effectData.modulations ?? {}) },
                  mix: 1,
                  mask: null,
                })
              } else if (preset.type === 'effect_chain' && preset.chainData) {
                for (const effect of preset.chainData.effects) {
                  addEffect({
                    ...effect,
                    id: randomUUID(),
                  })
                }
              }
            }}
          />
        )}
        {/* Phase 13C: EffectRack removed — replaced by DeviceChain at bottom */}
        {/* Phase 13C: HistoryPanel removed from sidebar — accessible via Edit → Undo History */}
        <HelpPanel />
      </div>

      <div className="app__main">
        <div className="app__preview">
          <div
            style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}
            onClick={(e) => {
              // Click-to-place text: if a text track is selected but no text clip exists at playhead, create one
              const tl = useTimelineStore.getState()
              const selTrack = tl.tracks.find((t) => t.id === tl.selectedTrackId)
              if (!selTrack || selTrack.type !== 'text') return
              if (!selectedTextClip) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const relX = Math.round(((e.clientX - rect.left) / rect.width) * (frameWidth || 1920))
                const relY = Math.round(((e.clientY - rect.top) / rect.height) * (frameHeight || 1080))
                tl.addTextClip(selTrack.id, { text: 'Text', fontFamily: 'Helvetica', fontSize: 48, color: '#ffffff', position: [relX, relY], alignment: 'left', opacity: 1.0, strokeWidth: 0, strokeColor: '#000000', shadowOffset: [0, 0], shadowColor: '#00000080', animation: 'none', animationDuration: 1.0 }, tl.playheadTime, 5)
              }
            }}
          >
            <PreviewCanvas
              frameDataUrl={frameDataUrl}
              width={frameWidth}
              height={frameHeight}
              previewState={previewState}
              renderError={renderError}
              onRetry={handleRenderRetry}
            />
            {selectedTextClip?.textConfig && (
              <TextOverlay
                config={selectedTextClip.textConfig}
                canvasWidth={frameWidth}
                canvasHeight={frameHeight}
                onUpdatePosition={(pos) => useTimelineStore.getState().updateTextConfig(selectedTextClip.id, { position: pos })}
                onUpdateText={(text) => useTimelineStore.getState().updateTextConfig(selectedTextClip.id, { text })}
              />
            )}
          </div>
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
          />
        </div>
        {/* Phase 13C: ParamPanel removed — replaced by inline params in DeviceChain */}
        {selectedTextClip?.textConfig && (
          <div className="app__params">
            <TextPanel
              config={selectedTextClip.textConfig}
              onUpdate={(changes) => useTimelineStore.getState().updateTextConfig(selectedTextClip.id, changes)}
            />
          </div>
        )}
        <ExportProgress
          isExporting={isExporting}
          progress={exportProgress}
          currentFrame={exportCurrentFrame}
          totalFrames={exportTotalFrames}
          etaSeconds={exportEta}
          outputPath={exportOutputPath}
          error={exportError}
          onCancel={handleExportCancel}
        />
      </div>

      <div className={`app__timeline${timelineCollapsed ? ' app__timeline--collapsed' : ''}`}>
        {timelineCollapsed ? (
          <div className="timeline-collapsed-header">
            <Tooltip text="Expand timeline" position="top">
              <button className="timeline-collapsed-header__toggle" onClick={() => useLayoutStore.getState().toggleTimeline()}>
                &#9654; Timeline
              </button>
            </Tooltip>
          </div>
        ) : (
          <>
            <Timeline
              onSeek={handleTimelineSeek}
              isDragOver={isGlobalDragOver}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              loopEnabled={!!loopRegion}
              onToggleLoop={handleToggleLoop}
              bpm={projectBpm}
              onBpmChange={(v) => useProjectStore.getState().setBpm(v)}
              quantizeEnabled={quantizeEnabled}
              quantizeDivision={quantizeDivision}
              onToggleQuantize={() => useLayoutStore.getState().toggleQuantize()}
              onQuantizeDivisionChange={(d) => useLayoutStore.getState().setQuantizeDivision(d)}
              waveformPeaks={waveformPeaks}
              clipThumbnails={clipThumbnails}
            />
            <AutomationToolbar />
          </>
        )}
      </div>

      {/* Phase 15C: PerformancePanel converted to floating config overlay */}
      {isPerformMode && (
        <div className="app__performance-overlay">
          <PerformancePanel onEditPad={(id) => {
            setEditingPadId(id)
            usePerformanceStore.getState().setPadEditorOpen(true)
          }} />
        </div>
      )}

      {/* Phase 13: Ableton-style Device Chain */}
      <div className="app__device-chain">
        <DeviceChain />
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
          {hasAssets && frameWidth > 0 && (
            <span className="status-bar__metrics">
              <span className="status-bar__metric">{frameWidth >= 3840 ? '4K' : frameWidth >= 1920 ? '1080p' : frameWidth >= 1280 ? '720p' : `${frameWidth}p`}</span>
              <span className="status-bar__metric">{activeFps}fps</span>
              {lastFrameMs !== undefined && (
                <span
                  className="status-bar__metric"
                  style={{ color: lastFrameMs < 33 ? '#4ade80' : lastFrameMs < 66 ? '#ff9800' : '#ef4444' }}
                >
                  {Math.round(lastFrameMs)}ms
                </span>
              )}
            </span>
          )}
        </div>
        <div className="status-bar__right">
          {isPerformMode && (
            <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 600 }}>PERFORM</span>
          )}
          {/* Export accessible via File > Export (Cmd+E) — no visible button needed */}
        </div>
      </div>

      <ExportDialog
        isOpen={showExportDialog}
        totalFrames={totalFrames}
        sourceWidth={frameWidth}
        sourceHeight={frameHeight}
        sourceFps={activeFps}
        loopIn={null}
        loopOut={null}
        onExport={handleExport}
        onClose={() => setShowExportDialog(false)}
      />

      <Preferences
        isOpen={showPreferences}
        onClose={() => setShowPreferences(false)}
      />
      <AboutDialog
        isOpen={showAbout}
        onClose={() => setShowAbout(false)}
      />
      <RenderQueue
        isOpen={showRenderQueue}
        onClose={() => setShowRenderQueue(false)}
      />

      <TelemetryConsentDialog
        isOpen={consentChecked && telemetryConsent === null && !window.entropic?.isTestMode}
        onDecision={handleConsentDecision}
      />

      {startupChecked && (crashReports.length > 0 || autosavePath !== null) && !window.entropic?.isTestMode && (
        <CrashRecoveryDialog
          isOpen={true}
          crashCount={crashReports.length}
          hasAutosave={autosavePath !== null}
          telemetryConsent={telemetryConsent}
          onRestore={handleCrashRestore}
          onDiscard={handleCrashDiscard}
        />
      )}

      <FeedbackDialog
        isOpen={showFeedbackDialog}
        onClose={() => setShowFeedbackDialog(false)}
      />

      {showPresetSave && (() => {
        const targetEffect = showPresetSave.instanceId
          ? effectChain.find((e) => e.id === showPresetSave.instanceId)
          : undefined
        return (
          <PresetSaveDialog
            isOpen={true}
            mode={showPresetSave.mode}
            effectId={targetEffect?.effectId}
            parameters={targetEffect?.parameters}
            modulations={targetEffect?.modulations}
            chain={showPresetSave.mode === 'effect_chain' ? effectChain : undefined}
            onSave={(preset) => useLibraryStore.getState().savePreset(preset)}
            onClose={() => setShowPresetSave(null)}
          />
        )
      })()}

      {showCloseDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog__header">Unsaved Changes</div>
            <p className="dialog__body">You have unsaved changes. What would you like to do?</p>
            <div className="dialog__actions">
              <button
                className="dialog__btn dialog__btn--secondary"
                onClick={() => setShowCloseDialog(false)}
              >
                Cancel
              </button>
              <button
                className="dialog__btn dialog__btn--danger"
                onClick={() => {
                  setShowCloseDialog(false)
                  window.entropic.confirmClose()
                }}
              >
                Don&apos;t Save
              </button>
              <button
                className="dialog__btn dialog__btn--primary"
                onClick={async () => {
                  await saveProject()
                  setShowCloseDialog(false)
                  window.entropic.confirmClose()
                }}
              >
                Save &amp; Quit
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPadId && (
        <PadEditor
          padId={editingPadId}
          effectChain={effectChain}
          registry={registry}
          onClose={() => {
            setEditingPadId(null)
            usePerformanceStore.getState().setPadEditorOpen(false)
          }}
        />
      )}

      <WelcomeScreen
        isVisible={!hasAssets && !welcomeDismissed && !window.entropic?.isTestMode}
        recentProjects={recentProjects}
        onNewProject={() => { newProject(); setWelcomeDismissed(true) }}
        onOpenProject={() => { setWelcomeDismissed(true); loadProject() }}
        onOpenRecent={(path) => { setWelcomeDismissed(true); loadProject(path) }}
      />

      <Toast />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  )
}
