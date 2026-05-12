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
import SpeedDialog from './components/timeline/SpeedDialog'
// Phase 13C: HistoryPanel removed from sidebar
import DeviceChain from './components/device-chain/DeviceChain'
import TransformPanel from './components/timeline/TransformPanel'
import HelpPanel from './components/effects/HelpPanel'
import type { Asset, EffectInstance } from '../shared/types'
import { IDENTITY_TRANSFORM } from '../shared/types'
import BoundingBoxOverlay from './components/preview/BoundingBoxOverlay'
import SnapGuides from './components/preview/SnapGuides'
import type { WaveformPeaks } from './components/transport/useWaveform'
import { serializeEffectChain, serializeTextConfig } from '../shared/ipc-serialize'
import { randomUUID } from './utils'
import { shortcutRegistry } from './utils/shortcuts'
import { transportForward, transportReverse, transportStop, getTransportDirection, resetTransportSpeed } from './utils/transport-speed'
import { DEFAULT_SHORTCUTS } from './utils/default-shortcuts'
import { saveProject, loadProject, newProject, startAutosave, stopAutosave, restoreAutosave } from './project-persistence'
import { FF } from '../shared/feature-flags'
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

function SpeedDialogHost() {
  const speedDialog = useTimelineStore((s) => s.speedDialog)
  const closeSpeedDialog = useTimelineStore((s) => s.closeSpeedDialog)
  const setClipSpeed = useTimelineStore((s) => s.setClipSpeed)
  const tracks = useTimelineStore((s) => s.tracks)

  if (!speedDialog) return null

  let clip: { speed: number; duration: number } | null = null
  for (const t of tracks) {
    const c = t.clips.find((x) => x.id === speedDialog.clipId)
    if (c) {
      clip = { speed: c.speed, duration: c.duration }
      break
    }
  }
  if (!clip) return null

  return (
    <SpeedDialog
      currentSpeed={clip.speed}
      clipDuration={clip.duration}
      position={speedDialog.anchor}
      onConfirm={(speed) => {
        setClipSpeed(speedDialog.clipId, speed)
        closeSpeedDialog()
      }}
      onClose={closeSpeedDialog}
    />
  )
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
    canvasResolution,
    addAsset,
    removeAsset,
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

  // F-0512-19: subscribe to tracks so the render trigger below re-fires when
  // any track-level state mutates (blend mode, opacity, mute, clip add/remove).
  // Reactive subscription — needed at top of AppInner so it is in scope for
  // the render-trigger useEffect.
  const tracks = useTimelineStore((s) => s.tracks)

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
  const [preferencesInitialTab, setPreferencesInitialTab] = useState<'general' | 'shortcuts' | 'performance' | 'paths'>('general')
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
  // Kept in sync via useEffect below. Read from handlers that capture-by-closure.
  const isTimerPlayingRef = useRef(false)
  const [transportSpeedMultiplier, setTransportSpeedMultiplier] = useState(1)
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
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [aspectLocked, setAspectLocked] = useState(true)
  const isRenderingRef = useRef(false)
  const pendingFrameRef = useRef<number | null>(null)
  const playbackRafRef = useRef<number | null>(null)
  const clockSyncRafRef = useRef<number | null>(null)
  const handlePlayPauseRef = useRef<() => void>(() => {})
  const initPreviewRef = useRef<() => Promise<void>>(async () => {})
  const renderSeqRef = useRef(0)
  const lastDisabledEffectsRef = useRef<string>('')

  // Layout store for sidebar/timeline collapse
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const timelineCollapsed = useLayoutStore((s) => s.timelineCollapsed)

  // Engine store for frame timing
  const lastFrameMs = useEngineStore((s) => s.lastFrameMs)

  // Sync isTimerPlaying state → ref so shortcut handlers (registered once at mount)
  // can read the current value without stale closure.
  useEffect(() => {
    isTimerPlayingRef.current = isTimerPlaying
  }, [isTimerPlaying])

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
      await restoreAutosave(autosavePath, () => initPreviewRef.current())
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

  // Window title — show project name + dirty indicator.
  useEffect(() => {
    // F-0512-3: while the welcome screen is still up (no project picked yet),
    // show plain "Entropic" instead of the default "Untitled — Entropic".
    if (FF.F_0512_3_TITLE_BAR && !welcomeDismissed) {
      document.title = 'Entropic'
      return
    }
    document.title = isDirty ? `${projectName} * — Entropic` : `${projectName} — Entropic`
  }, [projectName, isDirty, welcomeDismissed])

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
    shortcutRegistry.register('open', () => loadProject(undefined, () => initPreviewRef.current()))
    shortcutRegistry.register('new_project', () => handleNewProject())
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
    const splitAtPlayheadHandler = () => {
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
    }
    shortcutRegistry.register('split_at_playhead', splitAtPlayheadHandler)
    shortcutRegistry.register('split_at_playhead_e', splitAtPlayheadHandler)

    // Automation copy/paste
    shortcutRegistry.register('automation_copy', () => {
      const autoStore = useAutomationStore.getState()
      const trackId = autoStore.armedTrackId
      if (!trackId) return
      const lanes = autoStore.getLanesForTrack(trackId)
      if (lanes.length === 0) return
      const laneId = lanes[0].id
      const loopRegion = useTimelineStore.getState().loopRegion
      if (loopRegion) {
        autoStore.copyRegion(trackId, laneId, loopRegion.in, loopRegion.out)
      } else {
        // Copy the full lane duration
        const lane = lanes[0]
        if (lane.points.length === 0) return
        const maxTime = Math.max(...lane.points.map((p) => p.time))
        autoStore.copyRegion(trackId, laneId, 0, maxTime)
      }
    })
    shortcutRegistry.register('automation_paste', () => {
      const autoStore = useAutomationStore.getState()
      const trackId = autoStore.armedTrackId
      if (!trackId) return
      const lanes = autoStore.getLanesForTrack(trackId)
      if (lanes.length === 0) return
      const laneId = lanes[0].id
      const playheadTime = useTimelineStore.getState().playheadTime
      autoStore.pasteAtPlayhead(trackId, laneId, playheadTime)
    })

    // JKL transport: J=reverse, K=stop, L=forward (standard NLE).
    // Uses transport-speed state machine for speed escalation (1x → 2x → 4x → 8x).
    // Timer loop below respects transportSpeedMultiplier. Audio has no speed-ramp
    // or reverse support — we pause audio and drive video via timer in those cases.
    shortcutRegistry.register('transport_reverse', () => {
      const speed = transportReverse()
      setTransportSpeedMultiplier(Math.abs(speed))
      if (speed !== 0) {
        // Reverse is video-only. Pause audio if it was playing so it doesn't drift.
        const audio = useAudioStore.getState()
        if (audio.isPlaying) {
          audio.togglePlayback()
          useToastStore.getState().addToast({
            level: 'info',
            message: 'Audio paused — reverse playback is video-only.',
            source: 'transport-reverse-audio',
          })
        }
        setIsTimerPlaying(true)
      }
    })
    shortcutRegistry.register('transport_stop', () => {
      transportStop()
      setTransportSpeedMultiplier(1)
      const audio = useAudioStore.getState()
      if (audio.isPlaying) audio.togglePlayback()
      setIsTimerPlaying(false)
    })
    shortcutRegistry.register('transport_forward', () => {
      const speed = transportForward()
      const newMultiplier = Math.abs(speed)
      setTransportSpeedMultiplier(newMultiplier)
      if (speed === 0) return
      const audio = useAudioStore.getState()
      if (audio.isPlaying && newMultiplier > 1) {
        // Audio can't speed-ramp — pause it and drive video via timer at the new speed.
        audio.togglePlayback()
        setIsTimerPlaying(true)
        useToastStore.getState().addToast({
          level: 'info',
          message: `Audio paused — playing video at ${newMultiplier}× (video-only speed ramp).`,
          source: 'transport-forward-speed',
        })
      } else if (!audio.isPlaying && !isTimerPlayingRef.current) {
        // Neither audio nor timer running — start playback. togglePlayback is a no-op
        // if audio isn't loaded, so the timer fallback covers silent/image clips.
        audio.togglePlayback()
        setIsTimerPlaying(true)
      }
    })

    // Delete selected clips, or fall back to selected effect
    shortcutRegistry.register('delete_selected', () => {
      const ts = useTimelineStore.getState()
      if (ts.selectedClipIds.length > 0) {
        ts.deleteSelectedClips()
      } else {
        const ps = useProjectStore.getState()
        if (ps.selectedEffectId) {
          ps.removeEffect(ps.selectedEffectId)
        }
      }
    })

    // Duplicate selected effect (deep clone with new ID)
    shortcutRegistry.register('duplicate_effect', () => {
      const ps = useProjectStore.getState()
      if (!ps.selectedEffectId) return
      const source = ps.effectChain.find((e) => e.id === ps.selectedEffectId)
      if (!source) return
      const clone = {
        ...source,
        id: randomUUID(),
        parameters: { ...source.parameters },
        modulations: { ...source.modulations },
      }
      ps.addEffect(clone)
      ps.selectEffect(clone.id)
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

      // Escape in normal mode → stop (reset playhead to 0)
      // Dispatches custom event — handled by a separate useEffect with proper deps
      if (e.code === 'Escape') {
        e.preventDefault()
        window.dispatchEvent(new Event('entropic:stop'))
        return
      }

      // Direct spacebar → play/pause (bypasses registry — most reliable).
      // Routes through handlePlayPauseRef so silent videos use the timer path too.
      if (e.code === 'Space') {
        e.preventDefault()
        handlePlayPauseRef.current()
        return
      }

      // Normal shortcuts — delegate to registry
      if (shortcutRegistry.handleKeyEvent(e)) return

      // Fn+Delete (e.key='Delete') → same as Backspace (delete selected)
      if (e.key === 'Delete') {
        e.preventDefault()
        const ts = useTimelineStore.getState()
        if (ts.selectedClipIds.length > 0) {
          ts.deleteSelectedClips()
        } else {
          const ps = useProjectStore.getState()
          if (ps.selectedEffectId) ps.removeEffect(ps.selectedEffectId)
        }
      }
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

      // F-0512-6: read the chain from the store instead of the closure so that
      // a render queued during an in-flight render (rapid Cmd+Z, drag-reorder,
      // sliders, etc.) picks up the latest chain — not whichever one was bound
      // when the function was created. Legacy path (flag off) reads from
      // closure, which produces stale-frame previews after rapid undo.
      let chain = chainOverride ?? (FF.F_0512_6_UNDO_RERENDER
        ? useProjectStore.getState().effectChain
        : effectChain)

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

        // Collect ALL active clips at current time across all tracks
        const timelineState = useTimelineStore.getState()
        const projectState = useProjectStore.getState()
        const projectAssets = projectState.assets
        const [canvasW, canvasH] = projectState.canvasResolution

        // Active text clips
        const activeTextClips = timelineState.tracks
          .filter((t) => t.type === 'text' && !t.isMuted)
          .flatMap((t) => t.clips.filter((c) =>
            c.textConfig && c.isEnabled !== false && currentTime >= c.position && currentTime < c.position + c.duration,
          ))

        // Active video clips across ALL unmuted video tracks (multi-track compositing)
        const activeVideoClips: { clip: typeof timelineState.tracks[0]['clips'][0]; track: typeof timelineState.tracks[0]; assetPath: string }[] = []
        for (const track of timelineState.tracks) {
          if (track.type !== 'video' || track.isMuted) continue
          for (const clip of track.clips) {
            if (clip.isEnabled === false) continue
            if (currentTime < clip.position || currentTime >= clip.position + clip.duration) continue
            const asset = projectAssets[clip.assetId]
            if (!asset?.path) continue
            activeVideoClips.push({ clip, track, assetPath: asset.path })
          }
        }

        let res
        const hasMultipleLayers = activeVideoClips.length > 1 || activeTextClips.length > 0

        if (hasMultipleLayers || activeVideoClips.length === 0) {
          // Use render_composite for multi-layer rendering
          const videoLayers: Record<string, unknown>[] = activeVideoClips.map(({ clip, track, assetPath }) => {
            const localTime = currentTime - clip.position
            const srcTime = clip.reversed ? Math.max(0, clip.duration - localTime) : localTime
            const clipFrame = Math.max(0, Math.round(
              (srcTime * (clip.speed || 1) + clip.inPoint) * activeFps,
            ))
            const ct = clip.transform
            const trackOpacity = track.opacity ?? 1
            const clipOpacity = clip.opacity ?? 1
            return {
              layer_type: 'video',
              asset_path: assetPath,
              frame_index: clipFrame,
              chain: serializeEffectChain(track.effectChain ?? chain),
              opacity: trackOpacity * clipOpacity,
              blend_mode: track.blendMode ?? 'normal',
              ...(ct && (ct.x !== 0 || ct.y !== 0 || ct.scaleX !== 1 || ct.scaleY !== 1 || ct.rotation !== 0 || ct.flipH || ct.flipV || ct.anchorX !== 0 || ct.anchorY !== 0)
                ? { transform: ct } : {}),
            }
          })

          const textLayers: Record<string, unknown>[] = activeTextClips.map((clip) => {
            const ct = clip.transform
            return {
              layer_type: 'text',
              text_config: serializeTextConfig(clip.textConfig!),
              frame_index: Math.max(0, Math.round((currentTime - clip.position) * 30)),
              fps: 30,
              chain: [],
              opacity: (clip.opacity ?? 1) * (clip.textConfig!.opacity ?? 1),
              blend_mode: 'normal',
              ...(ct && (ct.x !== 0 || ct.y !== 0 || ct.scaleX !== 1 || ct.scaleY !== 1 || ct.rotation !== 0 || ct.flipH || ct.flipV)
                ? { transform: ct } : {}),
            }
          })

          // Fallback: if no video clips, add a single layer from activeAssetPath
          if (videoLayers.length === 0 && activeAssetPath.current) {
            videoLayers.push({
              layer_type: 'video',
              asset_path: activeAssetPath.current,
              frame_index: frame,
              chain: serializeEffectChain(chain),
              opacity: 1.0,
              blend_mode: 'normal',
            })
          }

          const layers = [...videoLayers, ...textLayers]
          res = await window.entropic.sendCommand({
            cmd: 'render_composite',
            layers,
            resolution: [canvasW || frameWidth || 1920, canvasH || frameHeight || 1080],
            project_seed: Date.now() % 2147483647,
          })
        } else {
          // Single video clip — use fast render_frame path
          const { clip: singleClip, assetPath: singleAssetPath } = activeVideoClips[0]
          const ct = singleClip.transform
          // Speed-adjusted source frame; reverse flips local time across clip duration
          const localTime = currentTime - singleClip.position
          const srcTime = singleClip.reversed ? Math.max(0, singleClip.duration - localTime) : localTime
          const clipFrame = Math.max(0, Math.round(
            (srcTime * (singleClip.speed || 1) + singleClip.inPoint) * activeFps,
          ))
          res = await window.entropic.sendCommand({
            cmd: 'render_frame',
            path: singleAssetPath || activeAssetPath.current,
            frame_index: clipFrame,
            chain: serializeEffectChain(chain),
            project_seed: Date.now() % 2147483647,
            ...(serializedOps.length > 0 ? { operators: serializedOps } : {}),
            ...(autoOverrides && Object.keys(autoOverrides).length > 0 ? { automation_overrides: autoOverrides } : {}),
            ...(ct && (ct.x !== 0 || ct.y !== 0 || ct.scaleX !== 1 || ct.scaleY !== 1 || ct.rotation !== 0 || ct.flipH || ct.flipV || ct.anchorX !== 0 || ct.anchorY !== 0)
              ? { transform: ct } : {}),
          })
        }

        if (res.ok && res.frame_data) {
          const dataUrl = `data:image/jpeg;base64,${res.frame_data as string}`
          setFrameDataUrl(dataUrl)
          // Relay every frame unconditionally — main process drops if pop-out closed.
          // Cheaper than a stale gate; avoids the state-divergence bug from F13.
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

  // Base render trigger — fires on frame or master-chain change. Always on.
  useEffect(() => {
    if (!activeAssetPath.current) return
    requestRenderFrame(currentFrame)
  }, [currentFrame, effectChain, requestRenderFrame])

  // F-0512-19: also fire on track-level state change (blend mode, opacity,
  // mute, clip add/remove). Without this, those mutations write to the store
  // but never trigger a re-render IPC. requestRenderFrame's in-flight queue
  // coalesces bursts.
  useEffect(() => {
    if (!FF.F_0512_19_TRACKS_RERENDER) return
    if (!activeAssetPath.current) return
    requestRenderFrame(currentFrame)
  }, [tracks, currentFrame, requestRenderFrame])

  // F-0512-29: also fire on previewState change so initPreviewFromHydratedProject
  // (project reload after Electron relaunch) triggers a render once it has set
  // activeAssetPath.current. Without this, on reload the effect's other deps
  // had already settled in the prior render and the canvas stayed "No video
  // loaded" even though the project was fully wired.
  useEffect(() => {
    if (!FF.F_0512_29_RELOAD_REBIND) return
    if (!activeAssetPath.current) return
    requestRenderFrame(currentFrame)
  }, [previewState, currentFrame, requestRenderFrame])

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

  // PLAY-010 — Preview refs (activeAssetPath / totalFrames / frameWidth / etc.)
  // are App.tsx local state, not part of any Zustand store. Import flow sets them
  // inline; hydrate flows (autosave, recent, future cloud-sync) don't. This helper
  // reconstructs preview state from the first video clip on the timeline and is
  // called by restoreAutosave / loadProject via their onHydrated callback.
  const initPreviewFromHydratedProject = useCallback(async () => {
    if (!window.entropic) return

    const projectState = useProjectStore.getState()
    const timelineState = useTimelineStore.getState()

    let assetPath: string | null = null
    for (const track of timelineState.tracks) {
      if (track.type !== 'video' || track.isMuted) continue
      for (const clip of track.clips) {
        const asset = projectState.assets[clip.assetId]
        if (asset?.path && asset.type === 'video') {
          assetPath = asset.path
          break
        }
      }
      if (assetPath) break
    }
    if (!assetPath) return

    const res = await window.entropic.sendCommand({ cmd: 'ingest', path: assetPath })
    if (!res.ok) {
      console.warn('[initPreview] ingest probe failed for', assetPath, res.error)
      return
    }

    const assetHasAudio = (res.has_audio as boolean) || false
    setTotalFrames(res.frame_count as number)
    setFrameWidth(res.width as number)
    setFrameHeight(res.height as number)
    setActiveFps(res.fps as number)
    activeAssetPath.current = assetPath
    setCurrentFrame(0)
    setHasAudio(assetHasAudio)
    setPreviewState('loading')

    if (assetHasAudio) {
      const audioLoaded = await audioStore.loadAudio(assetPath)
      if (audioLoaded) {
        await audioStore.setFps(res.fps as number)
        loadWaveform(assetPath)
      }
    }
  }, [audioStore, loadWaveform, setCurrentFrame, setTotalFrames])
  initPreviewRef.current = initPreviewFromHydratedProject

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
        // Auto-create track + clip on import (CapCut behavior)
        // Grouped as single undo entry so Cmd+Z reverses the entire import
        // Asset, track, clip, and preview state all included in transaction
        const prevAssetPath = activeAssetPath.current
        const prevTotalFrames = totalFrames
        const prevFrameWidth = frameWidth
        const prevFrameHeight = frameHeight
        const prevActiveFps = activeFps

        const undoStore = useUndoStore.getState()
        undoStore.beginTransaction('Import media')

        // Add asset inside transaction so undo removes it
        undoStore.execute({
          description: 'Add asset',
          timestamp: Date.now(),
          forward: () => addAsset(asset),
          inverse: () => {
            removeAsset(asset.id)
            // Clear preview state on undo
            activeAssetPath.current = prevAssetPath
            setTotalFrames(prevTotalFrames)
            setFrameWidth(prevFrameWidth ?? 0)
            setFrameHeight(prevFrameHeight ?? 0)
            setCurrentFrame(0)
            useTimelineStore.getState().setPlayheadTime(0)
          },
        })

        const timeline = useTimelineStore.getState()
        const trackColors = ['#ef4444', '#f59e0b', '#4ade80', '#3b82f6', '#a855f7', '#ec4899']
        const trackColor = trackColors[timeline.tracks.length % trackColors.length]
        const trackName = `Track ${timeline.tracks.length + 1}`
        const trackId = timeline.addTrack(trackName, trackColor)
        if (trackId) {
          const clipDuration = isImage ? 5 : (res.duration_s as number)
          // Place new clips at position 0 on their own track (NLE convention)
          // Auto-fit transform: scale media to fit project canvas
          const [projW, projH] = useProjectStore.getState().canvasResolution
          const canvasW = projW || frameWidth || 1920
          const canvasH = projH || frameHeight || 1080
          const srcW = asset.meta.width
          const srcH = asset.meta.height
          const fitScale = (srcW > canvasW || srcH > canvasH)
            ? Math.min(canvasW / srcW, canvasH / srcH)
            : 1
          const rounded = Math.round(fitScale * 100) / 100
          const clipTransform = fitScale !== 1
            ? { x: 0, y: 0, scaleX: rounded, scaleY: rounded, rotation: 0, anchorX: 0, anchorY: 0, flipH: false, flipV: false }
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
    [addAsset, removeAsset, setTotalFrames, setCurrentFrame, setIngesting, setIngestError, requestRenderFrame, audioStore, loadWaveform, totalFrames, frameWidth, frameHeight, activeFps],
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

  const handleNewProject = useCallback(() => {
    newProject()
    setFrameDataUrl(null)
    setFrameWidth(0)
    setFrameHeight(0)
    setActiveFps(30)
    setIsTimerPlaying(false)
    setPreviewState('empty')
    setRenderError(null)
    activeAssetPath.current = null
    // F-0512-1: "New Project" implies Start Fresh — dismiss any pending
    // autosave / crash recovery prompt so the user is not asked again
    // about a session they have just chosen to abandon.
    if (FF.F_0512_1_WELCOME_MODAL) {
      setAutosavePath(null)
      setCrashReports([])
    }
  }, [])

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
        case 'new-project': handleNewProject(); break
        case 'open-project': loadProject(undefined, () => initPreviewRef.current()); break
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
            const anchor = {
              x: Math.max(0, Math.round(window.innerWidth / 2) - 100),
              y: Math.max(0, Math.round(window.innerHeight / 2) - 80),
            }
            ts2.openSpeedDialog(ts2.selectedClipIds[0], anchor)
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
        case 'show-shortcuts':
          // F-0512-37: Help → Keyboard Shortcuts opens Preferences on the
          // Shortcuts tab instead of the default General tab.
          if (FF.F_0512_37_SHORTCUTS_TAB) setPreferencesInitialTab('shortcuts')
          setShowPreferences(true)
          break
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
    if (FF.F_0512_14_SPACE_TRANSPORT) {
      // F-0512-14 / F-0512-15: space and ▶ both route here, so this must always
      // produce plain play/pause behavior regardless of prior J/K/L state.
      // Previously we only toggled the audio transport; a stale isTimerPlaying
      // from J (reverse) would keep the timer running in reverse while audio
      // resumed forward, creating fights and "space toggles direction" UX.
      const audio = useAudioStore.getState()
      const audioIsPlaying = audio.isPlaying
      const timerIsPlaying = isTimerPlayingRef.current

      if (audioIsPlaying || timerIsPlaying) {
        // Pause every active transport. Leave the JKL direction state intact so
        // a subsequent J/L press picks up where the user left off; only space's
        // own next press resets it (below).
        if (audioIsPlaying) audio.togglePlayback()
        if (timerIsPlaying) setIsTimerPlaying(false)
        return
      }

      // Resume from a paused/stopped state. Space is unambiguously forward at 1×.
      resetTransportSpeed()
      setTransportSpeedMultiplier(1)
      if (hasAudio && audio.isLoaded) {
        audio.togglePlayback()
      } else {
        setIsTimerPlaying(true)
      }
      return
    }

    // Legacy path (F-0512-14 disabled): pre-fix behavior. Only toggles the
    // primary transport; can leave JKL timer running in reverse.
    if (hasAudio && audioStore.isLoaded) {
      audioStore.togglePlayback()
    } else {
      setIsTimerPlaying((prev) => !prev)
    }
  }, [hasAudio, audioStore])
  handlePlayPauseRef.current = handlePlayPause

  const handleStop = useCallback(() => {
    const ts = useTimelineStore.getState()
    if (FF.F_0512_16_ESCAPE_LOOP) {
      // F-0512-16: if transport is already at rest at frame 0 AND a loop region
      // is set, treat the next Stop / Escape press as "clear the loop region"
      // so users who accidentally set one can dismiss it without hunting for
      // a button. First press: stop + return to 0 (existing behaviour). Second
      // press while already stopped: clear loop region overlay.
      const audioPlaying = hasAudio && audioStore.isLoaded && audioStore.isPlaying
      const alreadyStopped =
        !audioPlaying && !isTimerPlayingRef.current && ts.playheadTime === 0
      if (alreadyStopped && ts.loopRegion) {
        ts.clearLoopRegion()
        return
      }
    }

    if (hasAudio && audioStore.isLoaded) {
      if (audioStore.isPlaying) audioStore.togglePlayback()
      audioStore.seek(0)
    }
    setIsTimerPlaying(false)
    setCurrentFrame(0)
    ts.setPlayheadTime(0)
  }, [hasAudio, audioStore, setCurrentFrame])

  // Escape key stop — listens for custom event dispatched from keydown handler
  // (keydown handler has [] deps so can't call handleStop directly)
  useEffect(() => {
    const onStop = () => handleStop()
    window.addEventListener('entropic:stop', onStop)
    return () => window.removeEventListener('entropic:stop', onStop)
  }, [handleStop])

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
  // Only runs when there's no audio to drive the clock.
  // Supports J/K/L speed ramping via transportSpeedMultiplier.
  useEffect(() => {
    if (!isTimerPlaying || totalFrames === 0) return

    const speedMult = Math.max(1, transportSpeedMultiplier)
    const isReverse = getTransportDirection() === 'reverse'
    const frameDuration = 1000 / (activeFps * speedMult)
    let lastFrameTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - lastFrameTime
      if (elapsed >= frameDuration) {
        const framesToAdvance = Math.max(1, Math.floor(elapsed / frameDuration))
        lastFrameTime = now - (elapsed % frameDuration)
        const current = useProjectStore.getState().currentFrame
        const isLooping = useTimelineStore.getState().isLooping
        let nextFrame: number
        let reachedEnd = false
        if (isReverse) {
          nextFrame = current - framesToAdvance
          if (nextFrame < 0) {
            if (isLooping) nextFrame = totalFrames - 1
            else { nextFrame = 0; reachedEnd = true }
          }
        } else {
          const raw = current + framesToAdvance
          if (raw >= totalFrames) {
            if (isLooping) nextFrame = raw % totalFrames
            else { nextFrame = totalFrames - 1; reachedEnd = true }
          } else {
            nextFrame = raw
          }
        }
        setCurrentFrame(nextFrame)
        if (activeFps > 0) {
          useTimelineStore.getState().setPlayheadTime(nextFrame / activeFps)
        }
        if (reachedEnd) {
          setIsTimerPlaying(false)
          return
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
  }, [isTimerPlaying, totalFrames, activeFps, setCurrentFrame, transportSpeedMultiplier])

  const handleExport = useCallback(
    async (settings: ExportSettings) => {
      if (!window.entropic) {
        console.error('[export] window.entropic bridge missing')
        useToastStore.getState().addToast({
          level: 'error',
          message: 'Export unavailable',
          source: 'export',
          details: 'IPC bridge to backend is missing. Restart the app.',
        })
        setShowExportDialog(false)
        return
      }
      if (!activeAssetPath.current) {
        console.error('[export] no active asset loaded — cannot export')
        useToastStore.getState().addToast({
          level: 'error',
          message: 'No asset loaded',
          source: 'export',
          details: 'Load a video or image before exporting.',
        })
        setShowExportDialog(false)
        return
      }

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
        useToastStore.getState().addToast({
          level: 'info',
          message: 'Export started',
          source: 'export-start',
          details: settings.outputPath,
        })
      } else {
        setExportError(res.error as string)
        setIsExporting(false)
        useToastStore.getState().addToast({
          level: 'error',
          message: 'Export failed to start',
          source: 'export-error',
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
  const isLooping = useTimelineStore((s) => s.isLooping)
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
          <button
            className={`app__transport-btn ${isLooping ? 'app__transport-btn--active' : ''}`}
            onClick={() => useTimelineStore.getState().toggleLooping()}
            title={isLooping ? 'Loop: on (click to disable)' : 'Loop: off (click to enable)'}
          >
            ⟳
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
            transform={selectedClip.transform ?? IDENTITY_TRANSFORM}
            onChange={(t) => {
              useTimelineStore.getState().setClipTransform(selectedClip.id, t)
              requestRenderFrame(currentFrame)
            }}
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
            aspectLocked={aspectLocked}
            onAspectLockChange={setAspectLocked}
            opacity={selectedClip.opacity ?? 1}
            onOpacityChange={(o) => {
              useTimelineStore.getState().setClipOpacity(selectedClip.id, o)
              requestRenderFrame(currentFrame)
            }}
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
            ref={previewContainerRef}
            style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}
            onDoubleClick={() => {
              // Double-click preview to select the topmost video clip at current playhead time
              const tl = useTimelineStore.getState()
              const currentTime = tl.playheadTime
              for (const track of [...tl.tracks].reverse()) {
                if (track.type !== 'video' || track.isMuted) continue
                for (const clip of track.clips) {
                  if (clip.isEnabled === false) continue
                  if (currentTime >= clip.position && currentTime < clip.position + clip.duration) {
                    tl.selectClip(clip.id)
                    return
                  }
                }
              }
            }}
            onClick={(e) => {
              const tl = useTimelineStore.getState()

              // Click-to-place text: if a text track is selected but no text clip exists at playhead, create one
              const selTrack = tl.tracks.find((t) => t.id === tl.selectedTrackId)
              if (selTrack?.type === 'text' && !selectedTextClip) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                const relX = Math.round(((e.clientX - rect.left) / rect.width) * (frameWidth || 1920))
                const relY = Math.round(((e.clientY - rect.top) / rect.height) * (frameHeight || 1080))
                tl.addTextClip(selTrack.id, { text: 'Text', fontFamily: 'Helvetica', fontSize: 48, color: '#ffffff', position: [relX, relY], alignment: 'left', opacity: 1.0, strokeWidth: 0, strokeColor: '#000000', shadowOffset: [0, 0], shadowColor: '#00000080', animation: 'none', animationDuration: 1.0 }, tl.playheadTime, 5)
                return
              }

              // Deselect clip when clicking empty canvas area.
              // Don't deselect if click originated from inside the bounding box overlay
              // (drag operations fire mousedown→mousemove→mouseup→click, and we must
              //  suppress the click after a drag to avoid deselecting mid-transform).
              const target = e.target as HTMLElement
              const isOverlayClick = target.closest('.bounding-box-overlay') !== null
              if (tl.selectedClipIds.length > 0 && !isOverlayClick) {
                tl.clearSelection()
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
            {selectedClip && !selectedClip.textConfig && (
              <BoundingBoxOverlay
                transform={selectedClip.transform ?? IDENTITY_TRANSFORM}
                onChange={(t) => {
                  useTimelineStore.getState().setClipTransform(selectedClip.id, t)
                  requestRenderFrame(currentFrame)
                }}
                containerRef={previewContainerRef}
                sourceWidth={assets[selectedClip.assetId]?.meta?.width ?? 1920}
                sourceHeight={assets[selectedClip.assetId]?.meta?.height ?? 1080}
                canvasWidth={frameWidth || 1920}
                canvasHeight={frameHeight || 1080}
                aspectLocked={aspectLocked}
              />
            )}
            {selectedClip && !selectedClip.textConfig && (
              <SnapGuides
                transform={selectedClip.transform ?? IDENTITY_TRANSFORM}
                sourceWidth={assets[selectedClip.assetId]?.meta?.width ?? 1920}
                sourceHeight={assets[selectedClip.assetId]?.meta?.height ?? 1080}
                containerRef={previewContainerRef}
                canvasWidth={frameWidth || 1920}
                canvasHeight={frameHeight || 1080}
                enabled={true}
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
              {/* F-0512-17: read resolution from the project canvas (stable),
                  not the most-recent rendered frame width (flips between
                  source dims and canvas dims across user actions). */}
              {(() => {
                const w = FF.F_0512_17_STATUS_BAR_CANVAS ? canvasResolution[0] : frameWidth
                return <span className="status-bar__metric">{w >= 3840 ? '4K' : w >= 1920 ? '1080p' : w >= 1280 ? '720p' : `${w}p`}</span>
              })()}
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
        initialTab={preferencesInitialTab}
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

      {startupChecked && (!FF.F_0512_1_WELCOME_MODAL || !welcomeDismissed) && (crashReports.length > 0 || autosavePath !== null) && !window.entropic?.isTestMode && (
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

      <SpeedDialogHost />

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
        onNewProject={() => { handleNewProject(); setWelcomeDismissed(true) }}
        onOpenProject={() => { setWelcomeDismissed(true); loadProject(undefined, () => initPreviewRef.current()) }}
        onOpenRecent={(path) => { setWelcomeDismissed(true); loadProject(path, () => initPreviewRef.current()) }}
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
