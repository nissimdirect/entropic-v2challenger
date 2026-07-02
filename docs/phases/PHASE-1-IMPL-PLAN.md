---
title: Phase 1 — Core Pipeline (Upload → Effects → Preview → Export)
status: completed
project: entropic-v2challenger
depends_on: Phase 0B (frame transport + Effect Container validated)
sessions: 5-7
created: 2026-02-22
---

# Phase 1: Core Pipeline — Implementation Plan

## Context

Phase 0A (Electron + React + Python + ZMQ skeleton) and Phase 0B (shared memory + video I/O) are complete. The foundation exists: ZMQ heartbeat, PyAV decode/encode, mmap ring buffer, deterministic seeding, and MJPEG transport. Phase 1 builds the minimum viable loop: a user loads a video, applies glitch effects, sees the result, and exports.

**Goal:** 13 acceptance criteria from `docs/phases/PHASE-1.md`. Single clip, no timeline, no audio, no undo, no presets.

---

## What Already Exists

### Backend (`backend/src/`)
- `zmq_server.py` — REP socket, handles `ping`, `shutdown`, `ingest`, `seek`, `render_frame`, `list_effects`, `flush_state`
- `video/ingest.py` — `probe()` reads headers via PyAV
- `video/reader.py` — `VideoReader.decode_frame(index)` → RGBA ndarray
- `video/writer.py` — `VideoWriter.write_frame(rgba)` → H.264
- `engine/cache.py` — `encode_mjpeg()` / `decode_mjpeg()` via Pillow
- `engine/determinism.py` — `derive_seed()` + `make_rng()`
- `engine/container.py` — `EffectContainer.process()` (mask → effect → mix)
- `memory/writer.py` — `SharedMemoryWriter` ring buffer (4 × 4MB slots)
- `effects/registry.py` — `register()`, `get()`, `list_all()` (only `fx.invert` registered)
- `effects/fx/invert.py` — sample effect
- `project/schema.py` — project validation
- 14 tests passing

