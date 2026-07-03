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
import MaskSelectOverlay from './components/preview/MaskSelectOverlay'
import ExportDialog from './components/export/ExportDialog'
import type { ExportSettings } from './components/export/ExportDialog'
import ExportProgress from './components/export/ExportProgress'
import Timeline from './components/timeline/Timeline'
import SpeedDialog from './components/timeline/SpeedDialog'
// Phase 13C: HistoryPanel removed from sidebar.
// F-0514-18 (2026-05-15): re-surfaced via Edit → Undo History menu (see menu.ts).
import HistoryPanel from './components/layout/HistoryPanel'
import DeviceChain from './components/device-chain/DeviceChain'
import TransformPanel from './components/timeline/TransformPanel'
import HelpPanel from './components/effects/HelpPanel'
// P3.3: Polymorphic inspector (8 states, info-only)
import Inspector from './components/inspector/Inspector'
// B3 / L3: LAYER inspector panel (right-dock, above EFFECTS) — bound to the
// selected track. Mounted flag-gated (F_CREATRIX_LAYOUT) in the sidebar.
import LayerPanel from './components/timeline/LayerPanel'
// B2: track-bound samplers (instruments browser + performance-track device + render).
// P5a.3: buildVoiceLayers replaces buildSamplerLayer in the render path (multi-voice FSM).
//        buildSamplerLayer kept for legacy callers outside the voice path.
import InstrumentsBrowser from './components/instruments/InstrumentsBrowser'
import SamplerDevice from './components/instruments/SamplerDevice'
import RackDevice from './components/instruments/RackDevice'
import FrameBankDevice from './components/instruments/FrameBankDevice'
import GranulatorDevice from './components/instruments/GranulatorDevice'
import { buildSamplerLayer, buildVoiceLayers } from './components/instruments/buildSamplerLayer'
import { buildRackLayers } from './components/instruments/buildRackLayers'
import { resolveRackMacros } from './components/instruments/resolveRackMacros'
import { serializeFrameBanks } from './components/instruments/serializeFrameBanks'
import { buildGranulatorLayer } from './components/instruments/buildGranulatorLayer'
import type { SamplerInstrumentV1, RackPad } from './components/instruments/types'
import { resolveSamplerModulations } from './components/instruments/resolveSamplerModulations'
import { evaluateVoices } from './components/instruments/voiceFSM'
import { useInstrumentsStore } from './stores/instruments'
import './styles/instruments.css'
import './styles/creatrix-layout.css'
import './styles/b3-layout.css'
import type { Asset, EffectInstance } from '../shared/types'
import { IDENTITY_TRANSFORM, getTrackCompositing } from '../shared/types'
import BoundingBoxOverlay from './components/preview/BoundingBoxOverlay'
import SnapGuides from './components/preview/SnapGuides'
import type { WaveformPeaks } from './components/transport/useWaveform'
import {
  serializeEffectChain,
  serializeMaskStack,
  serializeTextConfig,
  buildMasterChainPayload,
  shouldUseCompositePath,
} from '../shared/ipc-serialize'
import { randomUUID } from './utils'
import { shortcutRegistry } from './utils/shortcuts'
import { transportForward, transportReverse, transportStop, getTransportDirection, resetTransportSpeed } from './utils/transport-speed'
import { shouldClearLoopOnStop } from './utils/transport-stop'
import { DEFAULT_SHORTCUTS } from './utils/default-shortcuts'
import { splitSelectedClipsAtPlayhead } from './utils/split-clip-at-playhead'
import { saveProject, saveProjectAs, loadProject, newProject, startAutosave, stopAutosave, restoreAutosave, probeForMissingAssets, relinkAsset, markAssetMissing } from './project-persistence'
import { getActiveTrackId, getActiveEffectChain, useActiveEffectChain } from './stores/project'
import { FF } from '../shared/feature-flags'
import { useSettingsStore } from './stores/settings'
import TelemetryConsentDialog from './components/dialogs/TelemetryConsentDialog'
import CrashRecoveryDialog from './components/dialogs/CrashRecoveryDialog'
import RelinkDialog, { type MissingAsset } from './components/dialogs/RelinkDialog'
import FeedbackDialog from './components/dialogs/FeedbackDialog'
import UnsavedChangesDialog from './components/dialogs/UnsavedChangesDialog'
import PerformancePanel from './components/performance/PerformancePanel'
import PadEditor from './components/performance/PadEditor'
import { usePerformanceStore } from './stores/performance'
import { usePerformanceFreezeStore, buildBakePayload } from './stores/performanceFreeze'
import { applyPadModulations } from './components/performance/applyPadModulations'
import { applyCCModulations } from './components/performance/applyCCModulations'
import { applyBankModulations, resolveBankMacroOverrides } from './components/performance/applyBankModulations'
import { useMIDIStore } from './stores/midi'
import { snapshotMappingContext, defaultAssignmentSourcesFor } from './utils/mappingSnapshot'
import { installCCRecordSubscriber } from './utils/cc-record'
import { useMIDI } from './hooks/useMIDI'
import { useAudioMeterPoll } from './hooks/useAudioMeterPoll'
import { useMemoryPressurePoll } from './hooks/useMemoryPressurePoll'
import MemoryStatus from './components/statusbar/MemoryStatus'
import { handlePadTrigger, releasePadWithCapture } from './components/performance/padActions'
// Operators re-mounted 2026-05-15 (post-UAT synthesis). Backend already wires
// serialized operators (see requestRenderFrame). UI panel toggle: Cmd+Shift+O.
import OperatorRack from './components/operators/OperatorRack'
import ModulationMatrix from './components/operators/ModulationMatrix'
import RoutingLines from './components/operators/RoutingLines'
import { useOperatorStore } from './stores/operators'
import { useAutomationStore } from './stores/automation'
import { evaluateAutomationOverrides, applyAutomationOverridesToChain } from './utils/evaluateAutomationOverrides'
import { evaluateTransformOverrides, mergeTransformOverride, formatTransformLanePath, parseTransformLanePath, type TransformField } from './utils/transformLanes'
import { recordChangedTransformFields } from './utils/transform-record'
// H1 (2026-07-02 master-tuneup WS5): focused-mapping-context statusbar chip —
// the foundation the hardware-bank system (H2+) keys off. See
// utils/focusContext.ts (derivation) + components/layout/MappingContextChip.tsx.
import MappingContextChip from './components/layout/MappingContextChip'
// H-UI (2026-07-02 master-tuneup WS5): Ableton-style visual hardware-mapping
// overlay ("MIDI Map mode") — the view/hand-edit layer over the H1–H5 engine.
import MIDIMapOverlay from './components/performance/MIDIMapOverlay'
import { useMIDIMapModeStore } from './stores/midiMapMode'
import BankPagingHUD from './components/layout/BankPagingHUD'
import { buildAxisLanes } from '../shared/axis-lanes'
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
import './styles/routing-canvas.css'
import './styles/floating-panel.css'
import './styles/midi-map.css'
import './styles/automation.css'
import './styles/library.css'
import './styles/toast.css'
import './styles/export.css'
import './styles/text.css'
import './styles/device-chain.css'
import './styles/masking.css'
// MK.7: Mask stack editing panel
import MaskStackPanel from './components/masking/MaskStackPanel'
// P3.5: Demos drawer + first-launch onboarding
import DemosDrawer, { type DemoId } from './components/demos/DemosDrawer'
import BootLine from './components/demos/BootLine'
import { useOnboardingStore } from './stores/onboarding'
import './styles/demos.css'
import WelcomeScreen from './components/layout/WelcomeScreen'
import Preferences from './components/layout/Preferences'
import AboutDialog from './components/layout/AboutDialog'
import RenderQueue from './components/export/RenderQueue'
import { RoutingCanvas } from './components/routing-canvas'
import ErrorBoundary from './components/layout/ErrorBoundary'
import { loadRecentProjects, type RecentProject } from './project-persistence'

/**
 * D4 (Epic 02): Pure helper — apply pad + CC modulation to ANY chain at a given frame.
 * Called per-track in the render path so each track's chain is independently modulated.
 * CC/pad modulations target a specific effectId; applying this to each track's chain
 * only mutates matching effects — equivalent to the old single-chain behaviour.
 *
 * H2: CC resolution now goes through applyBankModulations, which merges the
 * legacy direct `ccMappings` with any bank-bound CC's LIVE, focus-resolved
 * target (bank wins on CC collision) before delegating to the same
 * applyCCModulations this always called. When there are no bank bindings at
 * all, applyBankModulations degrades to exactly the old direct-mappings path
 * (regression-safe — see applyBankModulations.ts).
 */
function modulateChain(chain: EffectInstance[], frame: number): EffectInstance[] {
  const perf = usePerformanceStore.getState()
  const env = perf.getEnvelopeValues(frame)
  let out: EffectInstance[] = Object.keys(env).length > 0
    ? applyPadModulations(chain, perf.drumRack.pads, env)
    : chain
  const midi = useMIDIStore.getState()
  const hasDirectMappings = midi.ccMappings.length > 0
  const hasBankBindings = midi.ccBankBindings.length > 0
  if ((hasDirectMappings || hasBankBindings) && Object.keys(midi.ccValues).length > 0) {
    const context = snapshotMappingContext()
    out = applyBankModulations(
      out,
      midi.ccMappings,
      midi.ccBankBindings,
      midi.ccValues,
      midi.bankAssignments,
      context,
      defaultAssignmentSourcesFor(context),
      undefined,
      midi.activeBankIndex, // H7 — page the bank-assignment lookup, not just focus
    )
  }
  return out
}

/**
 * P3.2: Statusbar chip showing the active cursor tool when the [tool] tab is active.
 * Reads data-cursor-tool set by EffectBrowser's useEffect (avoids prop-drilling).
 * Hidden when no tool attribute is present (i.e. tool tab not active).
 */
function CursorToolChip() {
  const [tool, setTool] = React.useState<string | null>(null)

  React.useEffect(() => {
    // Sync from DOM attribute set by EffectBrowser
    const sync = () => {
      const val = document.body.getAttribute('data-cursor-tool')
      setTool(val)
    }
    sync()
    // MutationObserver watches for attribute changes
    const obs = new MutationObserver(sync)
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-cursor-tool'] })
    return () => obs.disconnect()
  }, [])

  if (!tool) return null
  return (
    <span
      className="status-bar__cursor-tool-chip"
      title="Active cursor tool (set in [tool] tab)"
      data-testid="statusbar-cursor-tool-chip"
    >
      tool: {tool}
    </span>
  )
}

// H-UI (2026-07-02 master-tuneup WS5): statusbar toggle for MIDI Map mode.
// Opens the visual hardware-mapping overlay (MIDIMapOverlay). Sits next to the
// focus chip since it acts on the same mapping context the chip displays.
function MapModeToggle() {
  const mapMode = useMIDIMapModeStore((s) => s.mapMode)
  const toggleMapMode = useMIDIMapModeStore((s) => s.toggleMapMode)
  return (
    <button
      className="status-bar__map-toggle"
      data-testid="statusbar-map-toggle"
      data-active={mapMode ? 'true' : 'false'}
      aria-pressed={mapMode}
      title="Toggle MIDI Map mode — visualize and edit hardware bindings"
      onClick={() => toggleMapMode()}
    >
      MAP
    </button>
  )
}

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

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.mxf', '.ts', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.bmp', '.heic', '.heif', '.wav', '.mp3', '.m4a', '.aif', '.aiff', '.ogg', '.flac']
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aif', '.aiff', '.ogg', '.flac']

