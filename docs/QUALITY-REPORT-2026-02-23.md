# Entropic v2 Challenger — Quality Report

**Date:** 2026-02-23
**Agent:** quality-gate
**Scope:** Full codebase audit (backend + frontend, Phase 0B + Phase 1)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **P0 (blocking)** | 2 |
| **P1 (should fix)** | 5 |
| **P2 (tech debt)** | 8 |

Backend: **413 passed, 6 skipped, 0 failures** (45s)
Frontend: **138 passed, 0 failures** (725ms)

No eval/exec/unsafe patterns found. No security CVEs. No test flakiness detected.

---

## P0 — Blocking (Must Fix Before Shipping)

### P0-1: Choice param field name mismatch — dropdowns render empty

**Severity:** P0
**Files:**
- `backend/src/effects/fx/pixelsort.py:28` — uses `"choices"`
- `backend/src/effects/fx/wave_distort.py:38` — uses `"choices"`
- `backend/src/effects/fx/edge_detect.py:12` — uses `"choices"`
- `frontend/src/shared/types.ts:169` — `ParamDef.options?: string[]`
- `frontend/src/renderer/components/effects/ParamChoice.tsx:19` — reads `def.options`
- `docs/EFFECT-CONTRACT.md:171` — documents `"options"` as the key name

**Description:** All three choice-type effects (Pixel Sort, Wave Distort, Edge Detect) send `"choices"` as the key for their option arrays. The frontend `ParamDef` type defines the field as `options`, and `ParamChoice.tsx` reads `def.options ?? []`. Since the backend sends `choices` but the frontend expects `options`, all choice dropdown menus will render **empty** — the user cannot select direction, method, etc.

This is the same class of bug as BUG-1 (field name mismatch). The `list_effects` endpoint sends raw PARAMS dicts from effects, so the key name must match exactly.

**Fix:** Either:
- (A) Rename `"choices"` to `"options"` in all 3 effect PARAMS dicts (matches the doc + frontend), OR
- (B) Change frontend `ParamDef.options` to `choices` and update `ParamChoice.tsx`

Option (A) is recommended — it matches the EFFECT-CONTRACT.md and the frontend type definition.

### P0-2: Export progress never reaches the UI

**Severity:** P0
**Files:**
- `frontend/src/preload/index.ts:29` — registers listener for `'export-progress'` IPC event
- `frontend/src/renderer/App.tsx:107` — calls `window.entropic.onExportProgress()`
- `frontend/src/main/index.ts` — **no code emits `'export-progress'`**
- `frontend/src/main/zmq-relay.ts` — **no export polling loop**

**Description:** The preload bridge and renderer are wired to receive export progress updates via the `'export-progress'` Electron IPC event. However, no code in the main process ever emits this event. The backend `export_status` command exists and returns progress, but nothing in the main process polls it and forwards results to the renderer.

**Result:** When a user starts an export, the progress bar will never update. It will stay at 0% indefinitely. The cancel button will work (it sends `export_cancel` via the relay), but the user has no feedback that the export is progressing or complete.

**Fix:** Add an export progress polling loop in `main/zmq-relay.ts` or a new `main/export-poll.ts`:
1. After `export_start` returns `ok: true`, start a `setInterval` (e.g., 500ms)
2. Send `{ cmd: "export_status" }` via ZMQ
3. Forward the response to the renderer via `BrowserWindow.webContents.send('export-progress', data)`
4. Stop polling when `status === "complete"` or `"error"` or `"cancelled"`

---

## P1 — Should Fix Soon

### P1-1: IPC contract has 3 unimplemented commands

**Severity:** P1
**Files:**
- `docs/IPC-PROTOCOL.md:57` — defines `render_range`
- `docs/IPC-PROTOCOL.md:75-76` — defines `audio_decode`, `audio_analyze`
- `frontend/src/shared/ipc-types.ts:25,53,59` — TypeScript types exist
- `backend/src/zmq_server.py` — **no handlers for these commands**

**Description:** The IPC protocol spec and frontend type definitions include `render_range`, `audio_decode`, and `audio_analyze` commands, but the backend has no handlers for them. Sending any of these will return `"unknown: render_range"` etc.

These are Phase 2+ features, but the TypeScript types and JSON schema could mislead developers into thinking they work.

**Fix:** Either add stub handlers that return `{ ok: false, error: "not implemented" }` or add explicit comments in the type file marking them as future.

### P1-2: `render_frame` SEC-7 chain depth validation missing

