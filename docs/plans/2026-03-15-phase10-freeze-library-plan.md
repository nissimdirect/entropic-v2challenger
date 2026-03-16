# Phase 10: Freeze/Flatten + Library — Implementation Plan

> **Date:** 2026-03-15
> **Status:** active
> **Sessions:** 4 (estimated)
> **Depends on:** Phase 9 (MIDI) COMPLETE, Phase 6 (Operators) COMPLETE
> **Branch:** `feature/phase10-freeze-library`

---

## Overview

Two subsystems: (A) Freeze/Flatten for memory management and render caching, (B) Preset Library for creative workflow reuse. Both are new frontend stores + backend modules + IPC commands.

**Key architectural fact:** `isFrozen` flag already exists on `EffectInstance` in `frontend/src/shared/types.ts` — currently unused. This is our hook.

---

## Sprint 10-1: Freeze Backend + Store (Session 1)

### Backend: Freeze/Cache Manager

- [ ] **10-1-1** Create `backend/src/engine/freeze.py` — `FreezeManager` class
  - `freeze_prefix(track_id, chain_prefix, asset_path, cache_dir) -> cache_id`
  - Renders each frame through chain prefix via `apply_chain()`
  - Writes output as MJPEG Q95 container (matches existing mmap format from `engine/cache.py`)
  - Returns `cache_id` (UUID) for future reads
  - Progress callback for long freezes (emit percentage)
  - **Files:** `backend/src/engine/freeze.py` (new, ~150 lines)

- [ ] **10-1-2** Add `read_cached_frame(cache_id, frame_index) -> np.ndarray` to FreezeManager
  - Seeks to frame in MJPEG container, decodes single frame
  - Returns RGBA uint8 array matching source resolution
  - **Files:** `backend/src/engine/freeze.py`

- [ ] **10-1-3** Add `invalidate(cache_id)` and `flatten(cache_id, output_path, codec)` to FreezeManager
  - `invalidate`: delete cache file from disk, remove from tracking dict
  - `flatten`: encode cached frames to new video file via `VideoWriter` (PyAV)
  - Flatten output is a new asset (not an effect chain — destructive bake)
  - **Files:** `backend/src/engine/freeze.py`, `backend/src/engine/export.py` (reuse VideoWriter)

- [ ] **10-1-4** Wire FreezeManager into `zmq_server.py` — 4 new IPC commands
  - `freeze_prefix`: `{track_id, chain, asset_id, cache_dir}` → `{cache_id, frame_count}`
  - `read_freeze`: `{cache_id, frame_index}` → base64 MJPEG frame (same format as render_frame)
  - `flatten`: `{cache_id, output_path, codec}` → `{asset_path}`
  - `invalidate_cache`: `{cache_id}` → `{ok: true}`
  - **Files:** `backend/src/zmq_server.py` (~60 lines added to handle_message)

- [ ] **10-1-5** Modify `apply_chain()` in `pipeline.py` to short-circuit on frozen prefix
  - If chain has freeze cut-point at index N: skip effects 0..N, load cached frame instead
  - Apply only effects N+1..end to the cached frame
  - New param: `freeze_cache: dict[str, FreezeManager] | None`
  - **Files:** `backend/src/engine/pipeline.py` (~20 lines)

- [ ] **10-1-6** Backend tests for freeze subsystem
  - `test_freeze_manager.py`: freeze 3-effect chain → read frame → matches direct apply_chain output
  - `test_freeze_manager.py`: invalidate → cache file deleted
  - `test_freeze_manager.py`: flatten → valid video file (probe with VideoReader)
  - `test_freeze_commands.py`: ZMQ round-trip for all 4 commands
  - `test_pipeline_freeze.py`: apply_chain with frozen prefix skips effects, reads cache
  - **Files:** `backend/tests/test_engine/test_freeze_manager.py` (new), `backend/tests/test_engine/test_freeze_commands.py` (new), `backend/tests/test_engine/test_pipeline_freeze.py` (new)
  - **Target:** 15-20 new tests

