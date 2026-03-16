# Phase 11: Export + Polish — Implementation Plan

> **Date:** 2026-03-15
> **Status:** active
> **Sessions:** 4 (estimated)
> **Depends on:** Phase 10 (Freeze/Library) COMPLETE
> **Branch:** `feature/phase11-export-polish`

---

## Overview

Two subsystems: (A) Full export pipeline with multi-codec support, render queue, GIF/image sequence, and (B) Polish for ship-readiness: keyboard shortcuts system, welcome screen, preferences, tooltips, error boundaries, auto-update.

**Key architectural facts:**
- Export already works (H.264 only, `backend/src/engine/export.py`, 170 lines)
- ExportDialog.tsx + ExportProgress.tsx exist but are minimal
- Keyboard shortcuts are hardcoded in App.tsx useEffect (lines 217-380)
- Project save/load exists (`project-persistence.ts`, 359 lines)
- No welcome screen, no preferences panel, no auto-update yet

---

## Sprint 11-1: Multi-Codec Export + Resolution/FPS (Session 1)

### Backend: Codec Expansion

- [ ] **11-1-1** Create `backend/src/engine/codecs.py` — codec configuration module
  - Codec registry: `{ "h264": {...}, "h265": {...}, "prores_422": {...}, "prores_4444": {...} }`
  - Per-codec: PyAV codec name, pixel format, bitrate range, quality presets (fast/medium/slow)
  - Resolution presets: source, 720p (1280x720), 1080p (1920x1080), 4K (3840x2160), custom
  - FPS presets: source, 24, 25, 30, 60
  - Validate codec availability via `av.codec.Codec(name)` at startup
  - **Files:** `backend/src/engine/codecs.py` (new, ~100 lines)

- [ ] **11-1-2** Expand `ExportManager` in `export.py`
  - Accept full settings dict: `{ codec, resolution, fps, bitrate, quality_preset, region, audio_mux }`
  - Resolution scaling: if target != source, resize frame via `cv2.resize()` after apply_chain
  - FPS conversion: if target != source, interpolate frame indices (drop/duplicate)
  - Bitrate: CBR via `-b:v`, VBR via `-crf` (H.264/H.265) or quality level (ProRes)
  - Region: full, loop_region (in/out from timeline), custom (start_frame/end_frame)
  - **Files:** `backend/src/engine/export.py` (expand _run_export, ~80 lines added)

- [ ] **11-1-3** Audio muxing via PyAV
  - After video export completes: mux original audio track into output
  - Trim audio to match exported region
  - Use `av.open()` to copy audio stream (no re-encode)
  - Handle no-audio case gracefully (skip mux step)
  - **Files:** `backend/src/engine/export.py` (add _mux_audio method, ~50 lines)

- [ ] **11-1-4** GIF export
  - Use PyAV or Pillow for animated GIF generation
  - Palette optimization: global palette via median-cut, optional dithering
  - Max resolution: 480p (auto-downscale if larger)
  - Max duration: 30 seconds (truncate with warning)
  - **Files:** `backend/src/engine/gif_export.py` (new, ~80 lines)

- [ ] **11-1-5** Image sequence export
  - Output formats: PNG (lossless), JPEG (Q95), TIFF (lossless)
  - Naming: `frame_000001.png` zero-padded to total frame count digits
  - Output to subdirectory of chosen path
  - **Files:** `backend/src/engine/image_sequence.py` (new, ~50 lines)

- [ ] **11-1-6** Wire new export modes into ZMQ server
  - Expand `export_start` command to accept full settings
  - Add `export_type` field: "video" (default), "gif", "image_sequence"
  - `export_status` now includes ETA (estimated time remaining based on frames/sec rate)
  - **Files:** `backend/src/zmq_server.py` (~30 lines modified in export handlers)

- [ ] **11-1-7** Backend export tests
  - `test_codecs.py`: codec registry lists all supported, validates availability
  - `test_export_h264.py`: existing tests still pass (regression)
  - `test_export_h265.py`: H.265 export → valid file (skip if codec unavailable)
  - `test_export_prores.py`: ProRes 422 → valid MOV (skip if codec unavailable)
  - `test_export_gif.py`: GIF export → valid animated GIF, palette correct
  - `test_export_sequence.py`: PNG sequence → correct frame count, valid images
  - `test_export_resolution.py`: 1080p source → 720p export → correct dimensions
  - `test_export_fps.py`: 30fps source → 24fps export → correct frame count
  - `test_export_audio_mux.py`: export with audio → A/V in sync (duration matches)
  - `test_export_region.py`: export loop region → correct frame range
  - `test_export_cancel.py`: cancel mid-export → partial file cleaned up
  - **Files:** `backend/tests/test_engine/test_export_*.py` (6 new files)
  - **Target:** 18-22 new tests

