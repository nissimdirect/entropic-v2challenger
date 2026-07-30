/**
 * F4b PR2 — App.tsx menu-action dispatch extraction (lowest-risk slice).
 *
 * Moves the `onMenuAction` subscription + its handler switch OUT of App.tsx
 * verbatim. Dependency injection over imports-from-App: every value the
 * switch needs from AppInner's closure (handlers, setState setters, the
 * effects registry, addEffect) is passed in explicitly via `MenuActionDeps`
 * rather than importing from App.tsx (which isn't even possible — these are
 * render-scoped closures, not module exports).
 *
 * PINNED, byte-identical behavior — including the effect's dependency array,
 * which in the ORIGINAL code omitted `handleNewProject`, `handleProjectHydrated`,
 * `setPendingNav`, `saveProjectAs`, and most of the `setShow*` setters even
 * though the switch body calls them. This is harmless (useState setters are
 * referentially stable across renders, per React's contract) but it IS an
 * existing characterized oddity, not something this extraction should "fix" —
 * see the UC5.2 characterization test (src/__tests__/characterization/
 * menu-action-dispatch.test.tsx), which this PR leaves unmodified as the proof.
 */
import { useEffect } from 'react'
import { useTimelineStore } from '../stores/timeline'
import { useAutomationStore } from '../stores/automation'
import { useUndoStore } from '../stores/undo'
import { useLayoutStore } from '../stores/layout'
import { saveProject, saveProjectAs, loadProject, newProject } from '../project-persistence'
import { randomUUID } from '../utils'
import type { EffectInfo, EffectInstance } from '../../shared/types'

export type PreferencesTab = 'general' | 'shortcuts' | 'performance' | 'paths'

export interface MenuActionDeps {
  handleImportMedia: () => void
  handleAddTextTrack: () => void
  handleNewProject: () => void
  handleProjectHydrated: () => Promise<void>
  handleExportCurrentFrame: () => void | Promise<void>
  setPendingNav: (nav: null | { kind: 'open' | 'new'; recentPath?: string; fromWelcome?: boolean }) => void
  setShowExportDialog: (v: boolean) => void
  setShowHistory: (v: boolean) => void
  setPreferencesInitialTab: (tab: PreferencesTab) => void
  setShowPreferences: (v: boolean) => void
  setShowFeedbackDialog: (v: boolean) => void
  setShowAbout: (v: boolean) => void
  registry: EffectInfo[]
  addEffect: (effect: EffectInstance) => void
}

/** Subscribes to window.entropic.onMenuAction and dispatches menu actions. */
export function useMenuActions(deps: MenuActionDeps) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.entropic?.onMenuAction) return
    const cleanup = window.entropic.onMenuAction((action: string) => {
      switch (action) {
        case 'import-media': deps.handleImportMedia(); break
        case 'add-text-track': deps.handleAddTextTrack(); break
        case 'new-project': {
          // F-0514-17: gate destructive nav on isDirty.
          if (useUndoStore.getState().isDirty) deps.setPendingNav({ kind: 'new' })
          else deps.handleNewProject()
          break
        }
        case 'open-project': {
          if (useUndoStore.getState().isDirty) deps.setPendingNav({ kind: 'open' })
          else loadProject(undefined, deps.handleProjectHydrated)
          break
        }
        case 'save': saveProject(); break
        case 'save-as': saveProjectAs(); break
        case 'export': deps.setShowExportDialog(true); break
        case 'export-current-frame': deps.handleExportCurrentFrame(); break
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
        case 'show-history': deps.setShowHistory(true); break
        case 'show-shortcuts':
          // F-0512-37: Help → Keyboard Shortcuts opens Preferences on the
          // Shortcuts tab instead of the default General tab.
          deps.setPreferencesInitialTab('shortcuts')
          deps.setShowPreferences(true)
          break
        case 'show-feedback': deps.setShowFeedbackDialog(true); break
        case 'about': deps.setShowAbout(true); break
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
            const info = deps.registry.find((e) => e.id === effectId)
            if (info) {
              deps.addEffect({
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
  }, [deps.handleImportMedia, deps.handleAddTextTrack, deps.handleExportCurrentFrame, newProject, loadProject, saveProject, deps.registry, deps.addEffect])
}