### Frontend: Freeze Store + Integration

- [ ] **10-1-7** Create `frontend/src/renderer/stores/freeze.ts` — Zustand store
  - State: `frozenPrefixes: Record<string, { cacheId: string, cutIndex: number, cacheDir: string }>`
  - Actions: `freezePrefix(trackId, cutIndex)`, `unfreezePrefix(trackId)`, `isFrozen(trackId, effectIndex): boolean`
  - On `freezePrefix`: call `sendCommand({ cmd: 'freeze_prefix', ... })`, store cacheId
  - On `unfreezePrefix`: call `sendCommand({ cmd: 'invalidate_cache', ... })`, remove from state
  - **Files:** `frontend/src/renderer/stores/freeze.ts` (new, ~80 lines)

- [ ] **10-1-8** Auto-invalidation: subscribe to project store param changes
  - When `updateParam()` fires for an effect within a frozen prefix → auto-unfreeze that prefix
  - Toast notification: "Frozen effects invalidated — parameters changed"
  - **Files:** `frontend/src/renderer/stores/freeze.ts` (subscribe to project store)

- [ ] **10-1-9** Frontend tests for freeze store
  - `freeze.test.ts`: freeze sets state correctly, unfreeze clears it
  - `freeze.test.ts`: isFrozen returns true for effects 0..cutIndex, false for rest
  - `freeze.test.ts`: param change triggers auto-invalidation (mock IPC)
  - **Files:** `frontend/src/__tests__/stores/freeze.test.ts` (new)
  - **Target:** 8-10 new tests

---

## Sprint 10-2: Freeze UI + Auto-Freeze (Session 2)

### Freeze UI

- [ ] **10-2-1** Create `FreezeOverlay.tsx` — frosted glass visual indicator
  - Semi-transparent gradient overlay on frozen effect cards in EffectRack
  - Snowflake icon (❄) badge in corner of frozen effects
  - BEM: `.freeze-overlay`, `.freeze-overlay--active`, `.freeze-overlay__badge`
  - **Files:** `frontend/src/renderer/components/effects/FreezeOverlay.tsx` (new, ~40 lines)

- [ ] **10-2-2** Add freeze/unfreeze/flatten context menu to EffectRack items
  - Right-click effect → "Freeze up to here" (freezes prefix 0..this)
  - Right-click frozen effect → "Unfreeze" / "Flatten to asset"
  - Flatten calls `sendCommand({ cmd: 'flatten', ... })` then `addAsset()` to project store
  - **Files:** `frontend/src/renderer/components/effects/EffectRack.tsx` (modify)

- [ ] **10-2-3** Freeze CSS styles
  - Frosted glass: `backdrop-filter: blur(4px); background: rgba(100,180,255,0.15)`
  - Badge: absolute positioned, top-right, 16x16px, font-size 12px
  - **Files:** `frontend/src/renderer/styles/effects.css` (add ~30 lines)

### Auto-Freeze (RAM monitoring)

- [ ] **10-2-4** Add RAM monitoring to backend
  - New function `get_memory_usage()` in `zmq_server.py` → returns `{ rss_mb, percent, available_mb }`
  - Uses `psutil.Process().memory_info()` + `psutil.virtual_memory()`
  - New IPC command: `memory_status`
  - **Files:** `backend/src/zmq_server.py` (~15 lines)

- [ ] **10-2-5** Auto-freeze logic in freeze store
  - Poll `memory_status` every 5 seconds when playing/rendering
  - At > 80% RAM: toast "High memory — consider freezing effects"
  - At > 90% RAM: auto-freeze longest-idle prefix (most effects, least recent param change)
  - Configurable thresholds (stored in settings store)
  - **Files:** `frontend/src/renderer/stores/freeze.ts` (add ~40 lines)