**Severity:** P1
**Files:**
- `backend/src/zmq_server.py:152-193` — `_handle_render_frame()`
- `backend/src/zmq_server.py:195-222` — `_handle_apply_chain()` — HAS validation

**Description:** `_handle_apply_chain` validates chain depth via `validate_chain_depth(chain)` (SEC-7), but `_handle_render_frame` does NOT. Both accept a `chain` parameter from the frontend. While `apply_chain` in the pipeline itself enforces `MAX_CHAIN_DEPTH`, the error message from `pipeline.apply_chain` raises a `ValueError` that gets caught as a generic exception, losing the SEC-7 specificity.

**Fix:** Add `validate_chain_depth(chain)` check to `_handle_render_frame` before the try block, matching `_handle_apply_chain`.

### P1-3: `_handle_seek` re-validates upload on every seek

**Severity:** P1
**File:** `backend/src/zmq_server.py:126-129`

**Description:** Every seek command re-runs `validate_upload(path)`, which calls `p.stat()` and checks file size, extension, symlink status. During playback at 30fps, this adds syscall overhead per frame. The file was already validated during `ingest`.

**Fix:** Consider caching validated paths (e.g., a `set` of already-validated paths populated after successful ingest). Or accept this as defense-in-depth and keep it (marking as P2 instead). The cost is low (~50us per seek), but it's redundant.

### P1-4: `VideoReader` never evicted from `self.readers` cache

**Severity:** P1
**File:** `backend/src/zmq_server.py:267-270`

**Description:** `_get_reader()` caches readers by path and never evicts them. If a user ingests multiple videos during a session, all readers (and their PyAV containers) remain open. Each reader holds a file descriptor and potentially decoded frame buffers.

**Fix:** Add LRU eviction (e.g., keep last 3 readers) or close old readers when a new one is created.

### P1-5: `onExportProgress` and `onEngineStatus` listeners are never cleaned up

**Severity:** P1
**Files:**
- `frontend/src/preload/index.ts:11` — `ipcRenderer.on('engine-status', ...)` — no removeListener
- `frontend/src/preload/index.ts:29` — `ipcRenderer.on('export-progress', ...)` — no removeListener

**Description:** Both IPC listeners are registered via `ipcRenderer.on()` but never removed. In the preload script this is acceptable for the lifetime of the window, but calling these functions multiple times (e.g., in React effects without cleanup) would register duplicate listeners.

The `onEngineStatus` call in `stores/engine.ts:19` runs at module load time (once), so it's fine. But `onExportProgress` in `App.tsx:107` runs inside a `useEffect` with `[exportJobId]` as a dependency, meaning it registers a new listener every time `exportJobId` changes. This creates listener leaks.

**Fix:** Return an unsubscribe function from the preload bridge:
```typescript
onExportProgress: (callback) => {
  const handler = (_event, data) => callback(data)
  ipcRenderer.on('export-progress', handler)
  return () => ipcRenderer.removeListener('export-progress', handler)
}
```
Then in App.tsx's useEffect, call the returned unsubscribe in the cleanup.

---

## P2 — Tech Debt (Nice to Have)

### P2-1: `console.log/error/warn` used instead of structured logging

**Severity:** P2
**Files:**
- `frontend/src/main/python.ts:44-46,55` — 4 console.log/error calls
- `frontend/src/main/watchdog.ts:78` — console.error
- `frontend/src/main/index.ts:47,51` — console.log/error
- `frontend/src/renderer/App.tsx:155,159,170` — console.error/warn

**Description:** 10 console.log/error/warn calls across the codebase. The main process ones are acceptable for Electron dev, but the renderer ones (`App.tsx`) should surface errors to the user via the UI rather than only logging to DevTools.

**Note:** The renderer errors in App.tsx do set `renderError` state for display, so the console calls are supplementary debug logging. This is acceptable but could be cleaned up.

### P2-2: EFFECT-CONTRACT.md `"options"` vs code `"choices"` inconsistency

**Severity:** P2 (already covered by P0-1, but the doc itself needs updating if option B is chosen)
**File:** `docs/EFFECT-CONTRACT.md:171`

**Description:** The contract doc shows `"options"` for choice params, but if the fix for P0-1 goes the other way (frontend adapts to `"choices"`), the doc needs updating too. Regardless of which fix is chosen, the doc and code must match.

### P2-3: TODO comment for Phase 6 modulation

**Severity:** P2
**File:** `frontend/src/renderer/components/effects/ParamPanel.tsx:38`

**Description:** `// TODO Phase 6: Replace ghostValue with resolved modulation value` — Known future work, tracked here for completeness.

### P2-4: `hue_shift` effect category mismatch