### Frontend (`frontend/src/`)
- `main/index.ts` — BrowserWindow, spawns Python, starts watchdog
- `main/python.ts` — `spawnPython()`, parses `ZMQ_PORT=` from stdout
- `main/watchdog.ts` — 1s heartbeat, 3-miss auto-restart
- `preload/index.ts` — exposes only `onEngineStatus`
- `renderer/stores/engine.ts` — Zustand store (status + uptime)
- `renderer/App.tsx` — status indicator only
- `shared/types.ts` — TypeScript interfaces (Project, Asset, EffectInstance, ParamDef, etc.)
- `shared/ipc-types.ts` — IPC message shapes
- Vanilla CSS, dark theme (#1a1a1a), JetBrains Mono
- 9 vitest tests

### Key Patterns to Follow
- **Imports:** Direct from `src/` root (e.g., `from engine.determinism import derive_seed`)
- **Effects contract:** Pure function `apply(frame, params, state_in, *, frame_index, seed, resolution) → (output, state_out)` (see `docs/EFFECT-CONTRACT.md`)
- **Effect modules:** `EFFECT_ID`, `EFFECT_NAME`, `EFFECT_CATEGORY`, `PARAMS`, `apply()` at module level
- **IPC:** JSON over ZMQ REQ/REP, `{cmd: "...", id: "..."}` → `{id: "...", ok: true|false, ...}`
- **Frontend IPC:** main process → contextBridge → renderer (never direct Node access)
- **State:** React/Zustand is SSOT; Python is stateless servant
- **CSS:** Vanilla CSS in `styles/` directory, dark theme, no framework
- **Determinism:** `derive_seed(project_seed, effect_id, frame_index, user_seed)` → SHA256. Use `make_rng(seed)` in effects.

---

## Plan (5 Sessions)

### Session 1: Backend Effect System + Pipeline
> Build the effect engine. No frontend work.

- [x] **1.1** Create `backend/src/effects/fx/` directory — verify `__init__.py` exists
- [x]**1.2** Verify `EffectContainer` in `backend/src/engine/container.py` is complete
  - Wraps any `apply()` function
  - Handles: seed derivation (reuse `engine/determinism.py`), dry/wet mix, mask blend
  - Match pseudocode from `docs/EFFECT-CONTRACT.md` Section 3
- [x]**1.3** Verify effect registry in `backend/src/effects/registry.py` is complete
  - `_REGISTRY: dict[str, dict]` mapping effect_id → {fn, params, name, category}
  - `list_all()` → returns serializable list for frontend
  - `get(effect_id)` → returns entry dict
- [x]**1.4** Implement 4 more stateless effects in `backend/src/effects/fx/`:
  - `hue_shift.py` — HSV hue rotation (PARAMS: amount float 0-360)
  - `noise.py` — random noise overlay (PARAMS: intensity float 0-1)
  - `blur.py` — gaussian blur (PARAMS: radius float 0-50)
  - `posterize.py` — reduce color levels (PARAMS: levels int 2-32)
- [x]**1.5** Implement pipeline engine in `backend/src/engine/pipeline.py`
  - `apply_chain(frame, chain, project_seed, frame_index, resolution)` → output frame
  - Iterates chain in order, passes state between frames
  - SEC-7: Enforce max 10 effects in chain
- [x]**1.6** Tests (backend):
  - `tests/test_effects/test_container.py` — mix blending, seed determinism, mask
  - `tests/test_effects/test_registry.py` — list, lookup, unknown ID
  - `tests/test_effects/test_fx/` — 4 tests per effect (unit, determinism, boundary, state) = 20 tests
  - `tests/test_engine/test_pipeline.py` — single effect chain, 3-effect chain, order matters, SEC-7 cap

### Session 2: Backend ZMQ Commands + Export + Security
> Wire up all IPC commands. Make the backend fully operational.

- [x]**2.1** Extend `zmq_server.py` with new/updated command handlers:
  - `ingest` — add SEC-5 validation (500MB max, extension whitelist, no symlinks, SEC-6: 3000 frame cap)
  - `list_effects` — verify returns registry as JSON
  - `apply_chain` — decode frame → run pipeline → write to mmap → return ok
  - `render_frame` — verify decode + apply chain + write to mmap (for scrubbing)
  - `export_start` — start background export job
  - `export_status` — return progress %
  - `export_cancel` — kill running export
- [x]**2.2** Implement export job manager in `backend/src/engine/export.py`
  - Background thread: decode all frames → apply chain → encode with VideoWriter
  - Track progress (current_frame / total_frames)
  - Support cancel via threading.Event
  - SEC-9: `resource.setrlimit(RLIMIT_AS, 4GB)` on process startup
- [x]**2.3** Store active video reader in server state (opened on ingest, reused for apply/export)
- [x]**2.4** Security validation module `backend/src/security.py`
  - `validate_upload(path)` → checks SEC-5 (size, extension, symlink, filename)
  - `validate_frame_count(count)` → checks SEC-6 (3000 cap)
  - `validate_chain_depth(chain)` → checks SEC-7 (10 max)
- [x]**2.5** Tests:
  - `tests/test_zmq_commands.py` — ingest valid/invalid, list_effects, apply_chain, export flow
  - `tests/test_engine/test_export.py` — export 10 frames → re-decode → verify
  - `tests/test_security.py` — all security gate edge cases

### Session 3: Frontend Foundation (Stores + Bridge + Upload)
> Zustand stores, contextBridge extensions, upload flow.

- [x]**3.1** Create project Zustand store `frontend/src/renderer/stores/project.ts`
  - State: `assets`, `effectChain` (ordered list of EffectInstance), `selectedEffectId`, `currentFrame`
  - Actions: `addAsset`, `addEffect`, `removeEffect`, `reorderEffect`, `updateParam`, `setMix`, `toggleEffect`
- [x]**3.2** Create effects Zustand store `frontend/src/renderer/stores/effects.ts`
  - State: `registry` (effect list from backend), `isLoading`
  - Actions: `fetchRegistry` (via sendCommand)
- [x]**3.3** Extend contextBridge (`frontend/src/preload/index.ts`)
  - `sendCommand(cmd)` → IPC to main → ZMQ to Python → response back
  - `onCommandResponse(callback)` — for async responses
  - `selectFile(filters)` → native file dialog
  - `readFrame()` → read latest frame from mmap (placeholder until C++ module in 0B)
- [x]**3.4** Add ZMQ command relay in main process (`frontend/src/main/zmq-relay.ts`)
  - `ipcMain.handle('send-command', ...)` — forwards command to Python ZMQ, returns response
  - Reuses existing ZMQ context from watchdog, or creates dedicated REQ socket
- [x]**3.5** Upload components (`frontend/src/renderer/components/upload/`):
  - `DropZone.tsx` — drag-and-drop overlay (onDragOver, onDrop, file validation)
  - `FileDialog.tsx` — button that opens native Electron file picker
  - `IngestProgress.tsx` — loading state while Python probes file
- [x]**3.6** Update `App.tsx` — add layout shell (sidebar + main + status bar)
- [x]**3.7** Add CSS for new components in `frontend/src/renderer/styles/`
- [x]**3.8** Tests:
  - `frontend/src/__tests__/stores/project.test.ts` — add/remove/reorder effects, param updates
  - `frontend/src/__tests__/components/upload.test.ts` — drop zone behavior, file validation

### Session 4: Frontend Effects UI + Preview
> Effect browser, parameter panel, preview canvas.

- [x]**4.1** Effect browser components (`frontend/src/renderer/components/effects/`):
  - `EffectBrowser.tsx` — category list (left) → effect list (right), click to add
  - `EffectSearch.tsx` — filter effects by name
  - `EffectRack.tsx` — current chain: ordered list with drag handles
  - `EffectCard.tsx` — single effect: name, enable toggle, remove button, click to select
- [x]**4.2** Parameter panel components (`frontend/src/renderer/components/effects/`):
  - `ParamPanel.tsx` — container for selected effect's params
  - `ParamSlider.tsx` — float/int slider with min/max/default/label
  - `ParamChoice.tsx` — dropdown for choice params
  - `ParamToggle.tsx` — boolean toggle
  - `ParamMix.tsx` — dry/wet slider (always present, maps to `_mix`)
- [x]**4.3** Preview components (`frontend/src/renderer/components/preview/`):
  - `PreviewCanvas.tsx` — canvas element, requestAnimationFrame display loop
  - `PreviewControls.tsx` — scrub bar (frame slider), play/pause, frame counter
  - `useFrameDisplay.ts` — hook: poll mmap via contextBridge → decode MJPEG → draw to canvas
- [x]**4.4** Wire up effect parameter changes → ZMQ `apply_chain` → mmap → preview update
  - On param change: debounce → sendCommand({cmd: "render_frame", ...}) → Python renders → writes to mmap → canvas picks up
- [x]**4.5** CSS for all new components
- [x]**4.6** Tests:
  - `frontend/src/__tests__/components/effects.test.ts` — render browser, rack reorder, param clamping
  - `frontend/src/__tests__/components/preview.test.ts` — canvas rendering, scrub behavior

### Session 5: Remaining Effects + Export + Integration
> Complete the effect set, build export UI, run full integration.

- [x]**5.1** Implement 5 more effects in `backend/src/effects/fx/`:
  - `pixelsort.py` — pixel sorting (PARAMS: threshold, direction, reverse)
  - `edge_detect.py` — edge detection (PARAMS: method choice [sobel/canny/laplacian])
  - `vhs.py` — VHS distortion (PARAMS: tracking float, noise float, chromatic float)
  - `wave_distort.py` — wave displacement (PARAMS: amplitude, frequency, direction)
  - `channelshift.py` — RGB channel offset (PARAMS: r_offset, g_offset, b_offset int)
- [x]**5.2** Register all 10 effects in registry + 20 new tests (4 per effect)
- [x]**5.3** Export UI (`frontend/src/renderer/components/export/`):
  - `ExportDialog.tsx` — settings: output path, codec (H.264), resolution
  - `ExportProgress.tsx` — progress bar, cancel button, completion message
- [x]**5.4** Integration test (backend):
  - `tests/test_integration.py` — full loop: ingest → apply pixelsort → export → re-decode → verify frames changed
- [x]**5.5** End-to-end manual verification:
  - Drop a video file → see it in the asset list
  - Add effects from browser → see preview update
  - Adjust params → preview responds within 100ms
  - Export → MP4 file created with effects applied
- [x]**5.6** All 13 acceptance criteria verified

---

## Test Plan

### What to test
- [x]Upload: drag-and-drop accepts valid .mp4, rejects .exe, rejects >500MB, rejects >3000 frames
- [x]Effect browser: lists 10 effects in categories, search filters, click adds to chain
- [x]Effect chain: reorder via drag, enable/disable toggle, remove, max 10 cap (SEC-7)
- [x]Parameters: sliders clamp to min/max, choices show options, mix 0.0=dry 1.0=wet
- [x]Preview: updates within 100ms of param change, scrub bar seeks frames
- [x]Export: produces valid H.264 MP4, progress bar advances, cancel stops export
- [x]Determinism: same params + same seed → same output (preview matches export)

### Edge cases to verify
- [x]Empty chain (no effects) → preview shows original frame
- [x]All params at min → no crash
- [x]All params at max → no crash
- [x]Upload non-video file → graceful error
- [x]Export cancel mid-render → partial file cleaned up
- [x]Python crash during render → watchdog restarts, preview recovers

### How to verify
- Backend: `cd backend && python -m pytest tests/ -x --tb=short`
- Frontend: `cd frontend && npx vitest run`
- Manual: `cd frontend && npx electron-vite dev` → drop test video → apply effects → export
- Expected test count: ~80 new tests (40 effect tests + 20 component + 10 store + 10 integration)

### Existing test patterns to follow
- Backend: pytest, fixtures in `conftest.py`, `synthetic_video_path` fixture for real video
- Frontend: vitest, `describe`/`it` blocks, mock `window.entropic` for preload tests

---

## Files to Create

### Backend
```
backend/src/effects/fx/hue_shift.py
backend/src/effects/fx/noise.py
backend/src/effects/fx/blur.py
backend/src/effects/fx/posterize.py
backend/src/effects/fx/pixelsort.py
backend/src/effects/fx/edge_detect.py
backend/src/effects/fx/vhs.py
backend/src/effects/fx/wave_distort.py
backend/src/effects/fx/channelshift.py
backend/src/engine/pipeline.py
backend/src/engine/export.py
backend/src/security.py
backend/tests/test_effects/test_container.py
backend/tests/test_effects/test_registry.py
backend/tests/test_effects/test_fx/test_invert.py
backend/tests/test_effects/test_fx/test_hue_shift.py
backend/tests/test_effects/test_fx/test_noise.py
backend/tests/test_effects/test_fx/test_blur.py
backend/tests/test_effects/test_fx/test_posterize.py
backend/tests/test_effects/test_fx/test_pixelsort.py
backend/tests/test_effects/test_fx/test_edge_detect.py
backend/tests/test_effects/test_fx/test_vhs.py
backend/tests/test_effects/test_fx/test_wave_distort.py
backend/tests/test_effects/test_fx/test_channelshift.py
backend/tests/test_engine/test_pipeline.py
backend/tests/test_engine/test_export.py
backend/tests/test_security.py
backend/tests/test_zmq_commands.py  (extend existing)
backend/tests/test_integration.py
```

### Frontend
```
frontend/src/main/zmq-relay.ts
frontend/src/renderer/stores/project.ts
frontend/src/renderer/stores/effects.ts
frontend/src/renderer/components/upload/DropZone.tsx
frontend/src/renderer/components/upload/FileDialog.tsx
frontend/src/renderer/components/upload/IngestProgress.tsx
frontend/src/renderer/components/effects/EffectBrowser.tsx
frontend/src/renderer/components/effects/EffectRack.tsx
frontend/src/renderer/components/effects/EffectCard.tsx
frontend/src/renderer/components/effects/EffectSearch.tsx
frontend/src/renderer/components/effects/ParamPanel.tsx
frontend/src/renderer/components/effects/ParamSlider.tsx
frontend/src/renderer/components/effects/ParamChoice.tsx
frontend/src/renderer/components/effects/ParamToggle.tsx
frontend/src/renderer/components/effects/ParamMix.tsx
frontend/src/renderer/components/preview/PreviewCanvas.tsx
frontend/src/renderer/components/preview/PreviewControls.tsx
frontend/src/renderer/components/preview/useFrameDisplay.ts
frontend/src/renderer/components/export/ExportDialog.tsx
frontend/src/renderer/components/export/ExportProgress.tsx
frontend/src/__tests__/stores/project.test.ts
frontend/src/__tests__/components/upload.test.ts
frontend/src/__tests__/components/effects.test.ts
frontend/src/__tests__/components/preview.test.ts
```

### Files to Modify
```
backend/src/zmq_server.py              — Add export commands, SEC validation
backend/src/main.py                    — Add SEC-9 resource limits
frontend/src/preload/index.ts          — Add sendCommand, selectFile, readFrame
frontend/src/renderer/App.tsx          — Layout shell with panels
frontend/src/renderer/styles/global.css — Layout + component styles (or new files)
```

---

## NOT in Scope (Explicitly Excluded)

- No timeline (single clip only) — Phase 4
- No audio — Phase 2B
- No Ghost Handle param knobs — Phase 2A (basic HTML sliders only)
- No operators/modulation — Phase 6
- No undo — Phase 4
- No presets — Phase 10
- No multiple tracks — Phase 4
- No C++ native mmap module — depends on Phase 0B completion. Preview will use ZMQ-based frame transport as interim if mmap not ready.

---

## Codebase Context (from exploration)

### Existing Patterns (must follow exactly)

**Effect module pattern:**
```python
EFFECT_ID = "fx.name"
EFFECT_NAME = "Display Name"
EFFECT_CATEGORY = "category"
PARAMS = { "param": { "type": "float", "min": 0.0, "max": 1.0, "default": 0.5, "label": "Label" } }

def apply(frame, params, state_in, *, frame_index, seed, resolution):
    output = frame.copy()
    # ... process ...
    return output, None
```

**EffectContainer pipeline:** mask extract → seed derive → call apply() → mix dry/wet → mask blend

**Registry pattern:** `register(effect_id, fn, params, name, category)` → `_REGISTRY` dict

**ZMQ message pattern:** `{cmd, id, ...}` → `{id, ok, ...}` or `{id, ok: false, error}`

**Zustand pattern:** `create<State>((set) => ({ ...initial, setters... }))` with IPC auto-subscribe

**Preload pattern:** `contextBridge.exposeInMainWorld('entropic', { ... })` — all renderer access through `window.entropic`