- [ ] **10-2-6** Freeze undo integration
  - Freeze/unfreeze operations registered with undo store
  - Forward: freeze (cache to disk) / Inverse: unfreeze (delete cache)
  - Flatten is NOT undoable (destructive — show confirmation dialog)
  - **Files:** `frontend/src/renderer/stores/freeze.ts`, `frontend/src/renderer/stores/undo.ts` (minor)

- [ ] **10-2-7** Component + E2E tests for freeze UI
  - `freeze-ui.test.ts` (Vitest): FreezeOverlay renders with badge when frozen, hidden when not
  - `freeze-ui.test.ts`: context menu shows freeze/unfreeze/flatten options
  - Update E2E: `phase-10/freeze.spec.ts` — freeze chain → frosted overlay visible → edit param → auto-unfreeze
  - **Files:** `frontend/src/__tests__/components/freeze-ui.test.ts` (new), `frontend/tests/e2e/phase-10/freeze.spec.ts` (new)
  - **Target:** 8 Vitest + 3 E2E tests

---

## Sprint 10-3: Preset System Backend + Store (Session 3)

### Preset Schema + Backend

- [ ] **10-3-1** Define `.glitchpreset` JSON schema
  - Single-effect preset: `{ version, id, name, type: "single_effect", created, tags, isFavorite, effectData: { effectId, parameters, modulations } }`
  - Chain preset: `{ version, id, name, type: "effect_chain", created, tags, isFavorite, chainData: { effects: EffectInstance[], macros: MacroMapping[] } }`
  - MacroMapping: `{ label, effectIndex, paramKey, min, max }`
  - Validate with JSON Schema at `frontend/src/shared/schemas/preset.schema.json`
  - **Files:** `frontend/src/shared/schemas/preset.schema.json` (new), `frontend/src/shared/types.ts` (add Preset types)

- [ ] **10-3-2** Backend preset I/O — file operations only (no ZMQ needed for basic CRUD)
  - Presets are JSON files on disk — frontend can read/write via Electron's `fs` (through preload)
  - Add to preload bridge: `readPresets(dir)`, `writePreset(path, data)`, `deletePreset(path)`
  - User preset folder: `~/Documents/Entropic/Presets/` (auto-create on first save)
  - Factory preset folder: bundled in app resources `resources/presets/`
  - **Files:** `frontend/src/preload/index.ts` (add 3 methods), `frontend/src/main/index.ts` (add ipcMain handlers for fs ops)

- [ ] **10-3-3** Create `frontend/src/renderer/stores/library.ts` — Zustand store
  - State: `presets: Preset[], favorites: Set<string>, searchQuery: string, categoryFilter: string | null, isLoading: boolean`
  - Actions: `loadPresets()`, `savePreset(preset)`, `deletePreset(id)`, `toggleFavorite(id)`, `search(query)`, `filterByCategory(cat)`
  - `loadPresets()`: reads user folder + factory folder, merges, dedupes by ID
  - **Files:** `frontend/src/renderer/stores/library.ts` (new, ~120 lines)

- [ ] **10-3-4** Preset apply logic
  - Single-effect: `addEffect()` to project store with saved params
  - Chain: clear current chain (with confirmation), apply all effects with saved params + modulations
  - Macro mappings stored on chain preset, resolved at apply time
  - **Files:** `frontend/src/renderer/stores/library.ts` (add applyPreset action)

- [ ] **10-3-5** Tests for preset store
  - `library.test.ts`: loadPresets returns combined user+factory presets
  - `library.test.ts`: savePreset writes valid .glitchpreset JSON
  - `library.test.ts`: toggleFavorite persists
  - `library.test.ts`: search filters by name (case-insensitive)
  - `library.test.ts`: filterByCategory returns only matching
  - `library.test.ts`: applyPreset (single) adds correct effect + params
  - `library.test.ts`: applyPreset (chain) sets full chain with macros
  - **Files:** `frontend/src/__tests__/stores/library.test.ts` (new)
  - **Target:** 10-12 new tests

---