---

## Sprint 11-2: Export UI + Render Queue (Session 2)

### Export Dialog Expansion

- [ ] **11-2-1** Redesign `ExportDialog.tsx`
  - Codec dropdown: H.264, H.265, ProRes 422, ProRes 4444 (grayed if unavailable)
  - Resolution dropdown: Source, 720p, 1080p, 4K, Custom (width/height inputs)
  - FPS dropdown: Source, 24, 25, 30, 60
  - Quality preset: Fast, Medium, Slow (maps to encoder speed)
  - Bitrate mode: CBR (slider: 1-50 Mbps) / VBR (CRF slider: 0-51)
  - Region: Full Timeline, Loop Region, Custom (in/out frame inputs)
  - Audio toggle: Include audio (checkbox, default on)
  - Export type tabs: Video | GIF | Image Sequence
  - GIF tab: max resolution dropdown (240p, 360p, 480p), dithering toggle
  - Image Sequence tab: format dropdown (PNG, JPEG, TIFF)
  - **Files:** `frontend/src/renderer/components/export/ExportDialog.tsx` (rewrite, ~200 lines)

- [ ] **11-2-2** Redesign `ExportProgress.tsx`
  - Progress bar with percentage
  - Current frame / total frames counter
  - ETA display (from backend status)
  - Elapsed time counter
  - Cancel button (with confirmation if >50% done)
  - Output file path display
  - **Files:** `frontend/src/renderer/components/export/ExportProgress.tsx` (rewrite, ~80 lines)

- [ ] **11-2-3** Create `RenderQueue.tsx` — batch export queue
  - List of queued export jobs with status badges (Queued, Rendering, Complete, Failed, Cancelled)
  - Add to queue: "Export" button in ExportDialog adds job instead of starting immediately
  - "Start Queue" button processes jobs sequentially
  - Per-job: progress bar, ETA, cancel/remove buttons
  - Persistent across app session (stored in project store)
  - **Files:** `frontend/src/renderer/components/export/RenderQueue.tsx` (new, ~120 lines)

- [ ] **11-2-4** Export store (if needed)
  - Queue state: `jobs: ExportJob[]`, `currentJobIndex: number | null`, `isProcessing: boolean`
  - Actions: `addJob(settings)`, `removeJob(id)`, `startQueue()`, `cancelCurrent()`
  - Alternatively: manage in project store (decide during implementation)
  - **Files:** `frontend/src/renderer/stores/export.ts` (new, ~60 lines) OR extend project.ts