function AppInner() {
  const { status, uptime } = useEngineStore()
  // HT-4: project-level seed (reactive). Replaces 3 sites that previously used
  // `Date.now() % 2147483647` — those produced non-deterministic renders and
  // freeze cache-ids that could collide across re-freezes.
  const projectSeed = useProjectStore((s) => s.seed)
  const {
    assets,
    selectedEffectId,
    currentFrame,
    totalFrames,
    isIngesting,
    ingestError,
    projectName,
    canvasResolution,
    addAsset,
    removeAsset,
    addEffect: addEffectRaw,
    setCurrentFrame,
    setTotalFrames,
    setIngesting,
    setIngestError,
  } = useProjectStore()

  // Epic 05 D3/D4: effectChain sourced from the active track (not the deleted
  // global effectChain field). Reactive via useActiveEffectChain hook.
  const effectChain = useActiveEffectChain()

  // D3 (Epic 02): use active-track rule (D1) — getActiveTrackId() resolves selectedTrackId
  // if valid, else first video track, else null. Early-return if null (safe no-op).
  const addEffect = useCallback((effect: EffectInstance) => {
    const trackId = getActiveTrackId()
    if (!trackId) return
    addEffectRaw(trackId, effect)
  }, [addEffectRaw])

  const isDirty = useUndoStore((s) => s.isDirty)
  // P5a.3: arming derived from selected track type (modal flag retired).
  // Pads are armed whenever the selected track is a performance track.
  // Reactive: re-renders when selectedTrackId or track type changes.
  const isPerformArmed = useTimelineStore((s) => {
    const selId = s.selectedTrackId
    if (!selId) return false
    const track = s.tracks.find((t) => t.id === selId)
    return track?.type === 'performance'
  })

  // F-0512-19: subscribe to tracks so the render trigger below re-fires when
  // any track-level state mutates (blend mode, opacity, mute, clip add/remove).
  // Reactive subscription — needed at top of AppInner so it is in scope for
  // the render-trigger useEffect.
  const tracks = useTimelineStore((s) => s.tracks)

  // Initialize MIDI (Web MIDI API)
  useMIDI()
  useAudioMeterPoll()
  useMemoryPressurePoll()

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
  // P6.10 (I2): Routing Canvas overlay (⌘⇧I toggles).
  const [showRoutingCanvas, setShowRoutingCanvas] = useState(false)
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
  // B3.2: imperative mirror of operatorValues for the requestRenderFrame
  // closure (deps [effectChain]); read at exec time so sampler scrub/speed
  // modulation uses the latest per-frame values without re-creating the cb.
  const operatorValuesRef = useRef<Record<string, number>>({})
  // Operators panel: re-mounted 2026-05-15 as floating overlay. Toggle with Cmd+Shift+O.
  const [showOperators, setShowOperators] = useState(false)
  // F-0514-18: HistoryPanel re-surfaced via Edit → Undo History.
  const [showHistory, setShowHistory] = useState(false)
  // F-0514-17: discard-changes prompt before destructive nav (Cmd+O / Cmd+N).
  // Pre-fix, Cmd+O silently overwrote unsaved work — real data-loss risk.
  const [pendingNav, setPendingNav] = useState<null | { kind: 'open' | 'new' }>(null)
  // RT-1: tracks an in-flight Save-and-Continue. Pre-lock, a user clicking
  // Discard during the saveProject await could clobber the freshly-loaded
  // project's projectPath/projectName/isDirty with the OLD project's metadata
  // (the await write resolves AFTER loadProject hydrated the new stores, and
  // saveProject finalizes the OLD path's bookkeeping onto whatever state is
  // currently mounted). Locking all 3 buttons during the await closes the race.
  const [isNavSaving, setIsNavSaving] = useState(false)

  // UE.5: media relink dialog state
  const [relinkAssets, setRelinkAssets] = useState<MissingAsset[]>([])
  const [showRelinkDialog, setShowRelinkDialog] = useState(false)

  // Audio-specific state
  const [hasAudio, setHasAudio] = useState(false)
  const [waveformPeaks, setWaveformPeaks] = useState<WaveformPeaks | null>(null)
  const [clipThumbnails, setClipThumbnails] = useState<{ time: number; data: string }[]>([])

  // H4: imperative mirror of hasAudio so the mount-only CC-record subscriber can
  // compute isPlaying (= hasAudio ? audioStore.isPlaying : isTimerPlaying) at
  // fire time without re-installing on every hasAudio flip.
  const hasAudioRef = useRef(false)
  useEffect(() => {
    hasAudioRef.current = hasAudio
  }, [hasAudio])

  // H4 (master-tuneup WS5 capstone): record hardware CC moves as automation.
  // Subscribes to ccValues changes (already rate-limited/echo-suppressed by B10)
  // and, ONLY when recording is armed + transport playing, commits each moved CC
  // through the same latch/touch record path as a manual knob drag. Installed
  // once; unsubscribes on unmount.
  useEffect(() => {
    return installCCRecordSubscriber(() =>
      hasAudioRef.current ? useAudioStore.getState().isPlaying : isTimerPlayingRef.current,
    )
  }, [])

  // Startup diagnostics state
  const { telemetryConsent, consentChecked, checkConsent, setConsent } = useSettingsStore()
  const [crashReports, setCrashReports] = useState<Record<string, unknown>[]>([])
  const [autosavePath, setAutosavePath] = useState<string | null>(null)
  const [startupChecked, setStartupChecked] = useState(false)
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false)
  const [editingPadId, setEditingPadId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'effects' | 'presets' | 'instruments'>('effects')
  // B2: reactive subscription so sampler add/edit/source/remove triggers a re-render (effect below).
  const instruments = useInstrumentsStore((s) => s.instruments)
  // B6.2: reactive subscription so frameBank add/edit/position/remove triggers a
  // preview re-render (effect below). Without it the frameBank preview payload is
  // a dead flag — wired but never sent on a bank change (Gate 14 wiring check).
  const frameBanks = useInstrumentsStore((s) => s.frameBanks)
  // B8: reactive subscription so granulator add/edit/density/window/axes/selection
  // changes trigger a preview re-render (effect below). Without it the granulator
  // preview payload is a dead flag — wired but never re-sent on a param change
  // (Gate 14 wiring check; mirror of the frameBanks subscription above).
  const granulators = useInstrumentsStore((s) => s.granulators)
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [showPresetSave, setShowPresetSave] = useState<{ mode: 'single_effect' | 'effect_chain'; instanceId?: string } | null>(null)

  // P3.5: Onboarding + demos
  const onboardingInit = useOnboardingStore((s) => s.init)
  const onboardingDismissed = useOnboardingStore((s) => s.dismissed)
  const onboardingLaunchCount = useOnboardingStore((s) => s.launchCount)
  const onboardingEngaged = useOnboardingStore((s) => s.engaged)
  const onboardingPromptAnswered = useOnboardingStore((s) => s.promptAnswered)
  const recordPromptAnswered = useOnboardingStore((s) => s.recordPromptAnswered)
  const dismissOnboarding = useOnboardingStore((s) => s.dismiss)
  const [demoPaths, setDemoPaths] = useState<Record<DemoId, string | null>>({
    y_is_time: null,
    painted_blur: null,
    audio_lfo_stripes: null,
  })
  const [showHideDemosToast, setShowHideDemosToast] = useState(false)
  const [bootLineDone, setBootLineDone] = useState(false)

  const activeAssetPath = useRef<string | null>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const [aspectLocked, setAspectLocked] = useState(true)
  const isRenderingRef = useRef(false)
  const pendingFrameRef = useRef<number | null>(null)
  const playbackRafRef = useRef<number | null>(null)
  const clockSyncRafRef = useRef<number | null>(null)
  const handlePlayPauseRef = useRef<() => void>(() => {})
  const initPreviewRef = useRef<() => Promise<void>>(async () => {})
  const lastDisabledEffectsRef = useRef<string>('')
  // SG-3 clause-3: dedup ref so we don't toast on every frame after an abort
  const lastLaneAbortedKeyRef = useRef<string>('')
  // P5b.8 (SG-5): guard so the cycle-warning toast fires at most once per export job
  const sg5CycleWarnSeenRef = useRef(false)
  // P3.1: drag suppression ref for resize handles (feedback_drag-end-suppresses-click)
  const cxIsDragging = useRef(false)

  // Layout store for sidebar/timeline collapse
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const timelineCollapsed = useLayoutStore((s) => s.timelineCollapsed)

  // P3.1: Creatrix layout store subscriptions
  const leftColW = useLayoutStore((s) => s.leftColW)
  const inspectorH = useLayoutStore((s) => s.inspectorH)
  const previewHPct = useLayoutStore((s) => s.previewHPct)
  const deviceChainH = useLayoutStore((s) => s.deviceChainH)
  const previewCollapsed = useLayoutStore((s) => s.previewCollapsed)

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

  // P3.5: Initialize onboarding store + load demo paths on mount.
  useEffect(() => {
    // Initialize store (reads localStorage, decides whether to auto-open drawer).
    onboardingInit()

    // P4.5 (test-only): expose the operator store so the topology-graph E2E can
    // seed the exact "1 LFO mapped to an effect param" fixture deterministically
    // (the Zustand stores are module-scoped and otherwise unreachable from
    // Playwright). Gated on the preload's runtime test flag (set from the main
    // process NODE_ENV the Playwright fixture injects) — this survives the
    // production renderer build, unlike a build-inlined process.env check, and
    // is absent in real launches where isTestMode is false.
    if (window.entropic?.isTestMode) {
      ;(window as unknown as { __creatrixTest?: Record<string, unknown> }).__creatrixTest = {
        operatorStore: useOperatorStore,
        // The topology graph consumes the SAME `operatorValues` state the live
        // render loop feeds. Exposing the setter lets the E2E drive live values
        // deterministically (no wall-clock timer flake) while exercising the
        // identical prop → rAF → DOM animation path the real loop drives.
        setOperatorValues,
      }
    }

    // Load demo file paths from main process via the ONE runtime-dir constant.
    if (window.entropic?.getDemoPaths) {
      window.entropic.getDemoPaths().then((paths) => {
        setDemoPaths(paths as Record<DemoId, string | null>)
      }).catch(() => {
        // Demo paths unavailable — all cards will show error state; non-fatal.
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // P3.5: §7 no-engagement toast — show once after 3 zero-engagement launches.
  useEffect(() => {
    if (
      !onboardingDismissed &&
      onboardingLaunchCount >= 3 &&
      !onboardingEngaged &&
      !onboardingPromptAnswered
    ) {
      setShowHideDemosToast(true)
    }
  }, [onboardingDismissed, onboardingLaunchCount, onboardingEngaged, onboardingPromptAnswered])

  const handleConsentDecision = useCallback((consent: boolean) => {
    setConsent(consent)
  }, [setConsent])

  const handleCrashRestore = useCallback(async (_sendReport: boolean) => {
    if (autosavePath) {
      await restoreAutosave(autosavePath, handleProjectHydrated)
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
    // show plain "Creatrix" instead of the default "Untitled — Creatrix".
    if (FF.F_0512_3_TITLE_BAR && !welcomeDismissed) {
      document.title = 'Creatrix'
      return
    }
    document.title = isDirty ? `${projectName} * — Creatrix` : `${projectName} — Creatrix`
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
    // F-0514-17 follow-up: BOTH the keyboard shortcut AND the menu action must
    // pass through the discard-changes gate. Pre-fix, Cmd+O bypassed the prompt
    // entirely and opened the file picker on a dirty project — silent data loss.
    shortcutRegistry.register('open', () => {
      if (useUndoStore.getState().isDirty) setPendingNav({ kind: 'open' })
      else loadProject(undefined, handleProjectHydrated)
    })
    shortcutRegistry.register('new_project', () => {
      if (useUndoStore.getState().isDirty) setPendingNav({ kind: 'new' })
      else handleNewProject()
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
      // P5a.3: perform mode is track-selection based — Cmd+P selects/deselects
      // the first performance track (or the current one if already selected).
      const tl = useTimelineStore.getState()
      const perfTrack = tl.tracks.find((t) => t.type === 'performance')
      if (!perfTrack) return
      if (tl.selectedTrackId === perfTrack.id) {
        tl.selectTrack(null as unknown as string)
      } else {
        tl.selectTrack(perfTrack.id)
      }
    })
    shortcutRegistry.register('toggle_operators', () => {
      setShowOperators((v) => !v)
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
    // P6.10 (I2): ⌘⇧I toggles the Routing Canvas overlay.
    shortcutRegistry.register('routing_canvas', () => setShowRoutingCanvas((v) => !v))
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
    // T5: consolidated to the single 'split_at_playhead' shortcut (meta+k) —
    // see utils/split-clip-at-playhead.ts for why 'split_clip' and
    // 'split_at_playhead_e' were removed rather than kept as aliases.
    shortcutRegistry.register('split_at_playhead', splitSelectedClipsAtPlayhead)

    // T1 (2026-07-02): cursor tool hotkeys (PLAN §3.7 tool mode stack) — write
    // through the same useLayoutStore.cursorTool that EffectBrowser's [tool] tab
    // buttons write, so keyboard and click paths stay in sync. Non-mask tools
    // clear previewToolMode, mirroring EffectBrowser's handleToolSelect.
    // slip/slide are intentionally NOT wired here — later packet (T1 scope).
    shortcutRegistry.register('tool_select', () => {
      useLayoutStore.getState().setCursorTool('select')
      useTimelineStore.getState().setPreviewToolMode(null)
    })
    shortcutRegistry.register('tool_razor', () => {
      useLayoutStore.getState().setCursorTool('razor')
      useTimelineStore.getState().setPreviewToolMode(null)
    })
    shortcutRegistry.register('tool_ripple_delete', () => {
      useLayoutStore.getState().setCursorTool('ripple-delete')
      useTimelineStore.getState().setPreviewToolMode(null)
    })
    shortcutRegistry.register('tool_marker', () => {
      useLayoutStore.getState().setCursorTool('marker')
      useTimelineStore.getState().setPreviewToolMode(null)
    })
    // T5: 'range-select' tool removed as a genuinely-redundant cursor tool —
    // see MarqueeOverlay.tsx's header comment: rubber-band select on the
    // track background is already un-gated and works identically in every
    // cursor-tool mode including 'select', so the dedicated tool added zero
    // behavior beyond a statusbar chip label.

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

    // Delete selected clips, or fall back to selected effect.
    // MK.4 priority §4: ① active matte selection → delete-inside · ② clips · ③ effect
    shortcutRegistry.register('delete_selected', () => {
      const ts = useTimelineStore.getState()
      // Priority ①: active marquee selection → delete-inside (maskMode: 'deleteInside')
      if (ts.committedMaskSelection) {
        const { clipId } = ts.committedMaskSelection
        ts.setClipMaskMode(clipId, 'deleteInside')
        ts.clearMaskSelection()
        return
      }
      // Priority ②: selected clips
      if (ts.selectedClipIds.length > 0) {
        ts.deleteSelectedClips()
        return
      }
      // Priority ③: selected effect
      const ps = useProjectStore.getState()
      if (ps.selectedEffectId) {
        const trackId = getActiveTrackId()
        if (trackId) ps.removeEffect(trackId, ps.selectedEffectId)
      }
    })

    // MK.4: Alt+Backspace → delete-outside (MASKING-INTERACTIONS.md §4)
    shortcutRegistry.register('mask_delete_outside', () => {
      const ts = useTimelineStore.getState()
      if (ts.committedMaskSelection) {
        const { clipId } = ts.committedMaskSelection
        ts.setClipMaskMode(clipId, 'deleteOutside')
        ts.clearMaskSelection()
      }
    })

    // MK.4: q → toggle marquee tool (rect/ellipse via repeat-press; §1 hotkeys)
    shortcutRegistry.register('tool_marquee', () => {
      const ts = useTimelineStore.getState()
      const current = ts.previewToolMode
      if (current === 'marquee-rect') {
        ts.setPreviewToolMode('marquee-ellipse')
      } else if (current === 'marquee-ellipse') {
        ts.setPreviewToolMode(null)
      } else {
        ts.setPreviewToolMode('marquee-rect')
      }
    })

    // MK.5: l → toggle lasso tool (freehand → polygon → off via repeat-press)
    shortcutRegistry.register('tool_lasso', () => {
      const ts = useTimelineStore.getState()
      const current = ts.previewToolMode
      if (current === 'lasso-freehand') {
        ts.setPreviewToolMode('lasso-polygon')
      } else if (current === 'lasso-polygon') {
        ts.setPreviewToolMode(null)
      } else {
        ts.setPreviewToolMode('lasso-freehand')
      }
    })

    // MK.4: Cmd+Shift+A → deselect (clear active mask selection)
    shortcutRegistry.register('mask_deselect_all', () => {
      useTimelineStore.getState().clearMaskSelection()
    })

    // MK.9: Cmd+J → copy the committed mask region to a new track above.
    // The store action self-guards (no selection → no-op toast; layer cap → refuse toast).
    shortcutRegistry.register('mask_copy_to_track', () => {
      const ts = useTimelineStore.getState()
      if (ts.committedMaskSelection) {
        ts.copyRegionToTrack(ts.committedMaskSelection.clipId)
      }
    })

    // MK.9: Cmd+Shift+J → cut the committed mask region to a new track above
    // (original gains the inverse delete-inside hole). Same self-guarding.
    shortcutRegistry.register('mask_cut_to_track', () => {
      const ts = useTimelineStore.getState()
      if (ts.committedMaskSelection) {
        ts.cutRegionToTrack(ts.committedMaskSelection.clipId)
      }
    })

    // UE.2: Ripple delete — Shift+Backspace. Ripple-deletes each selected clip in
    // ascending position order so earlier clips shift before later ones are evaluated.
    shortcutRegistry.register('ripple_delete', () => {
      const ts = useTimelineStore.getState()
      if (ts.selectedClipIds.length === 0) return
      // Gather selected clips across all tracks and sort by timeline position
      const selected: { id: string; position: number }[] = []
      for (const track of ts.tracks) {
        for (const clip of track.clips) {
          if (ts.selectedClipIds.includes(clip.id)) {
            selected.push({ id: clip.id, position: clip.position })
          }
        }
      }
      selected.sort((a, b) => a.position - b.position)
      for (const { id } of selected) {
        ts.rippleRemoveClip(id)
      }
    })

    // Duplicate selected effect (deep clone with new ID)
    shortcutRegistry.register('duplicate_effect', () => {
      const ps = useProjectStore.getState()
      if (!ps.selectedEffectId) return
      const trackId = getActiveTrackId()
      if (!trackId) return
      // Read chain from the active track (not the global effectChain)
      const chain = useTimelineStore.getState().tracks.find((t) => t.id === trackId)?.effectChain ?? []
      const source = chain.find((e) => e.id === ps.selectedEffectId)
      if (!source) return
      const clone = {
        ...source,
        id: randomUUID(),
        parameters: { ...source.parameters },
        modulations: { ...source.modulations },
      }
      ps.addEffect(trackId, clone)
      ps.selectEffect(clone.id)
    })

    // Main keyboard listener — delegates to registry for normal shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      if (isInput) return

      const perfStore = usePerformanceStore.getState()
      // P5a.3: arming is track-selection based (no modal flag).
      const tl = useTimelineStore.getState()
      const selTrack = tl.tracks.find((t) => t.id === tl.selectedTrackId)
      const isArmed = selTrack?.type === 'performance'

      // Perform mode pad handling (NOT in registry — uses e.code for pad bindings)
      if (isArmed && !(e.metaKey || e.ctrlKey)) {
        if (e.code === 'Escape') {
          e.preventDefault()
          // F-0514-5 (perform-mode case): clear visual selection BEFORE panicking.
          // Without this, Escape in perform mode short-circuits to panic, leaving
          // any selected clip + its TransformPanel + bounding-box handles stuck.
          const ts = useTimelineStore.getState()
          if (ts.selectedClipIds.length > 0) {
            ts.clearSelection()
            return
          }
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

      // Escape in normal mode — 7-level dispatcher (MASKING-INTERACTIONS.md §9):
      //   Level 1: cancel in-progress marquee drag (handled in MaskSelectOverlay.tsx keydown capture)
      //   Level 2: clear committed mask selection (deselect ants)
      //   Level 3: exit preview tool mode / reset cursor tool to select (T1)
      //   Level 4: clear clip selection (F-0514-5)
      //   Level 5–7: transport-stop, etc. (no-op until their packets land)
      if (e.code === 'Escape') {
        e.preventDefault()
        const ts = useTimelineStore.getState()
        // Level 2: active mask selection → deselect (Escape priority: deselect before tool exit)
        if (ts.committedMaskSelection) {
          ts.clearMaskSelection()
          return
        }
        // Level 3: exit preview tool mode / reset cursor tool to select.
        // T1 (2026-07-02): the 'tool_escape_select' binding (default-shortcuts.ts,
        // keys: 'escape') can never reach shortcutRegistry.handleKeyEvent — this
        // raw Escape branch always runs first and always returns. The
        // "Escape back to select" wire lives here instead.
        const ls = useLayoutStore.getState()
        if (ts.previewToolMode || ls.cursorTool !== 'select') {
          ts.setPreviewToolMode(null)
          if (ls.cursorTool !== 'select') ls.setCursorTool('select')
          return
        }
        // Level 4: clip selection (F-0514-5)
        if (ts.selectedClipIds.length > 0) {
          ts.clearSelection()
          return
        }
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
          if (ps.selectedEffectId) {
            const trackId = getActiveTrackId()
            if (trackId) ps.removeEffect(trackId, ps.selectedEffectId)
          }
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      const perfStore = usePerformanceStore.getState()
      // P5a.3: arming is track-selection based (no modal flag).
      const tlUp = useTimelineStore.getState()
      const selTrackUp = tlUp.tracks.find((t) => t.id === tlUp.selectedTrackId)
      if (selTrackUp?.type !== 'performance') return
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

  // Start the audio bridge once the backend is up. The bridge is inert
  // when EXPERIMENTAL_AUDIO_TRACKS is off — no extra IPC, no mutation
  // of legacy paths.
  useEffect(() => {
    if (status !== 'connected') return
    let cancelled = false
    ;(async () => {
      const { refreshFlag, startAudioBridge } = await import('./audio-bridge')
      const enabled = await refreshFlag()
      if (!cancelled && enabled) {
        startAudioBridge()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status])

  // Listen for export progress
  useEffect(() => {
    if (typeof window === 'undefined' || !window.entropic) return
    const cleanup = window.entropic.onExportProgress(({ jobId, progress, done, error, currentFrame: cf, totalFrames: tf, etaSeconds, outputPath, cycleWarning }) => {
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
      // P5b.8 (SG-5): raise a warning toast once per job when the modulation
      // graph had a cycle that was broken at export time. Guard prevents toast
      // spam across the 500ms poll interval.
      if (cycleWarning && cycleWarning.length > 0 && !sg5CycleWarnSeenRef.current) {
        sg5CycleWarnSeenRef.current = true
        useToastStore.getState().addToast({
          level: 'warning',
          message: cycleWarning,
          source: 'sg5-cycle',
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

      // Epic 05 D4: removed dead global effectChain read. The `chain` var is now
      // only used for the auto-retry length check below; route to the active
      // track's chain (getActiveEffectChain) for that purpose. Per-track render
      // paths use modulateChain(track.effectChain) directly — chainOverride
      // (freeze re-render) bypasses them via the same parameter it always did.
      const chain = chainOverride ?? getActiveEffectChain()

      try {
        // Include operators in render request for backend modulation
        const serializedOps = useOperatorStore.getState().getSerializedOperators()

        // Phase 7: Evaluate automation overrides at current playhead time
        const currentTime = useTimelineStore.getState().playheadTime
        const rawLanes = useAutomationStore.getState().getAllLanes()
        // SG-3 clause-3 consumer (audit medium #1): when the sentinel has aborted
        // a lane (NaN/Inf in the render output), STOP re-sending automation lanes
        // each frame — otherwise the corrupt automation is re-applied every frame
        // and the gate keeps tripping. lane_id from the backend is always
        // "unknown" (the output gate cannot trace the specific lane), so a
        // non-empty set means "an SG-3 abort is active" → suppress ALL automation
        // payloads. When a real lane_id IS reported, we also filter that lane by id.
        // The user re-enables via the toast's Re-enable button (clearSg3Abort).
        const sg3Aborted = useAutomationStore.getState().sg3AbortedLaneIds
        const allLanes = sg3Aborted.size > 0
          ? rawLanes.filter((l) => !sg3Aborted.has(l.id) && !sg3Aborted.has('unknown'))
          : rawLanes
        const autoOverrides = allLanes.length > 0
          ? evaluateAutomationOverrides(allLanes, currentTime, registry)
          : undefined

        // A1+A2: resolve clip-transform lanes at the playhead → per-clip partial
        // transforms (keyed by clipId). Folded onto each clip's base transform
        // below (mergeTransformOverride). Empty when no transform lanes exist, so
        // the render payload is byte-identical to today (regression guard).
        const transformOverrides = allLanes.length > 0
          ? evaluateTransformOverrides(allLanes, currentTime)
          : undefined

        // P6.6: build axis_lanes payload for Y/X-domain lanes. Sampled curve
        // profiles ride to the backend banded-render (P6.1). Only attached when
        // non-empty (don't bloat every render IPC with []).
        const axisLanes = allLanes.length > 0 ? buildAxisLanes(allLanes) : []

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

        // Active video clips across ALL unmuted video tracks (multi-track compositing).
        // Iterated in REVERSE store order so the topmost track in the UI ends up
        // LAST in the layer list — backend composites bottom-to-top so the last
        // entry lands on top. Result: NLE convention (Premiere / Final Cut /
        // Resolve / After Effects) — drag a track up in the timeline to bring it
        // to the front of the composite.
        const activeVideoClips: { clip: typeof timelineState.tracks[0]['clips'][0]; track: typeof timelineState.tracks[0]; assetPath: string }[] = []
        for (let i = timelineState.tracks.length - 1; i >= 0; i--) {
          const track = timelineState.tracks[i]
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
        // P5a.3: resolve each performance-track Sampler into multi-voice composite layers.
        // Uses evaluateVoices (voiceFSM) + buildVoiceLayers for voice-keyed rendering.
        // Only render samplers whose track still exists, is a performance track, and isn't
        // muted (drops orphans left by a deleted track). Imperative getState() read is
        // deliberate: requestRenderFrame's deps are [effectChain], so a coalesced/queued
        // render must re-read instruments at exec time rather than capture a stale value.
        const perfTrackIds = new Set(
          timelineState.tracks.filter((t) => t.type === 'performance' && !t.isMuted).map((t) => t.id),
        )
        const perfState = usePerformanceStore.getState()
        const instrState = useInstrumentsStore.getState()
        // B10.1b — Ableton-style FREEZE. A FROZEN perf track plays its BAKED CLIP
        // (frozenClipPaths[trackId]) as a video layer INSTEAD of its live voices;
        // its live voices were already released by the freeze FSM, so the
        // buildVoiceLayers / buildRackLayers paths below skip it. Reading the
        // store imperatively here (same rationale as perfState) keeps a coalesced
        // render in sync with the latest freeze state.
        const freezeState = usePerformanceFreezeStore.getState()
        const frozenLayers = Array.from(perfTrackIds).flatMap((trackId) => {
          if (!freezeState.isFrozen(trackId)) return []
          const clipPath = freezeState.getFrozenClipPath(trackId)
          if (!clipPath) return []
          // The baked clip is a normal video file rendered from frame 0; play it
          // back at the current playhead frame (clamped non-negative).
          return [
            {
              layer_type: 'video',
              asset_path: clipPath,
              frame_index: Math.max(0, frame),
              chain: [],
              clip_opacity: 1.0,
            } as Record<string, unknown>,
          ]
        })
        // One ADSREnvelope per track: use the first pad's envelope (all pads share
        // the same rack envelope for the sampler voice lifecycle in Phase 5a).
        const rackAdsr = perfState.drumRack.pads[0]?.envelope ?? { attack: 0, decay: 0, sustain: 1, release: 0 }
        // B3.2: resolve `sampler.<id>.scrub|speed` operator modulation into the
        // instruments map BEFORE computing footage frames — preview parity with
        // the backend export path (_composite_export_frame). No operators / no
        // matching mappings → SAME reference (no-op, regression-safe). Uses the
        // imperative operatorValues mirror (latest per-frame values).
        const samplerOperators = useOperatorStore.getState().operators
        const modulatedInstruments = resolveSamplerModulations(
          operatorValuesRef.current,
          samplerOperators,
          instrState.instruments,
        )
        const samplerLayers = Array.from(perfTrackIds).flatMap((trackId) => {
          // B10.1b — FROZEN track plays its baked clip (frozenLayers), not live voices.
          if (freezeState.isFrozen(trackId)) return []
          const inst = modulatedInstruments[trackId]
          if (!inst) return []
          const events = perfState.trackEvents[trackId] ?? []
          const voices = evaluateVoices(events, frame, { voiceCap: 4, adsr: rackAdsr })
          if (voices.length > 0) {
            return buildVoiceLayers(inst, voices, projectAssets, frame, activeFps, rackAdsr)
          }
          // Fall back to single-layer B1 path when no voices are active (silent track)
          const legacy = buildSamplerLayer(inst, projectAssets, frame, activeFps)
          return legacy ? [legacy] : []
        })
        // B4.1: Sample Rack channel summing. A performance track that hosts a rack
        // emits its per-pad channels (summed into the rack output via the SAME
        // backend compositor) into the layer list. Per-pad TriggerEvents are keyed
        // `${trackId}:${padId}` in the perf store (trigger UI is a later B4 slice;
        // absent → no active voices → the pad contributes nothing). A track with no
        // rack appends nothing here, so the bare-sampler path above is untouched
        // (no-rack regression-safe).
        const rackState = instrState.racks
        // H2 (2026-07-02 master-tuneup WS5): a bank-bound CC targeting a
        // 'macro' slot transiently overrides that macro's value for THIS
        // frame only (never a RackMacro.value store write — see
        // applyBankModulations.ts doc). Resolved ONCE per frame (not
        // per-track): the overlay is keyed by macro id and only the
        // CURRENTLY FOCUSED rack's macro ids can appear in it, so passing
        // the same map to every track's resolveRackMacros call below is
        // safe — a non-focused track's rack simply finds no matching ids
        // (byte-identical to the no-override path). LIVE PREVIEW ONLY: the
        // export-time resolveRackMacros call (export path, "macros are
        // STATIC at export time") intentionally does NOT receive this
        // overlay — hardware input has no meaning for a non-live export.
        const midiForMacros = useMIDIStore.getState()
        const bankMacroOverrides = midiForMacros.ccBankBindings.length > 0
          ? (() => {
              const macroContext = snapshotMappingContext()
              return resolveBankMacroOverrides(
                midiForMacros.ccBankBindings,
                midiForMacros.ccValues,
                midiForMacros.bankAssignments,
                macroContext,
                defaultAssignmentSourcesFor(macroContext),
                midiForMacros.activeBankIndex, // H7 — page the bank-assignment lookup
              )
            })()
          : undefined
        const rackLayers = Array.from(perfTrackIds).flatMap((trackId) => {
          // B10.1b — FROZEN track plays its baked clip (frozenLayers), not live voices.
          if (freezeState.isFrozen(trackId)) return []
          const rawRack = rackState[trackId]
          if (!rawRack) return []
          // B4.2: resolve the rack's macros into the pads' instrument params
          // BEFORE building layers — one-to-many fan-out, written into scrub/
          // speed/opacity. No-macros / all-at-0 → rawRack returned unchanged
          // (regression-safe). Fan-out caps are the backend trust boundary
          // (security.validate_rack_macros); this is the pure local resolver.
          // H2: bankMacroOverrides (live hardware overlay, see above) is
          // threaded through as the SECOND arg — additive-optional, absent
          // -> byte-identical to pre-H2 behavior.
          const rack = resolveRackMacros(rawRack, bankMacroOverrides)
          if (!rack) return []
          const eventsByPad: Record<string, typeof perfState.trackEvents[string]> = {}
          // B5.1 — recursively gather per-pad events keyed by PATH-FROM-ROOT so a
          // nested branch child's events resolve under `flattenRackTree`'s
          // `padEventKey(branchPath, pad.id)`. A flat pad's key is its bare id
          // (UNCHANGED from B4 → flat byte-identical). Nested branches have no
          // trigger UI in this slice, so their path keys simply find no events
          // (the branch renders nothing in preview until the trigger UI lands).
          const gatherPadEvents = (
            pads: typeof rack.pads,
            branchPath: string,
          ) => {
            pads.forEach((pad, padIndex) => {
              if (pad.branch) {
                const seg = `b${padIndex}`
                const childPath = branchPath === '' ? seg : `${branchPath}_${seg}`
                gatherPadEvents(pad.branch.pads, childPath)
                return
              }
              const key = branchPath === '' ? pad.id : `${branchPath}_${pad.id}`
              const storeKey =
                branchPath === ''
                  ? `${trackId}:${pad.id}`
                  : `${trackId}:${branchPath}_${pad.id}`
              eventsByPad[key] = perfState.trackEvents[storeKey] ?? []
            })
          }
          gatherPadEvents(rack.pads, '')
          return buildRackLayers(rack, {
            eventsByPad,
            frame,
            assets: projectAssets,
            defaultFps: activeFps,
            adsr: rackAdsr,
          })
        })
        // B6.2 — Frame-Bank (wavetable) PREVIEW serialization. A frameBank is
        // decoded on the BACKEND (the byte-budget DecodedFrameCache + SG-8 degrade
        // live there), so — unlike samplers/racks which resolve to layers client-
        // side — the preview ships the frameBank DESCRIPTOR in a `performance`
        // payload and the backend (_handle_render_composite) renders + appends the
        // voice layer. EXACT mirror of the export serialization (buildPerformance-
        // Payload): serialize the instruments-store frameBanks + register every
        // slot's source clip into the SAME assets table. No frameBanks → empty
        // payload → `performance` omitted → preview byte-identical (regression-safe).
        const fbPreview = serializeFrameBanks(instrState.frameBanks, projectAssets, activeFps)
        const hasFrameBanksPreview = Object.keys(fbPreview.frameBanks).length > 0

        // B8 — Granulator PREVIEW serialization. The granulator is rendered on the
        // BACKEND render arm (_handle_render_composite reads `performance.granulator`,
        // samples the first decoded layer, scatters a seeded grain cloud, and appends
        // ONE voice layer). Like the frameBank, the preview ships only the DESCRIPTOR
        // dict — buildGranulatorLayer mirrors the backend `_parse_granulator_layer`
        // contract EXACTLY (density/window/axes[UPPERCASE T/Y/X/C/F/L]/l_axis_enabled/
        // selection/instrument_id). A track holds at most one granulator; the render
        // sends the granulator of the SELECTED performance track. No granulator →
        // null → `performance.granulator` omitted → preview byte-identical to pre-B8.
        const granInst = selectedTrackId
          ? instrState.granulators[selectedTrackId]
          : undefined
        const granPreview = buildGranulatorLayer(granInst)
        const hasGranulatorPreview = granPreview !== null

        const hasMultipleLayers =
          activeVideoClips.length > 1 || activeTextClips.length > 0 || samplerLayers.length > 0 || rackLayers.length > 0 || frozenLayers.length > 0 || hasFrameBanksPreview || hasGranulatorPreview

        // M.2b (Master-Out Bus wiring) — the Master track's effect chain, read
        // off timelineState (already captured this frame, same rationale as
        // perfTrackIds above: a coalesced render must not read a stale value).
        // M.3 — fold this frame's automation overrides (autoOverrides, already
        // evaluated above at `currentTime` — the SAME evaluator/values the
        // single-clip render_frame path sends as `automation_overrides`) onto
        // the master chain's params BEFORE it is serialized, so a master
        // effect param under automation renders its time-varying value here
        // too. No overrides → returned unchanged (byte-identical, M.1 no-op
        // contract preserved).
        const masterTrack = timelineState.tracks.find((t) => t.type === 'master')
        const masterChain = applyAutomationOverridesToChain(
          masterTrack?.effectChain ?? [],
          autoOverrides,
        )

        // M.2b THE TRAP fix: render_frame (single-clip fast path, below) never
        // reads master_chain, so a non-empty Master chain must force the
        // render_composite path even for a single clip — the same seam M.2
        // used to make export's single-input path apply master.
        if (
          shouldUseCompositePath({
            hasMultipleLayers,
            activeVideoClipCount: activeVideoClips.length,
            masterChainLength: masterChain.length,
          })
        ) {
          // Use render_composite for multi-layer rendering
          const videoLayers: Record<string, unknown>[] = activeVideoClips.map(({ clip, track, assetPath }) => {
            const localTime = currentTime - clip.position
            const srcTime = clip.reversed ? Math.max(0, clip.duration - localTime) : localTime
            const clipFrame = Math.max(0, Math.round(
              (srcTime * (clip.speed || 1) + clip.inPoint) * activeFps,
            ))
            // A1+A2: fold clip-transform lane values onto the base transform for
            // this frame (a lane value REPLACES the field it drives; unautomated
            // fields keep the base). tov undefined → ct === base (byte-identical).
            const tov = transformOverrides?.[clip.id]
            const ct = tov ? mergeTransformOverride(clip.transform, tov) : clip.transform
            // P2.2c (slice 3c): track compositing (opacity + blend mode) now lives
            // in the TERMINAL CompositeEffect on the track's chain — the backend
            // compositor reads it from there (Decision D3/D4). We no longer send the
            // v2-era top-level `opacity`/`blend_mode` fields (the backend rejects a
            // video layer that carries them without a terminal composite). Per-clip
            // opacity is a DISTINCT property and is forwarded as `clip_opacity`,
            // which the compositor multiplies onto the resolved track opacity.
            const clipOpacity = clip.opacity ?? 1
            // MK.3 — ship THIS clip's matte stack per composite layer so a masked
            // device renders masked once a 2nd layer exists (was: composite
            // omitted mask_stack → masks blinked in/out by layer count). Omitted
            // when the clip has no maskStack (additive / byte-identical).
            const layerMaskStack = serializeMaskStack(clip.maskStack)
            return {
              layer_type: 'video',
              asset_path: assetPath,
              frame_index: clipFrame,
              // D4 (Epic 02): per-track chain with per-track modulation. Drop `?? chain` global fallback.
              // The chain includes the terminal composite, carrying track opacity/mode.
              chain: chainOverride
                ? serializeEffectChain(chainOverride)
                : serializeEffectChain(modulateChain(track.effectChain, frame)),
              clip_opacity: clipOpacity,
              ...((ct && (ct.x !== 0 || ct.y !== 0 || ct.scaleX !== 1 || ct.scaleY !== 1 || ct.rotation !== 0 || ct.flipH || ct.flipV || ct.anchorX !== 0 || ct.anchorY !== 0)) || tov
                ? { transform: ct } : {}),
              ...(layerMaskStack ? { mask_stack: layerMaskStack } : {}),
            }
          })

          const textLayers: Record<string, unknown>[] = activeTextClips.map((clip) => {
            // A1+A2: fold clip-transform lane values onto the text clip's base
            // transform (same evaluator as video; tov undefined → byte-identical).
            const ttov = transformOverrides?.[clip.id]
            const ct = ttov ? mergeTransformOverride(clip.transform, ttov) : clip.transform
            // P2.2c: text layers composite in normal mode; their effective opacity
            // (clip × textConfig) is a clip-level fade forwarded as `clip_opacity`.
            return {
              layer_type: 'text',
              text_config: serializeTextConfig(clip.textConfig!),
              frame_index: Math.max(0, Math.round((currentTime - clip.position) * 30)),
              fps: 30,
              chain: [],
              clip_opacity: (clip.opacity ?? 1) * (clip.textConfig!.opacity ?? 1),
              ...((ct && (ct.x !== 0 || ct.y !== 0 || ct.scaleX !== 1 || ct.scaleY !== 1 || ct.rotation !== 0 || ct.flipH || ct.flipV)) || ttov
                ? { transform: ct } : {}),
            }
          })

          // D4 (Epic 02): no-clip fallback layer — empty chain (no global chain read).
          // P2.2c: no terminal composite (defaults apply); fully opaque via clip_opacity.
          if (videoLayers.length === 0 && activeAssetPath.current) {
            videoLayers.push({
              layer_type: 'video',
              asset_path: activeAssetPath.current,
              frame_index: frame,
              chain: [],
              clip_opacity: 1.0,
            })
          }

          // B5.1 — serialize a GROUP layer's chains (branch chain + nested child
          // chains) to the backend `{effect_id, params, enabled}` shape, deeply.
          // Flat (non-group) layers are forwarded verbatim — UNCHANGED from B4
          // (flat byte-identical). A group's branch chain runs on the composited
          // children sub-frame in the backend, so it must reach apply_chain in the
          // serialized shape (same as export's serializeEffectChain).
          const serializeGroupLayer = (l: Record<string, unknown>): Record<string, unknown> => {
            if (l.layer_type !== 'group') {
              // A leaf child INSIDE a group is composited via the backend
              // sub-frame render_composite → apply_chain, so its chain must reach
              // the backend serialized. (Top-level flat leaves keep B4 behavior;
              // this branch only runs for children reached via a group recursion.)
              return { ...l, chain: serializeEffectChain((l.chain as EffectInstance[]) ?? []) }
            }
            const children = Array.isArray(l.children) ? l.children : []
            return {
              ...l,
              chain: serializeEffectChain((l.chain as EffectInstance[]) ?? []),
              children: children.map((c) => serializeGroupLayer(c as Record<string, unknown>)),
            }
          }
          const layers = [
            ...videoLayers,
            ...textLayers,
            ...samplerLayers.map((l) => ({ ...l })),
            ...rackLayers.map((l) => serializeGroupLayer(l as Record<string, unknown>)),
            // B10.1b — FROZEN perf-track baked clips composite as plain video
            // layers (the track's live voices were released, so this REPLACES
            // them). Empty when no track is frozen (regression-safe).
            ...frozenLayers.map((l) => ({ ...l })),
          ]
          // B6.2 / B8 — performance preview payload. The backend reads
          // `performance.frameBanks` + `performance.assets` (frameBank arm) and
          // `performance.granulator` (granulator arm) off the SAME `performance`
          // object and appends each resolved voice layer (mirror of export).
          // Both sub-keys are additive: each is included only when present, so
          // when neither is set `performance` is omitted entirely and the preview
          // request is byte-identical to B6.1 (regression-safe).
          const performancePreview: Record<string, unknown> = {}
          if (hasFrameBanksPreview) {
            performancePreview.frameBanks = fbPreview.frameBanks
            performancePreview.assets = fbPreview.assets
          }
          if (hasGranulatorPreview) {
            // granPreview is the GranulatorLayerDict the backend
            // _parse_granulator_layer reads verbatim (snake_case keys, UPPERCASE
            // axes). Non-null here because hasGranulatorPreview gates it.
            performancePreview.granulator = granPreview
          }
          const fbPerformance =
            Object.keys(performancePreview).length > 0
              ? { performance: performancePreview }
              : {}
          res = await window.entropic.sendCommand({
            cmd: 'render_composite',
            layers,
            resolution: [canvasW || frameWidth || 1920, canvasH || frameHeight || 1080],
            project_seed: projectSeed,
            ...fbPerformance,
            // M.2b — omitted when the Master chain is empty (byte-identical
            // back-compat; the backend already no-ops an absent master_chain).
            ...buildMasterChainPayload(masterChain),
          })
        } else {
          // Single video clip — use fast render_frame path
          const { clip: singleClip, track: singleTrack, assetPath: singleAssetPath } = activeVideoClips[0]
          // A1+A2: fold clip-transform lane values onto the base transform for the
          // single-clip fast path (tov undefined → ct === base → byte-identical).
          const stov = transformOverrides?.[singleClip.id]
          const ct = stov ? mergeTransformOverride(singleClip.transform, stov) : singleClip.transform
          // Speed-adjusted source frame; reverse flips local time across clip duration
          const localTime = currentTime - singleClip.position
          const srcTime = singleClip.reversed ? Math.max(0, singleClip.duration - localTime) : localTime
          const clipFrame = Math.max(0, Math.round(
            (srcTime * (singleClip.speed || 1) + singleClip.inPoint) * activeFps,
          ))
          // D4 (Epic 02): source chain from the track, apply per-track modulation.
          // chainOverride (freeze re-render) still bypasses per-track sourcing.
          const singleTrackChain = chainOverride
            ? chainOverride
            : modulateChain(singleTrack.effectChain, frame)
          // MK.3: ship the clip's matte stack so the backend can resolve each
          // device's mask_ref. Omitted when the clip has no maskStack (additive).
          const singleMaskStack = serializeMaskStack(singleClip.maskStack)
          res = await window.entropic.sendCommand({
            cmd: 'render_frame',
            path: singleAssetPath || activeAssetPath.current,
            frame_index: clipFrame,
            chain: serializeEffectChain(singleTrackChain),
            project_seed: projectSeed,
            ...(serializedOps.length > 0 ? { operators: serializedOps } : {}),
            ...(autoOverrides && Object.keys(autoOverrides).length > 0 ? { automation_overrides: autoOverrides } : {}),
            ...(axisLanes.length > 0 ? { axis_lanes: axisLanes } : {}),
            ...((ct && (ct.x !== 0 || ct.y !== 0 || ct.scaleX !== 1 || ct.scaleY !== 1 || ct.rotation !== 0 || ct.flipH || ct.flipV || ct.anchorX !== 0 || ct.anchorY !== 0)) || stov
              ? { transform: ct } : {}),
            ...(singleMaskStack ? { mask_stack: singleMaskStack } : {}),
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
            const ov = res.operator_values as Record<string, number>
            setOperatorValues(ov)
            // B3.2: keep the imperative mirror fresh for next frame's sampler
            // scrub/speed modulation (requestRenderFrame reads the ref).
            operatorValuesRef.current = ov
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
          // SG-3 clause-3: lane_aborted field — fire toast + mute automation.
          // The backend gate (P5b.4) sets this when the render output contained
          // NaN/Inf and a last-known-good frame was served instead. lane_id is
          // always "unknown" (the output gate cannot trace back to a specific
          // automation lane), so we mark the sentinel abort key in the
          // automation store. Two real consumers read it (audit medium #1):
          //   1. The render-frame chain build above suppresses automation lane
          //      payloads while the set is non-empty (stops re-sending the
          //      corrupt automation every frame).
          //   2. LaneBadges (Track.tsx) renders a MUTED badge + dimmed styling
          //      on tracks with automation lanes while the set is non-empty.
          // The user re-enables via the Re-enable toast action (clearSg3Abort).
          if (res.lane_aborted !== null && res.lane_aborted !== undefined) {
            const raw = res.lane_aborted
            // Trust boundary: validate shape before use (feedback_numeric-trust-boundary)
            if (
              typeof raw === 'object' &&
              raw !== null &&
              typeof (raw as Record<string, unknown>).lane_id === 'string' &&
              typeof (raw as Record<string, unknown>).reason === 'string'
            ) {
              const abort = raw as { lane_id: string; reason: string }
              // Guard: lane_id must be non-empty string
              const laneId = abort.lane_id.trim()
              const reason = abort.reason.trim()
              if (laneId.length > 0 && reason.length > 0) {
                const abortKey = `${laneId}::${reason}`
                if (abortKey !== lastLaneAbortedKeyRef.current) {
                  lastLaneAbortedKeyRef.current = abortKey
                  // Mark in store so lane rows show the muted badge
                  useAutomationStore.getState().markSg3Aborted(laneId)
                  // 8s error-tier toast (SG-3 spec: source=sg3-sentinel)
                  useToastStore.getState().addToast({
                    level: 'error',
                    message: `Lane "${laneId}" muted automatically — ${reason}`,
                    source: 'sg3-sentinel',
                    action: {
                      label: 'Re-enable',
                      fn: () => useAutomationStore.getState().clearSg3Abort(laneId),
                    },
                  })
                }
              }
            }
          }
        } else if (!res.ok) {
          console.error('[Render] frame', frame, 'error:', res.error)

          // F-0514-1: Auto-retry with empty chain handles the common
          // import-race case where the sidecar isn't ready for the chain
          // yet. Toast on EVERY first failure was producing a transient
          // "Frame render failed" banner during normal import. Only toast
          // when the auto-retry path is unavailable (already empty chain).
          if (chain.length > 0) {
            console.warn('[Render] retrying frame', frame, 'with empty chain')
            isRenderingRef.current = false
            requestRenderFrame(frame, [])
            return
          }

          // Empty chain also failed — show error state AND toast (real failure).
          useToastStore.getState().addToast({
            level: 'error',
            message: 'Frame render failed',
            source: 'render',
            details: res.error as string,
          })
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

  // B2: re-render when any track's sampler is added/edited/sourced/removed.
  // Without this, SamplerDevice writes to the store but the preview never repaints.
  // activeFps is a dep so a project fps change re-resolves sampler frameCounts.
  useEffect(() => {
    if (!activeAssetPath.current) return
    requestRenderFrame(currentFrame)
  }, [instruments, currentFrame, activeFps, requestRenderFrame])

  // B6.2: re-render when any frameBank is added/edited/positioned/removed.
  // Mirror of the sampler effect above — the frameBank descriptor is decoded on
  // the backend (byte-budget cache + SG-8), so a position/slot change must re-
  // issue the render_composite IPC (with the frameBank performance payload) or
  // the live preview never repaints. activeFps is a dep so a project fps change
  // re-resolves slot frameCounts (parity with the sampler/export serialization).
  useEffect(() => {
    if (!activeAssetPath.current) return
    requestRenderFrame(currentFrame)
  }, [frameBanks, currentFrame, activeFps, requestRenderFrame])

  // B8: re-render when a granulator is added/removed or any of its params change
  // (density/window/axes/l-axis/selection). Mirror of the frameBank effect above —
  // the grain cloud is rendered on the backend from the `performance.granulator`
  // descriptor, so a param change must re-issue the render_composite IPC or the
  // live preview never repaints the new cloud (Gate 14 dead-flag guard).
  useEffect(() => {
    if (!activeAssetPath.current) return
    requestRenderFrame(currentFrame)
  }, [granulators, currentFrame, requestRenderFrame])

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

  /**
   * UE.5: Combined post-hydrate callback: initialise preview state, then probe
   * for missing assets and show the relink dialog if any are found.
   * Replaces the raw `() => initPreviewRef.current()` at every loadProject callsite.
   */
  const handleProjectHydrated = useCallback(async () => {
    await initPreviewRef.current()
    const missing = await probeForMissingAssets()
    if (missing.length > 0) {
      setRelinkAssets(missing)
      setShowRelinkDialog(true)
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
  // handleImportMedia is defined later (after handleAudioIngest) to avoid TDZ
  // when its useCallback dep array references handleAudioIngest.
  const handleImportMediaRef = useRef<() => Promise<void>>(async () => {})
  const handleImportMedia = useCallback(() => handleImportMediaRef.current(), [])

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

  // UE.6 — Still-frame export: export the composited frame at the current playhead as a PNG.
  // Packet design (call-don't-fork): builds the SAME payload shape as the preview single-clip
  // path (App.tsx:902-925) plus output_path and cmd:'export_frame'.
  // Packet ambiguity logged below: composite frames are deferred to the Export dialog.
  const handleExportCurrentFrame = useCallback(async () => {
    if (!window.entropic) return

    const timeline = useTimelineStore.getState()
    const currentTime = timeline.playheadTime
    const projectState = useProjectStore.getState()
    const projectAssets = projectState.assets

    // Collect active video clips at the current playhead time (mirrors preview logic)
    const activeVideoClips: Array<{
      clip: (typeof timeline.tracks)[0]['clips'][0]
      track: (typeof timeline.tracks)[0]
      assetPath: string
    }> = []
    for (const track of timeline.tracks) {
      if (track.type !== 'video' || track.isMuted) continue
      for (const clip of track.clips) {
        if (clip.isEnabled === false) continue
        if (currentTime < clip.position || currentTime >= clip.position + clip.duration) continue
        const asset = projectAssets[clip.assetId]
        if (!asset?.path) continue
        activeVideoClips.push({ clip, track, assetPath: asset.path })
      }
    }

    // Empty timeline — nothing to export
    if (activeVideoClips.length === 0) {
      useToastStore.getState().addToast({
        level: 'info',
        message: 'No active clip at the current playhead position.',
        source: 'export-frame',
      })
      return
    }

    // PACKET AMBIGUITY: The packet assumes a single render path; render_composite parity
    // is a follow-up. Multi-clip composites (or when text/sampler layers are active) use
    // render_composite in preview — we cannot replicate that in export_frame without
    // backend composite support. Show a toast and skip rather than exporting a wrong frame.
    //
    // M.2b parity (redteam MEDIUM; #344 silent-parity class): a non-empty Master chain
    // also forces the composite path in preview (shouldUseCompositePath), which export_frame
    // cannot replicate — so a single-clip project with a master effect would silently export
    // a PNG WITHOUT the master fx while preview shows it. Bail to the Export dialog instead.
    const masterChain = timeline.tracks.find((t) => t.type === 'master')?.effectChain ?? []
    if (activeVideoClips.length > 1 || masterChain.length > 0) {
      useToastStore.getState().addToast({
        level: 'info',
        message: 'Composite frames: use Export dialog',
        source: 'export-frame',
      })
      return
    }

    // Single clip path — mirrors App.tsx:902-925
    const { clip: singleClip, track: singleTrack, assetPath: singleAssetPath } = activeVideoClips[0]
    // A1+A2: fold clip-transform lane values at the playhead so the exported PNG
    // matches the live preview (export_frame applies `transform` on the backend
    // via _apply_clip_transform — SAME mechanism as preview render_frame). No
    // transform lanes → ct === base → byte-identical to the legacy export_frame.
    const frameTransformOverride = evaluateTransformOverrides(
      useAutomationStore.getState().getAllLanes(),
      currentTime,
    )[singleClip.id]
    const ct = frameTransformOverride
      ? mergeTransformOverride(singleClip.transform, frameTransformOverride)
      : singleClip.transform
    const localTime = currentTime - singleClip.position
    const srcTime = singleClip.reversed ? Math.max(0, singleClip.duration - localTime) : localTime
    const clipFrame = Math.max(
      0,
      Math.round((srcTime * (singleClip.speed || 1) + singleClip.inPoint) * activeFps),
    )
    const singleTrackChain = modulateChain(singleTrack.effectChain, clipFrame)

    // Show native save dialog
    const defaultName = `frame-${currentTime.toFixed(3).replace('.', '_')}s.png`
    const outputPath = await window.entropic.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    })
    if (!outputPath) return // user cancelled

    // Build payload identical to preview single-clip path + output_path
    const payload: Record<string, unknown> = {
      cmd: 'export_frame',
      path: singleAssetPath || activeAssetPath.current,
      time: srcTime * (singleClip.speed || 1) + singleClip.inPoint,
      chain: serializeEffectChain(singleTrackChain),
      project_seed: projectSeed,
      output_path: outputPath,
    }
    if (
      (ct && (ct.x !== 0 || ct.y !== 0 || ct.scaleX !== 1 || ct.scaleY !== 1 || ct.rotation !== 0 || ct.flipH || ct.flipV || ct.anchorX !== 0 || ct.anchorY !== 0)) ||
      frameTransformOverride
    ) {
      payload['transform'] = ct
    }

    const res = await window.entropic.sendCommand(payload)

    if (res.ok) {
      // "Reveal in Finder" needs a shell:openPath bridge method that doesn't
      // exist yet — a button calling a missing bridge would be a dead control
      // (wire-or-delete rule). The toast text carries the full path; the
      // openPath bridge + Reveal action is a named follow-up in the PR body.
      const exportedPath = (res.output_path as string) || outputPath
      useToastStore.getState().addToast({
        level: 'info',
        message: `Frame exported: ${exportedPath}`,
        source: 'export-frame',
      })
    } else {
      useToastStore.getState().addToast({
        level: 'error',
        message: `Frame export failed: ${(res.error as string) || 'Unknown error'}`,
        source: 'export-frame',
      })
    }
  }, [activeFps, projectSeed])

  // Listen for menu actions from main process
  useEffect(() => {
    if (typeof window === 'undefined' || !window.entropic?.onMenuAction) return
    const cleanup = window.entropic.onMenuAction((action: string) => {
      switch (action) {
        case 'import-media': handleImportMedia(); break
        case 'add-text-track': handleAddTextTrack(); break
        case 'new-project': {
          // F-0514-17: gate destructive nav on isDirty.
          if (useUndoStore.getState().isDirty) setPendingNav({ kind: 'new' })
          else handleNewProject()
          break
        }
        case 'open-project': {
          if (useUndoStore.getState().isDirty) setPendingNav({ kind: 'open' })
          else loadProject(undefined, handleProjectHydrated)
          break
        }
        case 'save': saveProject(); break
        case 'save-as': saveProjectAs(); break
        case 'export': setShowExportDialog(true); break
        case 'export-current-frame': handleExportCurrentFrame(); break
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
        case 'show-history': setShowHistory(true); break
        case 'show-shortcuts':
          // F-0512-37: Help → Keyboard Shortcuts opens Preferences on the
          // Shortcuts tab instead of the default General tab.
          if (FF.F_0512_37_SHORTCUTS_TAB) setPreferencesInitialTab('shortcuts')
          setShowPreferences(true)
          break
        case 'show-feedback': setShowFeedbackDialog(true); break
        case 'about': setShowAbout(true); break
        case 'support-bundle':
          if (window.entropic) {
            window.entropic.generateSupportBundle().then((path) => {
              console.log('[Support] Bundle saved to:', path)
            })
          }
          break
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
  }, [handleImportMedia, handleAddTextTrack, handleExportCurrentFrame, newProject, loadProject, saveProject, registry, addEffect])

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

  // F-0514-16 / Epic 3: Freeze / Unfreeze / Flatten handlers rewired to per-track.
  // Each handler resolves the active trackId (D1) and operates on that track's
  // chain (D2). The freezeStore was already trackId-keyed; Epic 3 only rewires
  // the call sites. All gated on activeAssetPath (video loaded) and trackId (non-null)
  // so freeze without a loaded video or without a video track is a friendly no-op.
  const handleFreezeUpTo = useCallback(
    async (cutIndex: number) => {
      if (!activeAssetPath.current) {
        useToastStore.getState().addToast({
          level: 'warning',
          message: 'Load a video before freezing the chain.',
          source: 'freeze',
        })
        return
      }
      // Epic 3 (D1): resolve the active track; guard null (no video track = no-op)
      const trackId = getActiveTrackId()
      if (!trackId) return
      // Epic 3 (D2): build prefix from the active track's chain, not the global effectChain
      const chain = getActiveEffectChain()
      if (cutIndex < 0 || cutIndex >= chain.length) return
      const prefix = chain.slice(0, cutIndex + 1).map((e) => ({
        effect_id: e.effectId,
        params: e.parameters,
        enabled: e.isEnabled,
      }))
      await useFreezeStore.getState().freezePrefix(
        trackId,
        cutIndex,
        activeAssetPath.current,
        prefix,
        projectSeed,
        totalFrames,
        [frameWidth || 1920, frameHeight || 1080],
      )
      requestRenderFrame(currentFrame)
    },
    [totalFrames, frameWidth, frameHeight, currentFrame, requestRenderFrame],
  )

  const handleUnfreeze = useCallback(async () => {
    // Epic 3 (D1): resolve active track; guard null (no video track = no-op)
    const trackId = getActiveTrackId()
    if (!trackId) return
    await useFreezeStore.getState().unfreezePrefix(trackId)
    requestRenderFrame(currentFrame)
  }, [currentFrame, requestRenderFrame])

  const handleFlatten = useCallback(async () => {
    // Epic 3 (D1): resolve active track; guard null (no video track = no-op)
    const trackId = getActiveTrackId()
    if (!trackId) return
    if (!window.entropic?.selectSavePath) return

    // B10.1b — FLATTEN a FROZEN performance track makes its bake PERMANENT.
    // The track is already baked (frozen-clip playback); flatten re-renders the
    // SAME track's voices to the user-chosen path via bake_performance_track
    // (the existing bake render — no parallel path) so the result is a saved
    // file the user owns. This precedes the effect-chain flatten so a frozen
    // perf track flattens its bake, not an (absent) effect-chain freeze cache.
    const freeze = usePerformanceFreezeStore.getState()
    if (freeze.isFrozen(trackId)) {
      const outputPath = await window.entropic.selectSavePath('frozen-track.mp4')
      if (!outputPath) return
      const perfEvents = usePerformanceStore.getState().trackEvents[trackId] ?? []
      let maxFrame = 0
      for (const e of perfEvents) {
        if (Number.isFinite(e.frameIndex) && e.frameIndex > maxFrame) maxFrame = e.frameIndex
      }
      const res = (await window.entropic.sendCommand({
        cmd: 'bake_performance_track',
        track_id: trackId,
        performance: buildBakePayload(trackId, perfEvents),
        output_path: outputPath,
        resolution: [1920, 1080],
        start_frame: 0,
        end_frame: Math.max(0, Math.round(maxFrame) + 30),
        fps: 30,
      })) as { ok?: boolean; path?: string; error?: string }
      useToastStore.getState().addToast(
        res?.ok
          ? { level: 'info', message: `Flattened frozen track to ${res.path || outputPath}`, source: 'freeze' }
          : { level: 'error', message: 'Flatten failed — see logs.', source: 'freeze' },
      )
      return
    }

    const outputPath = await window.entropic.selectSavePath('flattened.mp4')
    if (!outputPath) return
    const result = await useFreezeStore.getState().flattenPrefix(
      trackId,
      outputPath,
      activeFps,
    )
    if (result) {
      useToastStore.getState().addToast({
        level: 'info',
        message: `Flattened to ${result}`,
        source: 'freeze',
      })
    } else {
      useToastStore.getState().addToast({
        level: 'error',
        message: 'Flatten failed — see logs.',
        source: 'freeze',
      })
    }
  }, [activeFps])

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
      //
      // F-0512-16 follow-up (validator 2026-05-13): the original gate used
      // strict `playheadTime === 0` plus `!isTimerPlayingRef.current` — neither
      // Escape×2 nor k×2 from a ruler-clicked "0" cleared the loop in UAT. See
      // shouldClearLoopOnStop() for the relaxed predicate and rationale.
      const audioPlaying = hasAudio && audioStore.isLoaded && audioStore.isPlaying
      if (shouldClearLoopOnStop(ts.playheadTime, audioPlaying, ts.loopRegion)) {
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
      // Epic 4 (D1): guard — no active video track means the chain is unavailable.
      if (getActiveTrackId() === null) {
        console.error('[export] no active video track — cannot export')
        useToastStore.getState().addToast({
          level: 'warning',
          message: 'Add a video track before exporting',
          source: 'export',
          details: 'Export requires at least one video track.',
        })
        setShowExportDialog(false)
        return
      }

      setShowExportDialog(false)
      setIsExporting(true)
      setExportProgress(0)
      setExportError(null)
      // P5b.8 (SG-5): reset per-job guard so the cycle-warning toast fires once for this job
      sg5CycleWarnSeenRef.current = false

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

      // Epic 4 (D1): source the active track's chain (not the global effectChain, which is
      // stale/empty after Epic 1 moved chains into per-track storage).
      const activeExportChain = getActiveEffectChain()

      // MK.10 — resolve the active clip's matte stack so the export bakes the SAME
      // masked output preview shows (was: export omitted mask_stack → masks
      // vanished in the file even for a single masked clip). The export is single-
      // input on `activeAssetPath.current`; the masked clip is the active-track
      // clip backing that asset (the chain's device mask_refs point into ITS
      // maskStack). Omitted when absent (additive / byte-identical legacy export).
      const exportMaskStack = (() => {
        const activeTid = getActiveTrackId()
        const tracks = useTimelineStore.getState().tracks
        const activeTrack = tracks.find((t) => t.id === activeTid)
        if (!activeTrack) return undefined
        const assets = useProjectStore.getState().assets
        const maskedClip = activeTrack.clips.find(
          (c) =>
            assets[c.assetId]?.path === activeAssetPath.current &&
            c.maskStack &&
            c.maskStack.length > 0,
        )
        return serializeMaskStack(maskedClip?.maskStack)
      })()

      // A2b — resolve the active clip's STATIC transform (position/scale/rotation/
      // flip) + its id so the export applies it via the SAME shared clip_transform
      // helper preview's render_frame path uses (was: export dropped ALL clip
      // transforms → a positioned/scaled/rotated clip exported at default
      // placement). The export is single-input on activeAssetPath.current; the
      // transformed clip is the active-track clip backing that asset (same
      // resolution as exportMaskStack). Per-frame `clipTransform.<clipId>.<field>`
      // lanes fold over it backend-side (see automationByFrame below).
      const exportTransformInfo = (() => {
        const activeTid = getActiveTrackId()
        const tracks = useTimelineStore.getState().tracks
        const activeTrack = tracks.find((t) => t.id === activeTid)
        if (!activeTrack) return undefined
        const assets = useProjectStore.getState().assets
        const clip = activeTrack.clips.find(
          (c) => assets[c.assetId]?.path === activeAssetPath.current,
        )
        if (!clip) return undefined
        return { clipId: clip.id, transform: clip.transform }
      })()

      // P2.3 (slice 3d — full export parity): the export must run the SAME
      // modulation engine the preview render path runs, so the exported video
      // matches the live canvas (previously export dropped operators + automation
      // entirely — export.py divergence). We send:
      //   • operators — the serialized operator list (LFO / audio_follower /
      //     video_analyzer / …), evaluated per frame backend-side via the
      //     SignalEngine, exactly as preview's render_frame path does;
      //   • automation_by_frame — automation overrides PRE-RESOLVED here, per
      //     source frame, using the SAME `evaluateAutomationOverrides` evaluator
      //     preview uses (so values are byte-identical to preview; no second
      //     backend evaluator that could drift).
      const exportOperators = useOperatorStore.getState().getSerializedOperators()

      // Pre-resolve automation per SOURCE frame index over the export range. The
      // backend keys the map by source frame index (src_idx) and looks it up per
      // frame; automation is time-based, so frame f's time = f / activeFps.
      const exportLanes = useAutomationStore.getState().getAllLanes()
      // HIGH silent-parity fix (redteam-confirmed, PR #406): master-chain
      // automation lanes are TYPE-keyed (paramPath = "<effectId>.<paramKey>",
      // see evaluateAutomationOverrides.ts's applyAutomationOverridesToChain
      // docstring), and the backend's apply_modulation matches ANY chain's
      // effects by that SAME type key — it has no notion of which track an
      // effect belongs to. Previously ALL lanes (master + clip/track) were
      // folded into ONE `automation_by_frame` map and fed to BOTH the master
      // chain AND the per-clip/track chain's modulate_chain_for_frame call
      // (export.py), so a master lane on e.g. "fx.color_invert.amount" also
      // overrode any CLIP effect of that same type — contamination invisible
      // in preview (whose composite path never calls apply_modulation for
      // the per-clip chain) but present in export. Fix: resolve the Master
      // track's lanes SEPARATELY into their own per-frame map
      // (`master_automation_by_frame`, sent alongside — see below) and
      // exclude them from `automationByFrame` here so the per-clip/track
      // chain never sees a master override.
      const masterTrackForAuto = useTimelineStore.getState().tracks.find((t) => t.type === 'master')
      const masterLanesOnly = masterTrackForAuto
        ? useAutomationStore.getState().getLanesForTrack(masterTrackForAuto.id)
        : []
      const masterLaneIds = new Set(masterLanesOnly.map((l) => l.id))
      const clipAutomationLanes = masterLaneIds.size > 0
        ? exportLanes.filter((l) => !masterLaneIds.has(l.id))
        : exportLanes
      const exportSourceFps = activeFps > 0 ? activeFps : 30
      const exportStartFrame = settings.region === 'full'
        ? 0
        : Math.max(0, settings.startFrame ?? 0)
      const exportEndFrame = settings.region === 'full'
        ? Math.max(0, totalFrames - 1)
        : Math.max(exportStartFrame, settings.endFrame ?? (totalFrames - 1))
      const automationByFrame: Record<number, Record<string, number>> = {}
      if (clipAutomationLanes.length > 0) {
        for (let f = exportStartFrame; f <= exportEndFrame; f++) {
          const t = f / exportSourceFps
          const overrides = evaluateAutomationOverrides(clipAutomationLanes, t, registry)
          // A2b: transform lanes share the automation_by_frame channel but need
          // their OWN evaluator — evaluateAutomationOverrides mis-scales the
          // `clipTransform.*` keys (no registry entry → raw 0..1). Overwrite them
          // with the display-range-denormalized + store-clamped values
          // evaluateTransformOverrides produces (the SAME numbers preview's
          // mergeTransformOverride uses), so the backend fold pixel-matches preview.
          const tOverrides = evaluateTransformOverrides(clipAutomationLanes, t)
          for (const clipId of Object.keys(tOverrides)) {
            const fields = tOverrides[clipId]
            for (const field of Object.keys(fields) as TransformField[]) {
              const v = fields[field]
              if (v !== undefined) {
                overrides[formatTransformLanePath(clipId, field)] = v
              }
            }
          }
          if (Object.keys(overrides).length > 0) {
            automationByFrame[f] = overrides
          }
        }
      }
      const hasAutomation = Object.keys(automationByFrame).length > 0

      // Master-only per-frame automation map (see comment above) — resolved
      // the SAME way as automationByFrame but scoped strictly to the Master
      // track's own lanes, so it is safe to apply exclusively to master_chain
      // backend-side without ever touching a per-clip/track effect.
      const masterAutomationByFrame: Record<number, Record<string, number>> = {}
      if (masterLanesOnly.length > 0) {
        for (let f = exportStartFrame; f <= exportEndFrame; f++) {
          const t = f / exportSourceFps
          const overrides = evaluateAutomationOverrides(masterLanesOnly, t, registry)
          if (Object.keys(overrides).length > 0) {
            masterAutomationByFrame[f] = overrides
          }
        }
      }
      const hasMasterAutomation = Object.keys(masterAutomationByFrame).length > 0

      // A2b — send the static clip transform + its id when the clip carries a
      // non-identity transform OR has transform lanes (so the backend knows which
      // `clipTransform.<clipId>.*` keys to fold). Omitted otherwise → byte-
      // identical legacy export payload.
      const exportTransform = exportTransformInfo?.transform
      const exportTransformClipId = exportTransformInfo?.clipId
      const staticTransformNonIdentity = !!exportTransform && (
        exportTransform.x !== 0 || exportTransform.y !== 0 ||
        exportTransform.scaleX !== 1 || exportTransform.scaleY !== 1 ||
        exportTransform.rotation !== 0 || exportTransform.flipH ||
        exportTransform.flipV || exportTransform.anchorX !== 0 ||
        exportTransform.anchorY !== 0
      )
      const hasTransformLanesForClip = !!exportTransformClipId && exportLanes.some((l) => {
        const p = parseTransformLanePath(l.paramPath)
        return p !== null && p.clipId === exportTransformClipId
      })
      const sendTransform = !!exportTransformClipId && (staticTransformNonIdentity || hasTransformLanesForClip)

      // Status string surfaces the snapshot semantics to the user (the export
      // renders from a frozen snapshot taken at job start; edits during export
      // do not change the output). T = the export's start source frame.
      useToastStore.getState().addToast({
        level: 'info',
        message: `Exporting from snapshot @ T=${exportStartFrame}`,
        source: 'export-snapshot',
      })

      // P5a.4: build the optional composite-replay payload for projects with
      // performance tracks. The backend replays the voice FSM from this
      // serialized event list (evaluate_voices) so the exported voices are
      // byte-identical across runs and survive edit-after-capture. Absent when
      // there are no performance tracks → legacy single-input export, unchanged.
      const buildPerformancePayload = ():
        | {
            events: unknown[]
            instruments: Record<string, unknown>
            assets: Record<string, unknown>
            racks?: Record<string, unknown>
            frameBanks?: Record<string, unknown>
          }
        | undefined => {
        const timelineState = useTimelineStore.getState()
        const perfState = usePerformanceStore.getState()
        const instrState = useInstrumentsStore.getState()
        const projectAssets = useProjectStore.getState().assets
        const rackAdsr = perfState.drumRack.pads[0]?.envelope ?? {
          attack: 0, decay: 0, sustain: 1, release: 0,
        }
        const perfTrackIds = timelineState.tracks
          .filter((t) => t.type === 'performance' && !t.isMuted)
          .map((t) => t.id)

        const events: unknown[] = []
        const instruments: Record<string, unknown> = {}
        const assets: Record<string, unknown> = {}

        for (const trackId of perfTrackIds) {
          const inst = instrState.instruments[trackId]
          if (!inst) continue
          // The backend keys events/instruments by instrumentId === inst.id.
          // Re-stamp each captured event's instrumentId to the instrument id so
          // backend referential integrity + per-instrument bucketing line up.
          const trackEvents = perfState.trackEvents[trackId] ?? []
          for (const e of trackEvents) {
            events.push({
              frameIndex: e.frameIndex,
              eventIndex: e.eventIndex,
              note: e.note,
              velocity: e.velocity,
              kind: e.kind,
              instrumentId: inst.id,
              ...(e.chokeGroup != null ? { chokeGroup: e.chokeGroup } : {}),
            })
          }
          instruments[inst.id] = {
            clipId: inst.clipId,
            startFrame: inst.startFrame,
            speed: inst.speed,
            opacity: inst.opacity,
            blendMode: inst.blendMode,
            voiceCap: 4,
            adsr: rackAdsr,
            // chain:[] is correct — SamplerInstrumentV1 (types.ts:38-136) has NO
            // chain field; only rack PADS carry a per-pad insert chain (pad.chain,
            // serialized below at the racks branch). A non-rack sampler has no UI
            // to populate an insert chain, so there is nothing to drop (OQ4).
            chain: [],
          }
          const asset = projectAssets[inst.clipId]
          if (asset?.path) {
            const metaFps = asset.meta?.fps
            const fps = Number.isFinite(metaFps) && metaFps! > 0 ? metaFps! : settings.fps
            const dur = Number.isFinite(asset.meta?.duration) ? asset.meta!.duration : 0
            assets[inst.clipId] = {
              path: asset.path,
              frameCount: Math.max(1, Math.round(dur * fps)),
              fps,
            }
          }
        }

        // B4-export — Sample Rack channel summing in the EXPORT path.
        // Mirror the LIVE preview rack render (App.tsx render loop): for each
        // performance track that hosts a rack, resolve its macros ONCE
        // (resolveRackMacros — macros are STATIC at export time, no per-frame
        // macro automation), then serialize the macro-resolved pads. Each pad's
        // events are keyed `${trackId}:${padId}` in the perf store; we stamp
        // that composite id onto each event so the backend buckets per pad. Pad
        // clip assets are added to the SAME `assets` table (per-track shape).
        // No racks → `racks` omitted → export byte-identical (regression-safe).
        const racks: Record<string, unknown> = {}
        const serializeSamplerInstrument = (
          inst: SamplerInstrumentV1,
        ): Record<string, unknown> => {
          const out: Record<string, unknown> = {
            clipId: inst.clipId,
            startFrame: inst.startFrame,
            speed: inst.speed,
            opacity: inst.opacity,
            blendMode: inst.blendMode,
            // chain:[] is correct — SamplerInstrumentV1 has no chain field; the
            // per-pad insert chain lives on the rack pad (serialized as
            // instrument.chain from pad.chain at the racks branch below). OQ4.
            chain: [],
          }
          // Additive optional B3 configs — only emit when present (mirrors the
          // additive-optional schema; absent → backend uses safe defaults).
          if (inst.endFrame !== undefined) out.endFrame = inst.endFrame
          if (inst.loop !== undefined) out.loop = inst.loop
          if (inst.scrub !== undefined) out.scrub = inst.scrub
          if (inst.rgbOffset !== undefined) out.rgbOffset = inst.rgbOffset
          if (inst.glide !== undefined) out.glide = inst.glide
          if (inst.melodic !== undefined) out.melodic = inst.melodic
          return out
        }
        const addPadAsset = (clipId: string) => {
          if (!clipId || assets[clipId]) return
          const asset = projectAssets[clipId]
          if (!asset?.path) return
          const metaFps = asset.meta?.fps
          const fps =
            Number.isFinite(metaFps) && metaFps! > 0 ? metaFps! : settings.fps
          const dur = Number.isFinite(asset.meta?.duration)
            ? asset.meta!.duration
            : 0
          assets[clipId] = {
            path: asset.path,
            frameCount: Math.max(1, Math.round(dur * fps)),
            fps,
          }
        }
        // B5.1 — recursively serialize ONE pad. A LEAF pad serializes its
        // sampler + chain exactly as B4. A BRANCH pad (pad.branch present)
        // serializes the nested rack (recursively) under a `branch` key + the
        // branch-level chain/composite, so the backend export walk mirrors
        // flattenRackTree's post-order. `branchPath` is the PATH-FROM-ROOT prefix
        // ('' at the top level) that seeds the per-pad event key — IDENTICAL to
        // the preview `padEventKey(branchPath, pad.id)`, so preview == export.
        const serializePad = (
          pad: RackPad,
          padIndex: number,
          trackId: string,
          branchPath: string,
        ): Record<string, unknown> => {
          if (pad.branch) {
            // BRANCH: the leaf instrument is ignored; serialize the nested rack.
            const seg = `b${padIndex}`
            const childPath = branchPath === '' ? seg : `${branchPath}_${seg}`
            const childPads = pad.branch.pads.map((cp, i) =>
              serializePad(cp, i, trackId, childPath),
            )
            const comp = pad.branch.composite ?? { opacity: 1, blend: 'normal' }
            return {
              id: pad.id,
              mute: pad.mute,
              solo: pad.solo,
              opacity: pad.opacity,
              blend: pad.blend,
              branch: {
                pads: childPads,
                chain: serializeEffectChain(pad.branch.chain ?? []),
                composite: { opacity: comp.opacity, blend: comp.blend },
              },
              adsr: rackAdsr,
            }
          }
          // LEAF (B4 path). Stamp this pad's events with the PATH-FROM-ROOT
          // event key so nested sibling pads don't collide (a flat pad's key is
          // just `${trackId}:${pad.id}` — UNCHANGED from B4, export byte-identical).
          const padEventKey =
            branchPath === ''
              ? `${trackId}:${pad.id}`
              : `${trackId}:${branchPath}_${pad.id}`
          const padEvents = perfState.trackEvents[padEventKey] ?? []
          for (const e of padEvents) {
            events.push({
              frameIndex: e.frameIndex,
              eventIndex: e.eventIndex,
              note: e.note,
              velocity: e.velocity,
              kind: e.kind,
              instrumentId: padEventKey,
              ...(e.chokeGroup != null ? { chokeGroup: e.chokeGroup } : {}),
            })
          }
          addPadAsset(pad.instrument.clipId)
          return {
            id: pad.id,
            mute: pad.mute,
            solo: pad.solo,
            opacity: pad.opacity,
            blend: pad.blend,
            instrument: {
              ...serializeSamplerInstrument(pad.instrument),
              chain: serializeEffectChain(pad.chain ?? []),
            },
            voiceCap: 4,
            adsr: rackAdsr,
          }
        }
        for (const trackId of perfTrackIds) {
          const rawRack = instrState.racks[trackId]
          if (!rawRack) continue
          // Resolve macros ONCE (preview parity) — static at export time.
          // H2: intentionally NOT passed a bankMacroOverrides overlay —
          // hardware CC input is a live-only concept (there is no "focus" or
          // "now" during a batch export), so this call stays exactly the
          // pre-H2 macro.value-only resolve. See the live rackLayers call
          // site above for the overlay this mirrors in preview.
          const rack = resolveRackMacros(rawRack)
          if (!rack) continue
          const padPayloads = rack.pads.map((pad, i) =>
            serializePad(pad, i, trackId, ''),
          )
          racks[trackId] = { pads: padPayloads }
        }
        const hasRacks = Object.keys(racks).length > 0

        // B6.1 — Frame-Bank (wavetable) export serialization. Mirror of the rack
        // path: serialize the instruments-store frameBanks + register every slot's
        // source clip into the SAME `assets` table. A Frame-Bank is a CONTINUOUS
        // scanner with NO trigger events, so it activates the composite export
        // branch on its own (perf_active also keys off frameBanks on the backend).
        // No frameBanks → `frameBanks` omitted → export byte-identical
        // (regression-safe). Per-frame `position` modulation is DEFERRED (SG-8).
        const fbResult = serializeFrameBanks(
          instrState.frameBanks,
          projectAssets,
          settings.fps,
        )
        for (const [clipId, asset] of Object.entries(fbResult.assets)) {
          if (!assets[clipId]) assets[clipId] = asset
        }
        const hasFrameBanks = Object.keys(fbResult.frameBanks).length > 0

        if (events.length === 0 && !hasRacks && !hasFrameBanks) return undefined
        return {
          events,
          instruments,
          assets,
          ...(hasRacks ? { racks } : {}),
          ...(hasFrameBanks ? { frameBanks: fbResult.frameBanks } : {}),
        }
      }
      const performancePayload = buildPerformancePayload()

      // M.2b (Master-Out Bus wiring) — export mirrors preview's master_chain
      // seam (M.2 already made export's single-input path apply master; this
      // wires the send side so export actually forwards the chain).
      // M.3 — unlike preview (one render = one frame, so autoOverrides can be
      // baked in client-side before sending), export sends ONE master_chain
      // for the WHOLE job while automation varies per output frame. So the
      // static chain is sent as-is here, and `master_automation_by_frame`
      // below (scoped strictly to the Master track's own lanes — see the
      // HIGH silent-parity fix comment above) carries the master-effect
      // paramPath keys. The backend (engine/export.py) re-resolves
      // master_chain per source frame via the SAME modulate_chain_for_frame()
      // helper the per-clip chain uses, but reading `master_automation_by_frame`
      // instead of `automation_by_frame` for the master call — no parallel
      // mechanism, but no cross-chain key bleed either.
      // masterTrackForAuto is resolved once above (used for the lane split).
      const masterChain = masterTrackForAuto?.effectChain ?? []

      const res = await window.entropic.sendCommand({
        cmd: 'export_start',
        input_path: activeAssetPath.current,
        output_path: settings.outputPath,
        chain: serializeEffectChain(activeExportChain),
        // PR-B Commit-3: use the real project seed (was hardcoded 42) so export is
        // deterministic AND matches preview — stateful/seeded effects (datamosh,
        // frame_drop, noise) now render identically in export and the live canvas.
        project_seed: projectSeed,
        ...(exportTextLayers.length > 0 ? { text_layers: exportTextLayers } : {}),
        ...(performancePayload ? { performance: performancePayload } : {}),
        // M.2b — omitted when the Master chain is empty (byte-identical
        // back-compat; the backend already no-ops an absent master_chain).
        ...buildMasterChainPayload(masterChain),
        // MK.10 — the active clip's matte stack (device mask_refs in `chain`
        // resolve against it). Omitted when absent → byte-identical legacy export.
        ...(exportMaskStack ? { mask_stack: exportMaskStack } : {}),
        // P2.3: export-parity modulation payloads. Both omitted when empty so a
        // project with no operators/automation produces a legacy (byte-identical)
        // export — the backend treats absent payloads as the old single-input path.
        ...(exportOperators.length > 0 ? { operators: exportOperators } : {}),
        ...(hasAutomation ? { automation_by_frame: automationByFrame } : {}),
        // HIGH silent-parity fix (PR #406) — master lane overrides travel in
        // their OWN map, applied backend-side ONLY to master_chain, so they
        // never bleed onto a same-type clip/track effect via automation_by_frame.
        ...(hasMasterAutomation ? { master_automation_by_frame: masterAutomationByFrame } : {}),
        // A2b — static clip transform + id (backend applies via the shared
        // clip_transform helper preview uses, folds per-frame clipTransform lanes
        // over it). Omitted when identity + no lanes → byte-identical legacy export.
        ...(sendTransform ? { transform: exportTransform ?? {}, transform_clip_id: exportTransformClipId } : {}),
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
    [totalFrames],
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

  // Global window drop handler — accepts video + image + audio drops anywhere
  // (ALLOWED_EXTENSIONS + AUDIO_EXTENSIONS hoisted to module scope so handleImportMedia can branch.)

  const handleAudioIngest = useCallback(
    async (path: string, opts?: { forceNewTrack?: boolean }) => {
      if (!window.entropic) return
      // Probe duration via audio_decode (metadata only — backend also enforces
      // safety guards: validate_upload, realpath, magic-byte, decode timeout).
      const res = await window.entropic.sendCommand({
        cmd: 'audio_decode',
        path,
        start_s: 0,
        duration_s: 0.1,  // probe only — we need duration, not the samples
      }) as unknown as { ok: boolean; duration_s?: number; error?: string }
      if (!res.ok) {
        setDropError(`Audio ingest failed: ${res.error ?? 'unknown error'}`)
        return
      }
      // audio_decode with small duration_s returns that slice's duration, not
      // the full file. Re-run with duration_s omitted to get full-file duration.
      const full = await window.entropic.sendCommand({
        cmd: 'audio_decode',
        path,
      }) as unknown as { ok: boolean; duration_s?: number; error?: string }
      const duration = full.ok && typeof full.duration_s === 'number' ? full.duration_s : res.duration_s ?? 0
      if (duration <= 0) {
        setDropError('Audio file has no usable duration')
        return
      }
      const timeline = useTimelineStore.getState()
      // forceNewTrack short-circuits the "find existing audio track" branch so
      // drops in the empty space below lanes get their own fresh track — matches
      // how video ingest already behaves and what the new-track drop zone implies.
      let audioTrackId = opts?.forceNewTrack
        ? undefined
        : timeline.tracks.find((t) => t.type === 'audio')?.id
      if (!audioTrackId) {
        audioTrackId = timeline.addAudioTrack()
        if (!audioTrackId) return
      }
      timeline.addAudioClip(audioTrackId, {
        path,
        inSec: 0,
        outSec: duration,
        startSec: 0,
        gainDb: 0,
        fadeInSec: 0,
        fadeOutSec: 0,
        muted: false,
      })
      setDropError(null)
    },
    [],
  )

  // Wire handleImportMedia now that handleAudioIngest is defined.
  // F-0516-2: Cmd+I previously routed every path through handleFileIngest,
  // erroring "No video stream found" for audio files even though the picker
  // filter accepts audio extensions. Branch on extension to mirror drag-drop.
  handleImportMediaRef.current = async () => {
    if (!window.entropic || isIngesting) return
    const path = await window.entropic.showOpenDialog({
      title: 'Import Media',
      filters: [{ name: 'Media Files', extensions: ['mp4', 'mov', 'avi', 'webm', 'mkv', 'mxf', 'ts', 'png', 'jpg', 'jpeg', 'tiff', 'tif', 'webp', 'bmp', 'heic', 'heif', 'wav', 'mp3', 'm4a', 'aif', 'aiff', 'ogg', 'flac'] }],
    })
    if (!path) return
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
    if (AUDIO_EXTENSIONS.includes(ext)) {
      handleAudioIngest(path)
    } else {
      handleFileIngest(path)
    }
  }

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

    // Batch-drop cap — protect pipeline from 1000-file drop.
    if (files.length > 8) {
      setDropError(`Too many files (${files.length}). Drop up to 8 at once.`)
      return
    }

    // Drop position vs. existing lanes — used to force audio ingest onto a
    // fresh track when the user drops into the empty area below all tracks
    // (so the gesture parallels video-file behavior, which always creates one).
    const lanes = document.querySelectorAll<HTMLElement>('.track-lane[data-track-id]')
    let maxBottom = -Infinity
    for (const lane of lanes) {
      const rect = lane.getBoundingClientRect()
      if (rect.bottom > maxBottom) maxBottom = rect.bottom
    }
    const droppedBelowAllTracks = maxBottom !== -Infinity && e.clientY > maxBottom

    const getPath = window.entropic?.getPathForFile
    let hadError = false

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setDropError(`Unsupported format: ${ext}. Use ${ALLOWED_EXTENSIONS.join(', ')}`)
        hadError = true
        continue
      }
      const filePath = getPath ? getPath(file) : file.path
      if (!filePath) {
        setDropError('Could not resolve file path. Try using the file picker instead.')
        hadError = true
        continue
      }
      if (AUDIO_EXTENSIONS.includes(ext)) {
        handleAudioIngest(filePath, { forceNewTrack: droppedBelowAllTracks })
      } else {
        handleFileIngest(filePath)
      }
    }

    if (!hadError) setDropError(null)
  }, [isIngesting, handleFileIngest, handleAudioIngest])

  const hasAssets = Object.keys(assets).length > 0
  const selectedEffect = effectChain.find((e) => e.id === selectedEffectId) ?? null
  const selectedEffectInfo = selectedEffect
    ? registry.find((r) => r.id === selectedEffect.effectId) ?? null
    : null

  // Derive selected text clip via Zustand selector (reactive — re-renders on change)
  const loopRegion = useTimelineStore((s) => s.loopRegion)
  const isLooping = useTimelineStore((s) => s.isLooping)
  const projectBpm = useProjectStore((s) => s.bpm)
  // P2.1: effectiveBpm is the modulation-derived value (baseline bpm + modulation delta).
  // The transport display shows effectiveBpm so the user sees the live modulated tempo;
  // editing always sets the persisted bpm baseline (via setBpm).
  const effectiveBpm = useProjectStore((s) => s.effectiveBpm)
  const quantizeEnabled = useLayoutStore((s) => s.quantizeEnabled)
  const quantizeDivision = useLayoutStore((s) => s.quantizeDivision)
  const snapEnabled = useLayoutStore((s) => s.snapEnabled)

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
      className={`app${FF.F_CREATRIX_LAYOUT ? ' app--creatrix' : ''}`}
      style={FF.F_CREATRIX_LAYOUT ? {
        // P3.1: Creatrix CSS vars drive the grid-template-columns/rows
        ['--cx-left-col-w' as string]: `${leftColW}px`,
        ['--cx-inspector-h' as string]: `${inspectorH}px`,
        ['--cx-preview-h' as string]: `${previewHPct}%`,
        ['--cx-device-chain-h' as string]: `${deviceChainH}px`,
      } : {
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
          {/* P2.1: displays effectiveBpm (modulation-derived); edits write to persisted bpm baseline. */}
          <input
            type="number"
            min={1}
            max={300}
            value={effectiveBpm}
            onChange={(e) => useProjectStore.getState().setBpm(Number(e.target.value))}
          />
        </div>
        <div className="app__transport-quant">
          {/* UE.1: Snap toggle — clip-edge/playhead/marker snapping. Store-shape change → kill+relaunch required (not HMR). */}
          <button
            className={`app__transport-btn ${snapEnabled ? 'app__transport-btn--active' : ''}`}
            onClick={() => useLayoutStore.getState().toggleSnap()}
            title="Toggle snapping (clip edges, playhead, markers)"
            data-testid="snap-toggle"
          >
            S
          </button>
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
      <div className={`app__sidebar${FF.F_CREATRIX_LAYOUT ? ' cx-left-col' : ''}`} style={sidebarCollapsed ? { display: 'none' } : undefined}>
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
            clipId={selectedClip.id}
            transform={selectedClip.transform ?? IDENTITY_TRANSFORM}
            onChange={(t) => {
              const prevTransform = selectedClip.transform ?? IDENTITY_TRANSFORM
              useTimelineStore.getState().setClipTransform(selectedClip.id, t)
              requestRenderFrame(currentFrame)
              // A3: additive automation recording — does not alter the store write above.
              recordChangedTransformFields(selectedClip.id, prevTransform, t, isPlaying)
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
        {/* B3 / L3: LAYER inspector — above EFFECTS, contextual to the selected
            track. Flag-gated so the legacy sidebar is untouched when off. */}
        {FF.F_CREATRIX_LAYOUT && <LayerPanel />}
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
          <button
            className={`sidebar-tabs__btn ${sidebarTab === 'instruments' ? 'sidebar-tabs__btn--active' : ''}`}
            onClick={() => setSidebarTab('instruments')}
          >
            Instruments
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
        ) : sidebarTab === 'instruments' ? (
          <InstrumentsBrowser />
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
        {/* P3.1: Inspector top resize handle + placeholder (P3.3 fills real inspector content) */}
        {FF.F_CREATRIX_LAYOUT && (
          <>
            <div
              className="cx-resize-handle cx-resize-handle--horizontal"
              data-testid="cx-handle-inspector"
              onPointerDown={(e) => {
                cxIsDragging.current = false
                const startY = e.clientY
                const startH = useLayoutStore.getState().inspectorH
                const el = e.currentTarget
                el.setPointerCapture(e.pointerId)
                el.classList.add('cx-resize-handle--dragging')
                const onMove = (ev: PointerEvent) => {
                  cxIsDragging.current = true
                  // Dragging up increases inspector height
                  useLayoutStore.getState().setInspectorH(startH - (ev.clientY - startY))
                }
                const onUp = () => {
                  el.classList.remove('cx-resize-handle--dragging')
                  el.removeEventListener('pointermove', onMove)
                  el.removeEventListener('pointerup', onUp)
                  setTimeout(() => { cxIsDragging.current = false }, 0)
                }
                el.addEventListener('pointermove', onMove as EventListener)
                el.addEventListener('pointerup', onUp)
              }}
              onClick={(e) => { if (cxIsDragging.current) e.stopPropagation() }}
            />
            {/* P3.3: Real inspector replaces placeholder */}
            <Inspector />
          </>
        )}
      </div>
      {/* P3.1: Vertical resize handle between left-col and right-col */}
      {FF.F_CREATRIX_LAYOUT && (
        <div
          className="cx-resize-handle cx-resize-handle--vertical"
          data-testid="cx-handle-left-col"
          onPointerDown={(e) => {
            cxIsDragging.current = false
            const startX = e.clientX
            const startW = useLayoutStore.getState().leftColW
            const el = e.currentTarget
            el.setPointerCapture(e.pointerId)
            el.classList.add('cx-resize-handle--dragging')
            const onMove = (ev: PointerEvent) => {
              cxIsDragging.current = true
              useLayoutStore.getState().setLeftColW(startW + (ev.clientX - startX))
            }
            const onUp = () => {
              el.classList.remove('cx-resize-handle--dragging')
              el.removeEventListener('pointermove', onMove)
              el.removeEventListener('pointerup', onUp)
              setTimeout(() => { cxIsDragging.current = false }, 0)
            }
            el.addEventListener('pointermove', onMove as EventListener)
            el.addEventListener('pointerup', onUp)
          }}
          onClick={(e) => { if (cxIsDragging.current) e.stopPropagation() }}
        />
      )}
      {/* P3.1: cx-right-col wrapper. When flag is OFF, display:contents makes this div invisible
          to layout — children render as direct children of the root div (same as before). */}
      <div
        className={FF.F_CREATRIX_LAYOUT ? 'cx-right-col' : undefined}
        style={FF.F_CREATRIX_LAYOUT ? undefined : { display: 'contents' }}
      >
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
                  const prevTransform = selectedClip.transform ?? IDENTITY_TRANSFORM
                  useTimelineStore.getState().setClipTransform(selectedClip.id, t)
                  requestRenderFrame(currentFrame)
                  // A3: additive automation recording — does not alter the store write above.
                  recordChangedTransformFields(selectedClip.id, prevTransform, t, isPlaying)
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
            {/* MK.4: Marquee selection overlay — active when previewToolMode is set */}
            <MaskSelectOverlay
              containerRef={previewContainerRef}
              canvasWidth={frameWidth || 1920}
              canvasHeight={frameHeight || 1080}
              clipId={selectedClip?.id ?? null}
            />
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

      {/* P3.1: Preview bottom resize handle */}
      {FF.F_CREATRIX_LAYOUT && (
        <div
          className="cx-resize-handle cx-resize-handle--horizontal"
          data-testid="cx-handle-preview"
          onPointerDown={(e) => {
            cxIsDragging.current = false
            const startY = e.clientY
            const startPct = useLayoutStore.getState().previewHPct
            const el = e.currentTarget
            el.setPointerCapture(e.pointerId)
            el.classList.add('cx-resize-handle--dragging')
            const onMove = (ev: PointerEvent) => {
              cxIsDragging.current = true
              // Convert pixel delta to percentage of right-col height
              const rightCol = el.closest('.cx-right-col') as HTMLElement | null
              const colH = rightCol ? rightCol.offsetHeight : window.innerHeight
              const deltaPct = ((ev.clientY - startY) / colH) * 100
              useLayoutStore.getState().setPreviewHPct(startPct + deltaPct)
            }
            const onUp = () => {
              el.classList.remove('cx-resize-handle--dragging')
              el.removeEventListener('pointermove', onMove)
              el.removeEventListener('pointerup', onUp)
              setTimeout(() => { cxIsDragging.current = false }, 0)
            }
            el.addEventListener('pointermove', onMove as EventListener)
            el.addEventListener('pointerup', onUp)
          }}
          onClick={(e) => { if (cxIsDragging.current) e.stopPropagation() }}
        />
      )}
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
              bpm={effectiveBpm}
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
      {isPerformArmed && (
        <div className="app__performance-overlay">
          <PerformancePanel onEditPad={(id) => {
            setEditingPadId(id)
            usePerformanceStore.getState().setPadEditorOpen(true)
          }} />
        </div>
      )}

      {/* Operators panel: re-mounted 2026-05-15. Floating overlay so it doesn't
          push the timeline. Backend already serializes operators in requestRenderFrame.
          V1 (2026-05-16): inline styles → `.floating-panel--right` BEM block. */}
      {showOperators && (
        <div className="floating-panel floating-panel--right">
          <div className="floating-panel__header" style={{ justifyContent: 'flex-end' }}>
            <button
              className="floating-panel__close-btn"
              onClick={() => setShowOperators(false)}
              aria-label="Close operators panel"
              title="Close (Cmd+Shift+O)"
            >
              ×
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <RoutingLines operatorValues={operatorValues} />
            <OperatorRack
              effectChain={effectChain}
              registry={registry}
              operatorValues={operatorValues}
              hasAudio={hasAudio}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <ModulationMatrix
              effectChain={effectChain}
              registry={registry}
              operatorValues={operatorValues}
              maskNodes={(selectedClip?.maskStack ?? []).filter(
                (n) => n.kind === 'chroma_key' || n.kind === 'luma_key',
              )}
              samplerInstruments={Object.values(instruments).filter(
                (i) => i.type === 'sampler',
              )}
            />
          </div>
        </div>
      )}

      {/* F-0514-18: HistoryPanel floating overlay (Edit → Undo History).
          V1 (2026-05-16): inline styles → `.floating-panel--left` BEM block. */}
      {showHistory && (
        <div className="floating-panel floating-panel--left">
          <div className="floating-panel__header">
            <span className="floating-panel__title">Undo History</span>
            <button
              className="floating-panel__close-btn"
              onClick={() => setShowHistory(false)}
              aria-label="Close history panel"
              title="Close (Edit → Undo History)"
            >
              ×
            </button>
          </div>
          <HistoryPanel />
        </div>
      )}

      {/* P3.1: Device-chain top resize handle */}
      {FF.F_CREATRIX_LAYOUT && (
        <div
          className="cx-resize-handle cx-resize-handle--horizontal"
          data-testid="cx-handle-device-chain"
          onPointerDown={(e) => {
            cxIsDragging.current = false
            const startY = e.clientY
            const startH = useLayoutStore.getState().deviceChainH
            const el = e.currentTarget
            el.setPointerCapture(e.pointerId)
            el.classList.add('cx-resize-handle--dragging')
            const onMove = (ev: PointerEvent) => {
              cxIsDragging.current = true
              // Dragging up increases device-chain height
              useLayoutStore.getState().setDeviceChainH(startH - (ev.clientY - startY))
            }
            const onUp = () => {
              el.classList.remove('cx-resize-handle--dragging')
              el.removeEventListener('pointermove', onMove)
              el.removeEventListener('pointerup', onUp)
              setTimeout(() => { cxIsDragging.current = false }, 0)
            }
            el.addEventListener('pointermove', onMove as EventListener)
            el.addEventListener('pointerup', onUp)
          }}
          onClick={(e) => { if (cxIsDragging.current) e.stopPropagation() }}
        />
      )}
      {/* Phase 13: Ableton-style Device Chain */}
      <div className="app__device-chain">
        {/* B2: a selected Performance track shows its Sampler instrument here,
            mirroring how a video track shows its effect chain (INSTRUMENTS.md:77). */}
        {selectedTrackId && instruments[selectedTrackId]
          && tracks.find((t) => t.id === selectedTrackId)?.type === 'performance' && (
          <SamplerDevice trackId={selectedTrackId} />
        )}
        {/* B4-editor: a selected Performance track that hosts a Sample Rack shows
            its RackDevice (pad grid + per-pad editor). RackDevice returns null
            when the track has no rack, so this mount is safe for non-rack tracks. */}
        {selectedTrackId
          && tracks.find((t) => t.id === selectedTrackId)?.type === 'performance' && (
          <RackDevice trackId={selectedTrackId} />
        )}
        {/* B6.3: a selected Performance track that hosts a Frame-Bank (Wavetable)
            shows its FrameBankDevice (slot strip + position + interp + budget).
            FrameBankDevice returns null when the track has no frameBank, so this
            mount is safe for non-frameBank tracks. */}
        {selectedTrackId
          && tracks.find((t) => t.id === selectedTrackId)?.type === 'performance' && (
          <FrameBankDevice trackId={selectedTrackId} />
        )}
        {/* B8: a selected Performance track that hosts a Granulator shows its
            GranulatorDevice (density/window/axes/selection + grain-cloud viz).
            GranulatorDevice returns null when the track has no granulator, so this
            mount is safe for non-granulator tracks (mirror of FrameBankDevice). */}
        {selectedTrackId
          && tracks.find((t) => t.id === selectedTrackId)?.type === 'performance' && (
          <GranulatorDevice trackId={selectedTrackId} />
        )}
        <DeviceChain
          onFreezeUpTo={handleFreezeUpTo}
          onUnfreeze={handleUnfreeze}
          onFlatten={handleFlatten}
          onSaveAsPreset={(instanceId) => setShowPresetSave({ mode: 'single_effect', instanceId })}
          onSaveChainAsPreset={() => setShowPresetSave({ mode: 'effect_chain' })}
        />
        {/* MK.7: Mask stack editing panel — visible when exactly one clip is selected.
            Mounts INSIDE the existing device-chain region; no grid-template-rows modification.
            MK.13 will polish layout and thumbnail previews. */}
        {selectedClip && (
          <MaskStackPanel clipId={selectedClip.id} />
        )}
      </div>
      {/* P3.1: end cx-right-col wrapper */}
      </div>

      {/* P3.5: Demos Drawer — slides open on first launch, reachable afterward */}
      <DemosDrawer
        demoPaths={demoPaths}
        onOpenDemo={(_demoId) => {
          // Future: load the demo project. For P3.5 the drawer opens + engagement is recorded.
          useOnboardingStore.getState().recordEngagement()
        }}
      />

      {/* P3.5: §7 no-engagement toast — 3 launches with zero engagement */}
      {showHideDemosToast && (
        <div
          className="onboarding-prompt-toast"
          data-testid="onboarding-hide-demos-toast"
        >
          <span>Demos keep opening at launch. Hide them?</span>
          <button
            className="onboarding-prompt-toast__action"
            onClick={() => {
              dismissOnboarding()
              recordPromptAnswered()
              setShowHideDemosToast(false)
            }}
            data-testid="onboarding-prompt-hide"
          >
            hide
          </button>
          <button
            className="onboarding-prompt-toast__action onboarding-prompt-toast__action--keep"
            onClick={() => {
              recordPromptAnswered()
              setShowHideDemosToast(false)
            }}
            data-testid="onboarding-prompt-keep"
          >
            keep
          </button>
        </div>
      )}

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
          {/* P3.5: Boot line — types on every launch per ONBOARDING-SPEC §2 */}
          {!bootLineDone && (
            <BootLine
              appVersion="3.0.0"
              effectCount={registry.length}
            />
          )}
          {isPerformArmed && (
            <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 600 }}>PERFORM</span>
          )}
          {/* P3.2: cursor tool chip — reads data-cursor-tool set by EffectBrowser tool tab */}
          <CursorToolChip />
          {/* H1: focused-mapping-context chip — foundation for hardware-bank (H2+) targeting */}
          <MappingContextChip />
          {/* H-UI: MIDI Map mode toggle — opens the visual hardware-mapping overlay */}
          <MapModeToggle />
          {/* H7: bank-paging HUD — pages the bank-assignment grid (bankTypes.ts MAX_BANK_PAGES) */}
          <BankPagingHUD />
          {/* Export accessible via File > Export (Cmd+E) — no visible button needed */}
        </div>
      </div>

      {/* H-UI: MIDI Map mode overlay (self-gating — renders null unless mapMode). */}
      <MIDIMapOverlay />

      <ExportDialog
        isOpen={showExportDialog}
        totalFrames={totalFrames}
        sourceWidth={frameWidth}
        sourceHeight={frameHeight}
        sourceFps={activeFps}
        loopIn={null}
        loopOut={null}
        onExport={handleExport}
        onClose={() => {
          setShowExportDialog(false)
          // F-0514-3: re-render the current frame so the preview doesn't
          // momentarily show an un-effected frame during the dialog teardown.
          requestRenderFrame(currentFrame)
        }}
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
      <RoutingCanvas
        open={showRoutingCanvas}
        onClose={() => setShowRoutingCanvas(false)}
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

      {/* UE.5: media relink dialog — shown after project load when assets are missing */}
      <RelinkDialog
        isOpen={showRelinkDialog}
        missingAssets={relinkAssets}
        onLocate={(assetId, newPath) => relinkAsset(assetId, newPath)}
        onSkip={(assetId) => markAssetMissing(assetId)}
        onClose={() => setShowRelinkDialog(false)}
        onShowOpenDialog={(filters) =>
          window.entropic
            ? window.entropic.showOpenDialog({ filters })
            : Promise.resolve(null)
        }
      />

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

      {/* Consolidated 2026-05-16: both "Unsaved Changes" gates use
          UnsavedChangesDialog — was previously two near-identical inline
          dialogs (close-app vs pendingNav). */}
      <UnsavedChangesDialog
        open={showCloseDialog}
        body="You have unsaved changes. What would you like to do?"
        saveLabel="Save & Quit"
        onCancel={() => setShowCloseDialog(false)}
        onDiscard={() => {
          setShowCloseDialog(false)
          window.entropic.confirmClose()
        }}
        onSaveAndContinue={async () => {
          await saveProject()
          setShowCloseDialog(false)
          window.entropic.confirmClose()
        }}
      />

      {/* F-0514-17 + RT-1: discard prompt before Open / New Project; buttons
          locked during the Save-and-Continue await. */}
      <UnsavedChangesDialog
        open={pendingNav !== null}
        body={
          pendingNav
            ? `You have unsaved changes. ${pendingNav.kind === 'open' ? 'Opening another project' : 'Starting a new project'} will discard them.`
            : null
        }
        isWorking={isNavSaving}
        onCancel={() => setPendingNav(null)}
        onDiscard={() => {
          if (isNavSaving || !pendingNav) return
          const kind = pendingNav.kind
          setPendingNav(null)
          if (kind === 'open') {
            loadProject(undefined, handleProjectHydrated)
          } else {
            handleNewProject()
          }
        }}
        onSaveAndContinue={async () => {
          if (isNavSaving || !pendingNav) return
          const kind = pendingNav.kind
          setIsNavSaving(true)
          try {
            const saved = await saveProject()
            // saveProject returns falsy if the user cancelled the save
            // dialog — keep the prompt up so unsaved work doesn't vanish.
            if (!saved) return
            setPendingNav(null)
            if (kind === 'open') {
              loadProject(undefined, handleProjectHydrated)
            } else {
              handleNewProject()
            }
          } finally {
            setIsNavSaving(false)
          }
        }}
      />

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
        onOpenProject={() => { setWelcomeDismissed(true); loadProject(undefined, handleProjectHydrated) }}
        onOpenRecent={(path) => { setWelcomeDismissed(true); loadProject(path, handleProjectHydrated) }}
      />

      <Toast />
      <MemoryStatus />
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