**Severity:** P2
**File:** `backend/src/effects/fx/hue_shift.py:7`

**Description:** `EFFECT_CATEGORY = "color"` — this is the only effect not in one of the taxonomy categories defined in ARCHITECTURE.md Section 9 (`fx`, `util`, `mod`/`op`). The taxonomy says effects should be under `fx.*`, utilities under `util.*`. "color" is not a defined namespace. Other effects use categories like "texture", "glitch", "distortion", "enhance" — these are subcategories, not the top-level taxonomy namespace.

This works fine in practice (the category is just a display string for the browser), but it's inconsistent with the spec.

### P2-5: `pixelsort` and `wave_distort` skip alpha preservation test

**Severity:** P2
**Files:**
- `backend/tests/test_all_effects.py` — alpha_preserved tests SKIPPED for fx.pixelsort and fx.wave_distort

**Description:** Both effects manipulate the frame in ways that don't explicitly preserve the alpha channel. Pixelsort reorders entire RGBA pixels (alpha follows), and wave_distort shifts entire RGBA pixels (alpha follows). The alpha IS preserved, but the test skips them. The skip markers should be removed and the tests should pass.

### P2-6: `ipc-types.ts` `apply_chain` Command missing `path` field

**Severity:** P2
**File:** `frontend/src/shared/ipc-types.ts:37-38`

**Description:** The TypeScript `apply_chain` command type does not include a `path` field, but the backend `_handle_apply_chain` requires `path` and returns an error if it's missing. The JSON schema (`ipc-command.schema.json:68-75`) correctly requires `path`. Only the TypeScript type is wrong.

This hasn't caused bugs yet because `apply_chain` is not currently called from the renderer (only `render_frame` is used for preview).

### P2-7: Hardcoded `project_seed: 42` in App.tsx

**Severity:** P2
**File:** `frontend/src/renderer/App.tsx:146,305`

**Description:** The project seed is hardcoded to 42 in both `render_frame` and `export_start` calls. The `ProjectSettings` type defines a `seed` field, but it's never read. This means all projects share the same seed, reducing effect variation.

**Fix:** Read from project settings once the project store is wired up.

### P2-8: `ipc-command.schema.json` missing `_token` field

**Severity:** P2
**File:** `frontend/src/shared/schemas/ipc-command.schema.json`

**Description:** The schema uses `additionalProperties: false` on all command variants, but the ZMQ relay injects `_token` into every command (`zmq-relay.ts:72`). If schema validation were run on outbound commands, it would reject every message. Currently, validation is only used in tests, so this doesn't cause runtime issues.

---

## Clean Bill of Health

The following areas passed inspection with no issues:

- **Test suite stability:** 413 backend + 138 frontend tests, zero failures, no flaky tests
- **Security gates:** SEC-5 (upload validation), SEC-6 (frame count), SEC-7 (chain depth) all enforced with dedicated tests
- **ZMQ auth:** Token-based authentication on all commands including the ping socket
- **Effect determinism:** All 10 effects pass byte-identical determinism tests
- **Effect contract compliance:** All effects follow the pure function signature, use seeded RNG, no module globals, no side effects
- **Effect registration:** All 10 effects registered in registry.py, auto-discovered at import time
- **Container pipeline:** Mask + mix pipeline correctly wraps all effects
- **No unsafe patterns:** Zero eval(), exec(), __import__, subprocess.call(), os.system() usage
- **IPC serialization:** camelCase-to-snake_case mapping works correctly (BUG-1 fix verified by tests)
- **Watchdog protocol:** Dual-socket (ping + command), render-aware miss tolerance (BUG-4 fix), restart recovery
- **Error boundaries:** Sentry error boundary wraps the entire React app
- **Sentry integration:** Both backend (sentry_sdk) and frontend (@sentry/electron) configured
- **Path traversal protection:** validate_upload checks symlinks, traversal chars, extension whitelist
- **Output path safety:** validate_output_path blocks writes to system directories
- **Shared memory writer:** Ring buffer with proper header, slot overflow protection, quality fallback chain
- **State management:** Zustand stores are simple and correct, no obvious race conditions in single-threaded React

---

## Recommendations

1. **Fix P0-1 and P0-2 immediately** — choice dropdowns and export progress are user-facing features that are completely broken
2. **Fix P1-2 before shipping** — missing SEC-7 validation on render_frame is a security gap
3. **Fix P1-5 before shipping** — listener leaks will cause memory issues in long sessions
4. **Address P2 items during Phase 2A** — they're non-blocking but improve code quality
