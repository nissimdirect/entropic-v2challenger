---
title: Phase 1 UAT Bug Report
date: 2026-02-23
tester: nissim
build: Phase 1 (pre-export)
status: open
bugs_found: 4
severity: 2x P0, 2x P1
---

# Phase 1 UAT Bug Report — 2026-02-23

> UAT stopped before reaching export. Four bugs found in the core pipeline.

---

## BUG-1: Effects Don't Update Preview (P0 — Blocking)

**Symptom:** Adding effects and adjusting params has zero visual impact on the canvas.

**Root cause:** Field name mismatch between frontend and backend. Frontend sends camelCase, Python expects snake_case.

| Frontend sends | Backend expects | Result |
|---|---|---|
| `effectId` | `effect_id` | `registry.get(None)` → `ValueError("unknown effect: None")` |
| `isEnabled` | `enabled` | Always defaults to `True` (never toggled) |
| `parameters` | `params` | Always empty `{}` (all params ignored) |

Every `render_frame` with effects returns `ok: false`. Error logged to console only — zero visible UI feedback.

**Key files:**
- `frontend/src/renderer/App.tsx:136` — sends `chain: effectChain` as-is (camelCase)
- `backend/src/engine/pipeline.py:48-53` — reads `effect_instance.get("effect_id")` (snake_case)
- `backend/src/zmq_server.py:129-160` — catches ValueError, returns `ok: false`
- `frontend/src/renderer/App.tsx:144-146` — only `console.error`, no UI indicator

**Fix direction:** Add a serialization layer that maps EffectInstance fields before ZMQ send. Needed in `requestRenderFrame` (App.tsx:136) and `handleExport` (App.tsx:245).

---

## BUG-2: FPS Instability (P1 — Major)

**Symptom:** Frame rate counter fluctuates throughout playback.

**Root causes (ranked by impact):**

| # | Issue | Jitter | File |
|---|-------|--------|------|
| 1 | **Seek-per-frame** — `VideoReader.decode_frame()` does full `container.seek()` for every frame, even sequential. I-frame vs P-frame cost varies 5-200ms | 5-200ms | `backend/src/video/reader.py:21` |
| 2 | **Frame dropping** — single-slot `pendingFrameRef` drops intermediate frames | frames skipped | `frontend/src/renderer/App.tsx:124` |
| 3 | **setInterval clock** — no drift compensation | 1-10ms | `frontend/src/renderer/App.tsx:226` |
| 4 | **New ZMQ socket per frame** — 30 connect/disconnect cycles per second | 0.5-5ms | `frontend/src/main/zmq-relay.ts:18` |
| 5 | **Double JPEG encode** — once for mmap (unused), once for base64 | 4-30ms | `backend/src/zmq_server.py:144-148` |
| 6 | **Base64 in JSON** — 200-670KB strings through IPC per frame | 1-10ms | Multiple |
| 7 | **Async Image.onload** — browser decode timing is non-deterministic | 1-5ms | `frontend/src/renderer/components/preview/PreviewCanvas.tsx:68` |

**Fix direction:**
1. Sequential decode mode (don't seek when advancing by 1 frame)
2. Render-driven clock (advance frame only after previous displayed)
3. Persistent ZMQ socket (reuse, don't create/destroy per frame)
4. Remove duplicate JPEG encode (use either mmap OR base64, not both)

---

## BUG-3: "No Video Loaded" After Adding Effect First (P1 — Major)

**Symptom:** Add effect → upload video → sidebar shows filename but preview says "No video loaded."

**Root cause:** When effects exist before upload, the first `render_frame` sends the effect chain, which fails due to BUG-1 (field mismatch). Since `res.ok === false`, `setFrameDataUrl` is never called, so `frameDataUrl` stays `null`, and the preview shows "No video loaded."

The sidebar reads from a separate state source (`assets` Zustand store via `addAsset()`) which succeeded.

**Contributing factors:**
- Upload UI disappears after ingest (`hasAssets` conditional at `App.tsx:344-350`), preventing retry
- No visible error state — `console.error` at `App.tsx:145` is the only signal
- No distinction between "loading", "error", and "no video" in PreviewCanvas (`PreviewCanvas.tsx:80-84`)

**Key files:**
- `frontend/src/renderer/App.tsx:140-146` — silent failure path
- `frontend/src/renderer/App.tsx:195-202` — state ordering: addAsset → setRef → setFrame → render
- `frontend/src/renderer/App.tsx:344-350` — upload UI removed after first asset

**Fix direction:** Render frame 0 with empty chain on ingest success (before applying effects). Add visible error state to preview. Add retry mechanism.

---

## BUG-4: wave_distort Freezes Video (P0 — Blocking)

**Symptom:** Applying wave_distort completely stops video playback. Likely also pixelsort.

**Root cause:** Python for-loop per row/column:

```python
# wave_distort.py:56-65
for y in range(h):  # 1080 iterations at 1080p
    shift = int(amplitude * np.sin(2 * np.pi * frequency * y / h))
    output[y] = np.roll(frame[y], shift, axis=0)
```

Takes 200-500ms/frame at 1080p. The ZMQ server is single-threaded (`zmq_server.py:229-239`), so this blocks ALL messages including watchdog pings. After 3 missed pings (6s), the watchdog kills Python (`watchdog.ts:54-66`). Engine restarts, next frame triggers the same effect, infinite loop.

**Cascade:** slow effect → blocks ZMQ → watchdog timeout → engine kill → restart → repeat

**Also affected:** `pixelsort.py:62-95` has same per-row Python loop pattern.

**Safe effects:** blur (scipy C), edge_detect (OpenCV C++), vhs (mostly vectorized).

**Fix direction:**
1. Vectorize wave_distort with `scipy.ndimage.map_coordinates` (single call, no loop)
2. Separate ZMQ ping handler from render thread (or use DEALER/ROUTER pattern)
3. Add per-effect timeout (100ms hard cap)
4. Watchdog should exempt render-in-progress from miss count

---

## UAT Gaps Identified

Tests added to `V2-AUTOMATED-UAT-PLAN.md`:

| Gap | New Test |
|-----|----------|
| No frontend↔backend field contract test | IPC Contract Tests #1-4 |
| No effect-before-import recovery test | Phase 1 #21, Chaos Suite #18-19 |
| No slow-effect watchdog tolerance test | Effect Performance Budget #1-2, Chaos Suite #20-21 |
| No sequential frame decode benchmark | Effect Performance Budget #3 |
| No render error visibility test | Phase 1 #22 |
| No effect combination/permutation tests | Effect Combination Matrix (100 pairs + 100 sampled triples) |

---

## Next Steps

1. **Fix BUG-1 first** — it blocks all effect-related testing (field name mismatch)
2. **Fix BUG-4** — vectorize wave_distort + pixelsort (blocks playback testing)
3. **Fix BUG-2** — sequential decode mode is the highest-impact FPS fix
4. **Fix BUG-3** — will partially resolve once BUG-1 is fixed; add error state to preview

Do NOT export-test until BUG-1 is fixed — export likely has the same field mismatch.