## Sprint 10-4: Preset Browser UI + Factory Presets + Macros (Session 4)

### Preset Browser UI

- [ ] **10-4-1** Create `PresetBrowser.tsx` — main preset panel
  - Tab in sidebar (alongside Effect Browser): "Presets" tab
  - Search bar at top (same pattern as EffectBrowser search)
  - Category filter chips: All, Color, Glitch, Temporal, Destruction, etc.
  - Favorites filter toggle (star icon)
  - Grid of PresetCards
  - BEM: `.preset-browser`, `.preset-browser__search`, `.preset-browser__grid`
  - **Files:** `frontend/src/renderer/components/library/PresetBrowser.tsx` (new, ~100 lines)

- [ ] **10-4-2** Create `PresetCard.tsx` — individual preset display
  - Name, category tag, favorite star
  - Click to apply preset
  - Right-click context menu: Apply, Edit, Delete, Export
  - Drag to EffectRack to apply
  - BEM: `.preset-card`, `.preset-card__name`, `.preset-card__tag`, `.preset-card--favorite`
  - **Files:** `frontend/src/renderer/components/library/PresetCard.tsx` (new, ~60 lines)

- [ ] **10-4-3** Create `PresetSaveDialog.tsx` — save preset modal
  - Fields: Name (required), Type (single/chain — auto-detected), Tags (comma-separated), Category (dropdown)
  - For chain presets: macro mapping editor (up to 8 macros)
  - Each macro: label + dropdown (select effect → param) + min/max range
  - Save button calls `library.savePreset()`
  - BEM: `.preset-save-dialog`, `.preset-save-dialog__field`, `.preset-save-dialog__macro-row`
  - **Files:** `frontend/src/renderer/components/library/PresetSaveDialog.tsx` (new, ~120 lines)

- [ ] **10-4-4** Create `MacroKnob.tsx` — macro control component
  - Reuses existing `Knob.tsx` pattern from common/
  - Label below knob
  - Moving macro → resolves all mapped params proportionally (linear interpolation min→max)
  - Visible in EffectRack when a chain preset with macros is active
  - **Files:** `frontend/src/renderer/components/library/MacroKnob.tsx` (new, ~50 lines)

