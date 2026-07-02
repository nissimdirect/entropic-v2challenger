# Phase 1: Core Pipeline

> Upload → effects → preview → export. The minimum viable loop.
> **Goal:** A user can load a video, apply effects, see the result, and export.
> **Sessions:** 5-7
> **Depends on:** Phase 0B (frame transport + Effect Container validated)

---

## Acceptance Criteria

1. Drag-and-drop a video file onto the window → file ingested (PyAV validates + decodes)
2. File browser fallback (native Electron dialog)
3. Effect browser panel lists all registered effects by category (`fx.*`, `util.*`)
4. Click effect → added to chain → preview updates immediately
5. Parameter panel shows all params for selected effect with sliders
6. Adjust any param → preview updates within 100ms
7. Dry/wet mix slider works for every effect (Effect Container)
8. Enable/disable toggle per effect in chain
9. Drag to reorder effects in chain
10. Export button → renders all frames through chain → saves MP4 (H.264)
11. Export progress bar with cancel button
12. At least 10 effects registered and working
13. All security gates for Phase 1 pass (SEC-5, SEC-6, SEC-7, SEC-9, SEC-15)

---

## Deliverables

### Upload Flow
```
frontend/src/renderer/components/upload/
├── DropZone.tsx          # Drag-and-drop overlay
├── FileDialog.tsx        # Native file picker fallback
└── IngestProgress.tsx    # Two-stage: header check (instant) → deep probe (background)
```

**IPC flow:**
1. Renderer: user drops file → sends path via contextBridge
2. Main: sends `{cmd: "ingest", path}` to Python via ZMQ
3. Python: PyAV opens file, validates, extracts metadata → responds with `{ok, meta}`
4. Renderer: stores asset in Zustand `project.assets` store

### Effect Browser
```
frontend/src/renderer/components/effects/
├── EffectBrowser.tsx     # Category list → effect list
├── EffectRack.tsx        # Current chain (ordered list, drag handles)
├── EffectCard.tsx        # Single effect: name, enable toggle, remove button
└── EffectSearch.tsx      # Filter by name
```

**Effect list source:** `{cmd: "list_effects"}` → Python responds with full registry (id, name, category, params schema).

### Parameter Panel
```
frontend/src/renderer/components/effects/
├── ParamPanel.tsx        # Container for selected effect's params
├── ParamSlider.tsx       # Float/int param with min/max/default
├── ParamChoice.tsx       # Dropdown for choice params
├── ParamToggle.tsx       # Boolean toggle
└── ParamMix.tsx          # Dry/wet slider (always present)
```

### Preview Canvas
```
frontend/src/renderer/components/preview/
├── PreviewCanvas.tsx     # Canvas element, frame display loop
├── PreviewControls.tsx   # Scrub bar, play/pause, frame counter
└── useFrameDisplay.ts    # Hook: read mmap → decode MJPEG → draw to canvas
```

**Display loop:**
```typescript
function startFrameLoop(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const loop = () => {
    const frame = window.electron.readFrame();  // contextBridge → native module
    if (frame) displayFrame(ctx, frame);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
```

### Export
```
frontend/src/renderer/components/export/
├── ExportDialog.tsx      # Settings: codec, resolution, filename
└── ExportProgress.tsx    # Progress bar, cancel button
```

**IPC flow:**
1. `{cmd: "export_start", path, codec, settings}` → Python starts encoding
2. Poll `{cmd: "export_status", job_id}` every 500ms → get progress %
3. `{cmd: "export_cancel", job_id}` if user cancels

### Backend: Pipeline
```
backend/src/engine/
├── pipeline.py           # apply_chain(frames, chain, project_seed) → output frames
└── export.py             # Export job management (start, status, cancel)
```

### Initial Effects (10 minimum)
```
backend/src/effects/fx/
├── invert.py             # (from 0B)
├── pixelsort.py
├── hue_shift.py
├── noise.py
├── blur.py
├── posterize.py
├── edge_detect.py
├── vhs.py
├── wave_distort.py
└── channelshift.py
```

Each effect: `apply()` function + `PARAMS` dict + 4 mandatory tests (unit, determinism, boundary, state).

---

## Testing

### Frontend (Vitest)
- EffectBrowser renders category list from mock registry
- EffectRack handles drag-and-drop reorder
- ParamSlider clamps values to min/max
- Export dialog validates settings

### Backend (pytest)
- `test_pipeline.py`: Single effect chain produces expected output
- `test_pipeline.py`: 3-effect chain produces expected output (order matters)
- `test_export.py`: Export 10 frames to H.264, verify with PyAV re-decode
- `test_ingest.py`: Valid MP4 → success. Invalid file → error.
- `test_ingest.py`: File > 500MB → rejected (SEC-5)
- `test_ingest.py`: File > 3000 frames → rejected (SEC-6)
- Per-effect: 4 tests each × 10 effects = 40 effect tests

### Integration
- Full loop: ingest → apply pixelsort → export → re-decode → verify frames changed

---

## NOT in Phase 1

- No timeline (single clip only) — Phase 4
- No audio — Phase 2B
- No param knobs/Ghost Handle — Phase 2A (basic sliders only here)
- No operators/modulation — Phase 6
- No undo — Phase 4
- No presets — Phase 10
- No multiple tracks — Phase 4