- [ ] **11-2-5** Export CSS
  - Dialog: tabs at top, form fields stacked, preview of output settings summary
  - Queue: vertical list, job cards with status colors (#4ade80 complete, #3b82f6 rendering, #ef4444 failed)
  - **Files:** `frontend/src/renderer/styles/export.css` (new or expand, ~100 lines)

- [ ] **11-2-6** Export UI tests
  - `export-dialog.test.ts`: codec dropdown shows available codecs, resolution/fps selectors work
  - `export-dialog.test.ts`: GIF tab limits resolution, shows dithering toggle
  - `export-progress.test.ts`: progress bar updates, ETA displays, cancel works
  - `render-queue.test.ts`: add 3 jobs → all in queue → start → process sequentially
  - `render-queue.test.ts`: cancel current job → next job starts
  - **Files:** `frontend/src/__tests__/components/export-*.test.ts` (3 new files)
  - **Target:** 10-12 new tests

---

## Sprint 11-3: Keyboard Shortcuts + Preferences (Session 3)

### Keyboard Shortcut System

- [ ] **11-3-1** Create `frontend/src/renderer/utils/shortcuts.ts` — shortcut registry
  - `ShortcutRegistry` class: maps action names to key combos
  - Default shortcuts loaded from `default-shortcuts.ts`
  - User overrides stored in `~/.entropic/shortcuts.json` (via preload fs access)
  - Conflict detection: warn when two actions map to same key
  - `register(action, keys, callback)`, `unregister(action)`, `getBinding(action)`
  - Event listener on `document.keydown` — matches against registry, fires callback
  - Respects context: "normal" mode vs "perform" mode vs "text-input" mode
  - **Files:** `frontend/src/renderer/utils/shortcuts.ts` (new, ~120 lines)

- [ ] **11-3-2** Create `frontend/src/renderer/utils/default-shortcuts.ts`
  - NLE-convention defaults (from PHASE-11.md spec):
  - Transport: Space (play/pause), J/K/L (scrub), Escape (stop)
  - Timeline: Cmd+Shift+K (split), Delete (delete clip), Cmd+T (new track)
  - Edit: Cmd+Z/Shift+Z (undo/redo), Cmd+C/V/D (copy/paste/duplicate), Cmd+A (select all)
  - View: A (toggle automation), Cmd+=/- (zoom), Cmd+0 (zoom fit), \ (before/after)
  - Project: Cmd+S/Shift+S (save/save as), Cmd+O (open), Cmd+N (new), Cmd+E (export)
  - Perform: Cmd+P (toggle perform mode), M (add marker), I/O (loop in/out)
  - **Files:** `frontend/src/renderer/utils/default-shortcuts.ts` (new, ~60 lines)

- [ ] **11-3-3** Migrate App.tsx hardcoded shortcuts to registry
  - Remove the 160-line useEffect keyboard handler from App.tsx
  - Replace with `ShortcutRegistry.init()` call in App mount
  - All existing shortcuts preserved with same behavior
  - Perform mode context handled by registry (pads only fire in perform context)
  - **Files:** `frontend/src/renderer/App.tsx` (remove ~160 lines, add ~10 lines)

- [ ] **11-3-4** Create `ShortcutEditor.tsx` — customization UI
  - Table: Action | Default Key | Current Key | Reset
  - Click on "Current Key" cell → enters capture mode → press new key → saves
  - Conflict warning if key already bound
  - "Reset All" button restores defaults
  - Categories: Transport, Timeline, Edit, View, Project
  - **Files:** `frontend/src/renderer/components/layout/ShortcutEditor.tsx` (new, ~120 lines)

### Preferences Panel

- [ ] **11-3-5** Create `Preferences.tsx` — settings panel (modal or sidebar)
  - Tabs: General, Shortcuts, Performance, Paths
  - General: theme (dark only v1, grayed light option), language (English only v1)
  - Shortcuts: embed ShortcutEditor component
  - Performance: auto-freeze thresholds (from Phase 10), max chain length, render quality
  - Paths: user preset folder, autosave folder, cache folder
  - Save/Cancel buttons
  - **Files:** `frontend/src/renderer/components/layout/Preferences.tsx` (new, ~100 lines)

- [ ] **11-3-6** Persist preferences
  - Write to `~/.entropic/preferences.json` via preload bridge
  - Load on app start, apply to relevant stores
  - Add to preload: `readPreferences()`, `writePreferences(data)`
  - **Files:** `frontend/src/preload/index.ts` (add 2 methods), `frontend/src/renderer/stores/settings.ts` (expand)

- [ ] **11-3-7** Shortcut + preferences tests
  - `shortcuts.test.ts`: register/unregister, conflict detection, context filtering
  - `shortcuts.test.ts`: user override persists, reset restores defaults
  - `shortcut-editor.test.ts`: capture mode, conflict warning display
  - `preferences.test.ts`: save/load round-trip, tab switching
  - **Files:** `frontend/src/__tests__/utils/shortcuts.test.ts` (new), `frontend/src/__tests__/components/shortcut-editor.test.ts` (new), `frontend/src/__tests__/components/preferences.test.ts` (new)
  - **Target:** 12-15 new tests

---

## Sprint 11-4: Welcome Screen + Error Handling + Polish (Session 4)

### Welcome Screen

- [ ] **11-4-1** Create `WelcomeScreen.tsx`
  - Shows on launch when no project is open
  - Recent projects list (from `~/.entropic/recent-projects.json`)
  - Buttons: "New Project", "Open Project", "Open Recent"
  - Click recent project → loads it
  - Entropic logo + version at top
  - **Files:** `frontend/src/renderer/components/layout/WelcomeScreen.tsx` (new, ~80 lines)

- [ ] **11-4-2** Recent projects tracking
  - On save: add/update entry in `~/.entropic/recent-projects.json`
  - Max 20 entries, sorted by last-modified
  - Entry: `{ path, name, lastModified, thumbnailPath? }`
  - **Files:** `frontend/src/renderer/project-persistence.ts` (add recent tracking, ~30 lines)

### Tooltips

- [ ] **11-4-3** Create `Tooltip.tsx` — unified tooltip component
  - Props: `text`, `shortcut?`, `description?`, `position` (auto, top, bottom, left, right)
  - Shows on hover after 500ms delay
  - Displays: name + keyboard shortcut (if any from registry) + description
  - BEM: `.tooltip`, `.tooltip__text`, `.tooltip__shortcut`
  - **Files:** `frontend/src/renderer/components/common/Tooltip.tsx` (new or expand existing, ~60 lines)

- [ ] **11-4-4** Add tooltips to all interactive controls
  - Effect browser buttons, rack controls, transport controls, timeline tools
  - Export button, save button, perform mode toggle
  - Shortcut displayed from registry (auto-updates when user customizes)
  - **Files:** Various component files (add `<Tooltip>` wrappers, ~5 lines each, ~20 components)

### Loading + Error States

- [ ] **11-4-5** Create `Spinner.tsx` and `Skeleton.tsx`
  - Spinner: CSS-only rotating circle, 3 sizes (sm/md/lg)
  - Skeleton: pulsing placeholder rectangles for content loading
  - Used in: effect browser (loading registry), preset browser (loading presets), export (encoding)
  - **Files:** `frontend/src/renderer/components/common/Spinner.tsx` (new, ~20 lines), `frontend/src/renderer/components/common/Skeleton.tsx` (new, ~25 lines)

- [ ] **11-4-6** Create `ErrorBoundary.tsx` — global error catch
  - React error boundary wrapping entire app
  - On error: friendly message with "Reload App" button
  - Log error to `~/.entropic/logs/renderer-error.log`
  - NO stack traces shown to user (log only)
  - Recovery: reload window via `window.location.reload()`
  - **Files:** `frontend/src/renderer/components/layout/ErrorBoundary.tsx` (new, ~50 lines)

- [ ] **11-4-7** Create `ErrorMessage.tsx` — inline error display
  - For non-fatal errors: toast-like inline message with recovery suggestion
  - Examples: "Export failed — disk full. Free space and try again."
  - Pattern: `{ message, recoveryAction?, severity: 'warning' | 'error' }`
  - **Files:** `frontend/src/renderer/components/common/ErrorMessage.tsx` (new, ~30 lines)

### Window Management

- [ ] **11-4-8** Remember window size/position
  - On resize/move: debounce 500ms → save to `~/.entropic/window-state.json`
  - On launch: restore from saved state, validate still fits screen
  - **Files:** `frontend/src/main/index.ts` (add window state persist, ~30 lines)

### Multi-Clip Selection

- [ ] **11-4-9** Add multi-select to timeline
  - Shift+click: range select (all clips between last-selected and clicked)
  - Cmd+click: toggle individual clip selection
  - Marquee drag: draw selection rectangle on timeline, select all clips intersecting
  - Selected clips move together, delete together
  - **Files:** `frontend/src/renderer/components/timeline/Timeline.tsx` (add selection logic, ~60 lines), `frontend/src/renderer/stores/timeline.ts` (add `selectedClipIds: Set<string>`)

### About Dialog

- [ ] **11-4-10** Create `AboutDialog.tsx`
  - App name, version (from package.json), logo
  - Credits: "Built by PopChaos Labs"
  - Links: GitHub repo, documentation
  - **Files:** `frontend/src/renderer/components/layout/AboutDialog.tsx` (new, ~30 lines)

### Auto-Update

- [ ] **11-4-11** Add electron-updater
  - `npm install electron-updater`
  - Check for updates on launch (non-blocking)
  - If update available: notification bar at top of window "Update available — click to download"
  - Download in background, prompt to restart
  - GitHub Releases as update source
  - **Files:** `frontend/src/main/updater.ts` (new, ~40 lines), `frontend/src/main/index.ts` (init updater)

### Polish CSS

- [ ] **11-4-12** Polish pass CSS
  - Welcome screen styling (dark, centered, modern)
  - Tooltip styling (dark bg, light text, subtle shadow)
  - Spinner/skeleton animations (CSS keyframes)
  - Error boundary full-screen centered message
  - About dialog styling
  - **Files:** `frontend/src/renderer/styles/polish.css` (new, ~120 lines)

### Tests

- [ ] **11-4-13** Component tests
  - `welcome-screen.test.ts`: renders recent projects, click opens project
  - `tooltip.test.ts`: shows on hover, displays shortcut from registry
  - `error-boundary.test.ts`: catches error → shows recovery message
  - `spinner.test.ts`: renders at 3 sizes
  - `multi-select.test.ts`: shift-click range, cmd-click toggle
  - **Files:** `frontend/src/__tests__/components/polish-*.test.ts` (5 new files)
  - **Target:** 10-12 new tests

- [ ] **11-4-14** E2E tests for polish features
  - `phase-11/export.spec.ts`: export H.264 1080p → valid MP4
  - `phase-11/export.spec.ts`: export GIF → valid animated GIF
  - `phase-11/export.spec.ts`: cancel mid-export → cleanup
  - `phase-11/shortcuts.spec.ts`: Cmd+Z → undo, Space → play/pause, customize shortcut → works
  - `phase-11/welcome.spec.ts`: launch with no project → welcome screen → new project → welcome hides
  - `phase-11/multi-select.spec.ts`: shift-click 2 clips → both selected → delete → both removed
  - **Files:** `frontend/tests/e2e/phase-11/*.spec.ts` (4 new files)
  - **Target:** 8-10 E2E tests

---

## Test Plan

### What to test
- [ ] H.264 export → valid playable MP4
- [ ] H.265 export → valid file (or graceful "codec unavailable" message)
- [ ] ProRes 422 export → valid MOV
- [ ] GIF export → valid animated GIF with palette optimization
- [ ] Image sequence → correct frame count as individual files
- [ ] Resolution scaling: 1080p source → 720p output → correct dimensions
- [ ] FPS conversion: 30fps → 24fps → correct frame count
- [ ] Audio mux → A/V in sync
- [ ] Export region: loop region only → correct frame range
- [ ] Cancel mid-export → partial file deleted
- [ ] Render queue: 3 jobs → sequential processing → all complete
- [ ] Keyboard shortcut customization → persists across restart
- [ ] Default shortcuts match NLE conventions
- [ ] Welcome screen shows recent projects
- [ ] Preferences save/load round-trip
- [ ] Error boundary catches crash → recovery message
- [ ] Multi-clip select + bulk delete
- [ ] Tooltips show on hover with correct shortcut
- [ ] Window size/position remembered

### Edge cases to verify
- [ ] Export to read-only directory → friendly error
- [ ] Export when disk is nearly full → abort with message before partial write
- [ ] Export 0-frame project → reject with "nothing to export"
- [ ] GIF export of 4K video → auto-downscale to 480p
- [ ] Image sequence with 10,000+ frames → correct zero-padding
- [ ] Two shortcut bindings to same key → conflict warning, second binding rejected
- [ ] Shortcut in text input field → doesn't fire (context check)
- [ ] Welcome screen with 0 recent projects → shows only New/Open buttons
- [ ] Error boundary triggered → reload works without data loss (autosave)
- [ ] Auto-update when offline → no error, silent skip
- [ ] Render queue with failing job → skip to next, mark failed

### How to verify
- Backend tests: `cd backend && python -m pytest tests/test_engine/test_export_*.py -x --tb=short`
- Frontend tests: `cd frontend && npx vitest run --reporter=verbose`
- E2E tests: `cd frontend && npx playwright test tests/e2e/phase-11/`
- Manual export: Export 5s clip as H.264 → open in VLC → plays correctly with audio
- Manual shortcuts: Customize Space → Enter in preferences → Enter now plays/pauses

### Existing patterns to follow
- Export backend: `backend/src/engine/export.py` (expand, don't replace)
- Export UI: `frontend/src/renderer/components/export/` (rewrite with same BEM patterns)
- Settings persistence: `project-persistence.ts` (same preload fs pattern)
- Common components: `frontend/src/renderer/components/common/` (Knob, Slider patterns)

---

## NOT in Phase 11

- No plugin SDK for third-party effects
- No collaborative editing
- No cloud sync for projects
- No mobile companion
- No GPU rendering acceleration
- No light theme (dark only for v1)
- No multi-language i18n (English only for v1)

---

## Estimated Test Count: +60-70 new tests → total ~950-965