- [ ] **10-4-5** Preset browser CSS
  - Grid layout: `grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`
  - Card hover: border highlight #4ade80
  - Favorite star: gold (#fbbf24) when active
  - **Files:** `frontend/src/renderer/styles/library.css` (new, ~80 lines)

- [ ] **10-4-6** Wire "Save as Preset" into EffectRack
  - New button in EffectRack header: "Save Chain as Preset"
  - Right-click individual effect: "Save Effect as Preset"
  - Both open PresetSaveDialog
  - **Files:** `frontend/src/renderer/components/effects/EffectRack.tsx` (modify)

### Factory Presets

- [ ] **10-4-7** Create 50+ factory presets
  - 10 single-effect presets per category (color, glitch, temporal, destruction, physics) = 50
  - 10 chain presets with curated multi-effect combinations + macro mappings
  - Stored in `resources/presets/factory/` directory
  - Script to generate: `scripts/generate_factory_presets.py` — queries effect registry, creates sensible defaults
  - **Files:** `resources/presets/factory/*.glitchpreset` (60 files), `scripts/generate_factory_presets.py` (new)

### Preset Drag-and-Drop

- [ ] **10-4-8** Enable drag from PresetCard → EffectRack drop zone
  - Use HTML5 drag API (matches existing EffectRack reorder pattern)
  - Drop on rack: apply preset (single → add effect, chain → replace chain with confirmation)
  - Drop on empty space: same as click-to-apply
  - **Files:** `frontend/src/renderer/components/library/PresetCard.tsx`, `frontend/src/renderer/components/effects/EffectRack.tsx`

- [ ] **10-4-9** Preset import via file drag
  - Drag `.glitchpreset` file from Finder onto app → import to user preset folder
  - Reuse existing DropZone pattern (from upload/DropZone.tsx)
  - **Files:** `frontend/src/renderer/App.tsx` (add preset file drop handler)

### Tests

- [ ] **10-4-10** Component tests for preset UI
  - `preset-browser.test.ts`: renders preset cards, search filters, category filter works
  - `preset-card.test.ts`: click applies preset, right-click shows menu
  - `preset-save.test.ts`: save dialog validates required fields, macro editor adds/removes rows
  - `macro-knob.test.ts`: moving knob updates all mapped params
  - **Files:** `frontend/src/__tests__/components/preset-*.test.ts` (4 new files)
  - **Target:** 12-15 new tests

- [ ] **10-4-11** E2E tests for preset workflow
  - `phase-10/presets.spec.ts`: save effect preset → appears in browser → apply → correct params
  - `phase-10/presets.spec.ts`: save chain preset with macro → load → macro controls params
  - `phase-10/presets.spec.ts`: search preset by name → finds it
  - **Files:** `frontend/tests/e2e/phase-10/presets.spec.ts` (new)
  - **Target:** 4-5 E2E tests

---

## Test Plan

### What to test
- [ ] Freeze prefix renders identical output to direct apply_chain
- [ ] Frozen prefix skip in pipeline reads from cache (faster)
- [ ] Unfreeze deletes cache file from disk
- [ ] Flatten creates valid, playable video file
- [ ] Auto-freeze triggers at >90% RAM (mocked)
- [ ] Edit param in frozen prefix → auto-invalidate + toast
- [ ] Freeze/unfreeze are undoable
- [ ] Flatten confirmation dialog (destructive, not undoable)
- [ ] Preset save (single) → file created with correct schema
- [ ] Preset save (chain) → file includes macro mappings
- [ ] Preset load → identical effect state recreated
- [ ] Preset browser search + category filter
- [ ] Macro knob moves → all mapped params change proportionally
- [ ] Factory presets load on first launch
- [ ] Drag preset to rack → applies

### Edge cases to verify
- [ ] Freeze with 0 effects in chain → reject/no-op
- [ ] Freeze with all effects disabled → still caches (disabled = bypass)
- [ ] Double-freeze same prefix → second call is no-op (return existing cache_id)
- [ ] Flatten when cache was invalidated → error toast
- [ ] Preset with unknown effectId → skip that effect, toast warning
- [ ] Preset with params outside current effect's range → clamp to valid range
- [ ] Macro mapped to non-existent param → silently ignore
- [ ] Save preset with empty name → validation error
- [ ] 100+ presets in folder → browser still renders fast (virtualized?)
- [ ] Concurrent freeze requests for different tracks → thread-safe

### How to verify
- Backend tests: `cd backend && python -m pytest tests/test_engine/test_freeze*.py -x --tb=short`
- Frontend tests: `cd frontend && npx vitest run --reporter=verbose`
- E2E tests: `cd frontend && npx playwright test tests/e2e/phase-10/`
- Manual: Import video → add 3 effects → right-click last → "Freeze up to here" → see frosted glass → scrub (should be fast) → edit a param → glass disappears

### Existing test patterns to follow
- Backend effect tests: 4-test contract (basic, determinism, boundary, state) — `test_effects/test_fx/test_blur.py`
- Backend ZMQ tests: request/reply with auth — `test_zmq_commands.py`
- Frontend store tests: in-memory store + mock IPC — `__tests__/stores/project.test.ts`
- Frontend component tests: mock bridge, render + assert — `__tests__/components/effects.test.ts`
- E2E tests: Electron fixture + test helpers — `tests/e2e/phase-1/effect-chain.spec.ts`

---

## NOT in Phase 10

- No GPU-accelerated freeze rendering
- No cloud preset sharing
- No preset versioning/migration
- No auto-generated preset thumbnails (Phase 11 polish)
- No preset preview audio (irrelevant for video effects)

---

## Estimated Test Count: +55-65 new tests → total ~890-895
