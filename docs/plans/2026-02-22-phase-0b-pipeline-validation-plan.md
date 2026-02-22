---
title: Phase 0B — Pipeline Validation
status: active
created: 2026-02-22
depends_on: Phase 0A (complete)
estimated_sessions: 2-3
---

# Phase 0B: Pipeline Validation — Build Plan

> Shared memory + frame transport + PyAV + Effect Container + JSON Schema.
> **Goal:** Prove the frame pipeline works at 30fps before building anything on it.
> **Strategy:** Backend-first (no C++ dependency), then native module, then integration.

---

## Pre-Session: User Prerequisites (before Session 2)
- [ ] Install Xcode (full, not just CLI tools) — needed for node-gyp C++ compilation
- [ ] Install node-gyp globally: `npm install -g node-gyp@10`
- [ ] Verify: `xcodebuild -version` and `node-gyp --version`

---

## Session 1: Backend Foundation (Python)

### 1-Pre. Fix Import Structure + Install Dependencies
- [ ] Add `pythonpath = ["src"]` to `[tool.pytest.ini_options]` in `pyproject.toml` (replaces `sys.path.insert` hack)
- [ ] Add `av>=14.0` and `Pillow>=11.0` to `pyproject.toml` dependencies
- [ ] Install deps in venv: `pip install av Pillow`
- [ ] Verify: `python -c "import av; print(av.__version__)"`
- [ ] **Early risk kill:** Test Nuitka + PyAV compilation now — `python -m nuitka --standalone src/main.py` (if fails, discover day 1 not day 3)
- [ ] Remove `sys.path.insert` hack from `conftest.py`

### 1A. Determinism Module
- [ ] Create `backend/src/engine/__init__.py`
- [ ] Create `backend/src/engine/determinism.py` — seed derivation function: `Hash(project_id:effect_id:frame_index:user_seed)` → `np.random.default_rng(seed)`
- [ ] Test (`tests/test_engine/test_determinism.py`): same inputs → identical seed → identical RNG sequence
- [ ] Test: different frame_index → different seed

### 1B. MJPEG Cache Module
- [ ] Create `backend/src/engine/cache.py` — RGBA frame → MJPEG Q95 bytes (Pillow). **Note:** RGBA→RGB conversion at encoding — alpha not transported over shared memory (by design, canvas is RGB only)
- [ ] Test (`tests/test_engine/test_cache.py`): encode 1080p frame, verify JPEG header bytes, verify size < 1MB
- [ ] Test: decode back to RGB, verify dimensions match, verify PSNR > 40dB (Q95 quality gate)

### 1C. Shared Memory Writer (Python)
- [ ] Create `backend/src/memory/__init__.py`
- [ ] Create `backend/src/memory/writer.py` — mmap ring buffer (file-backed at `~/.cache/entropic/frames`, NOT `/tmp`)
- [ ] Mmap path passed via env var `ENTROPIC_SHM_PATH` or defaulting to `~/.cache/entropic/frames`
- [ ] Header layout: 64 bytes (write_index u32, frame_count u32, slot_size u32, ring_size u32, width u32, height u32, reserved 40 bytes)
- [ ] Ring: 4 slots × 4MB, each slot = [length u32][MJPEG data]
- [ ] `write_frame(rgba_array)`: encode MJPEG Q95 → write to next slot → increment write_index (use `struct.pack_into` for atomic 4-byte aligned write)
- [ ] Test (`tests/test_memory/test_writer.py`): write 10 frames, read back raw bytes from mmap, verify MJPEG headers present
- [ ] Test: write_index wraps correctly after 4 writes (ring semantics)

### 1D. PyAV Video Reader
- [ ] Create `backend/src/video/__init__.py`
- [ ] Create `backend/src/video/reader.py` — open MP4, decode frame at time, seek to keyframe
- [ ] API: `open(path) → handle`, `seek(handle, time_s) → frame_index`, `decode(handle, frame_index) → np.ndarray (RGBA)`
- [ ] Test: open a test MP4 (generate synthetic 5s 720p clip with PyAV first), decode frame 0, verify shape
- [ ] Test: seek to 3 random positions, verify frames are different

### 1E. PyAV Video Writer
- [ ] Create `backend/src/video/writer.py` — encode frames to H.264 MP4
- [ ] API: `create(path, width, height, fps) → handle`, `write_frame(handle, rgba_array)`, `close(handle)`
- [ ] Test: write 30 synthetic gradient frames → close → re-open with reader → verify 30 frames decodable

### 1F. Ingest Module
- [ ] Create `backend/src/video/ingest.py` — fast header probe (codec, resolution, fps, duration, has_audio)
- [ ] API: `probe(path) → { width, height, fps, duration_s, codec, has_audio, frame_count }`
- [ ] Test: probe the synthetic test clip, verify all fields match expected values

**Session 1 commit checkpoint:** `feat: Phase 0B backend — determinism, cache, memory writer, PyAV I/O`

---

## Session 2: Effect Container + Native Module

### 2A. Effect Container
- [ ] Create `backend/src/engine/container.py` — EffectContainer class
- [ ] Pipeline: mask → process → mix (as per ARCHITECTURE spec)
- [ ] `process(frame, params, state_in, *, frame_index, project_seed, resolution) → (output, state_out)`
- [ ] Handles `_mask` param (float32 H×W, 0.0-1.0) — multiplies before effect, blends after
- [ ] Handles `_mix` param (0.0 dry, 1.0 wet) — linear blend
- [ ] Handles deterministic seed derivation (delegates to `determinism.py`)
- [ ] Test: fx.invert with no mask, mix=1.0 → fully inverted
- [ ] Test: fx.invert with mix=0.5 → 50% blend (pixel-level comparison)
- [ ] Test: fx.invert with checkerboard mask, mix=1.0 → inverted only in masked regions

### 2B. Taxonomy Registry + fx.invert
- [ ] Create `backend/src/effects/__init__.py`
- [ ] Create `backend/src/effects/registry.py` — `{ "fx.invert": { fn, params, name, category } }`, `register()`, `get()`, `list_all()`
- [ ] Create `backend/src/effects/fx/__init__.py`
- [ ] Create `backend/src/effects/fx/invert.py` — pure function: `apply(frame, params, state_in, *, frame_index, seed, resolution) → (255 - frame, None)`
- [ ] Test: registry lists fx.invert with correct metadata
- [ ] Test: fx.invert produces `255 - input` for all channels (RGBA)
- [ ] Test: determinism — same frame+params+seed → byte-identical output (V6)

### 2C. Extended ZMQ Commands
- [ ] Add `ingest` command to `zmq_server.py` — calls `video.ingest.probe()`, returns metadata
- [ ] Add `seek` command — calls `video.reader.seek()`, writes frame to shared memory
- [ ] Add `render_frame` command — decodes frame, runs effect chain through containers, writes to shared memory
- [ ] Add `list_effects` command — calls `effects.registry.list_all()`
- [ ] Add `flush_state` command (stub) — accepts `{ project: Project }`, logs receipt, returns `{ ok: true }`. Required for watchdog recovery flow.
- [ ] Test: send `ingest` command via ZMQ, verify response has width/height/fps
- [ ] Test: send `render_frame` with empty chain, verify frame in shared memory
- [ ] Test: send `render_frame` with fx.invert, verify inverted frame in shared memory
- [ ] Test: send `flush_state` with minimal project dict, verify ok response

### 2D. C++ Native Module (Shared Memory Reader)
- [ ] Create `frontend/native/binding.gyp` — node-gyp config targeting Electron 40, arm64, node-addon-api
- [ ] Create `frontend/native/src/shared_memory.cc` — ~200 lines: open file-backed mmap, read latest slot, get write_index
- [ ] API: `open(path)`, `readLatestFrame() → Buffer (MJPEG bytes)`, `getWriteIndex() → number`, `close()`
- [ ] Create `frontend/native/index.d.ts` — TypeScript declarations
- [ ] Add `@electron/rebuild` or manual node-gyp build script to `frontend/package.json`
- [ ] Build with: `--target=40.0.0 --arch=arm64 --dist-url=https://electronjs.org/headers`
- [ ] Verify: install `node-addon-api` as dev dependency
- [ ] Test: C++ module loads in Electron main process without crash
- [ ] Test: reads MJPEG bytes written by Python memory writer (cross-process verification)

**Session 2 commit checkpoint:** `feat: Phase 0B effect container, registry, native module, ZMQ extensions`

---

## Session 3: Integration + Validation Tests + Schemas

### 3A. JSON Schemas
- [ ] Create `frontend/src/shared/schemas/ipc-command.schema.json` — validates all ZMQ commands
- [ ] Create `frontend/src/shared/schemas/ipc-response.schema.json` — validates all ZMQ responses
- [ ] Create `frontend/src/shared/schemas/project.schema.json` — `.glitch` project file format
- [ ] Create `frontend/src/shared/types.ts` — TypeScript interfaces matching schemas
- [ ] Create `frontend/src/shared/validate.ts` — schema validation utility (ajv or similar)
- [ ] Test: valid command passes validation
- [ ] Test: malformed command fails validation with useful error

### 3B. Canvas Display Integration
- [ ] Update `frontend/src/renderer/App.tsx` — add `<canvas>` element for frame display
- [ ] Add frame display loop: read from native module → decode MJPEG → draw to canvas
- [ ] Add FPS counter overlay (dev mode)
- [ ] Wire up "Load Video" button → send `ingest` command → display first frame

### 3C. End-to-End Pipeline Test
- [ ] Generate a synthetic test video (5s, 720p, solid color gradient) using PyAV
- [ ] Ingest → decode → fx.invert → shared memory → native module read → verify bytes
- [ ] This is the "one frame through the whole pipeline" smoke test

### 3D. Validation Tests (V1–V7 Gate)

**V1: Shared Memory Throughput**
- [ ] Python writes 300 random 1080p RGBA frames to mmap ring buffer
- [ ] C++ native module reads each frame
- [ ] PASS: ≥30fps sustained, <16ms per frame round-trip
- [ ] FAIL action: profile mmap setup, check MJPEG encoding bottleneck

**V2: PyAV Scrub Test**
- [ ] Open a 4K H.264 MP4 (30 seconds — generate or use test asset)
- [ ] Seek to 100 random frame positions
- [ ] PASS: <50ms per random seek at 1080p, <100ms at 4K
- [ ] FAIL action: profile PyAV decode, check keyframe distance

**V3: PyAV Write Test**
- [ ] Generate 300 synthetic frames (1080p, random gradients)
- [ ] Encode to H.264 MP4 via PyAV
- [ ] PASS: file plays correctly (ffprobe validates, duration matches)
- [ ] FAIL action: debug PyAV codec config

**V4: Effect Container Pipeline**
- [ ] Load frame via PyAV → run through EffectContainer with fx.invert
- [ ] Checkerboard mask + mix=0.5
- [ ] PASS: pixel-level comparison matches expected output (tolerance ±1 for rounding)
- [ ] FAIL action: debug mask/mix math

**V5: ZMQ Command Latency Under Load**
- [ ] Stream 30fps frames via shared memory while sending 60 ZMQ commands/sec
- [ ] PASS: 95th percentile command round-trip <10ms
- [ ] FAIL action: check thread contention, may need separate ZMQ thread

**V6: Determinism Test**
- [ ] Run fx.invert on same frame with same seed twice
- [ ] PASS: `np.array_equal(result1, result2) == True`
- [ ] FAIL action: audit for global state leaks

**V7: Nuitka Build Test**
- [ ] Compile backend with Nuitka (standalone)
- [ ] Run V1–V6 with compiled binary
- [ ] PASS: all tests pass, binary <200MB
- [ ] FAIL action: check Nuitka compatibility with pyzmq/numpy/pyav

### 3E. Project File Schema
- [ ] Create `backend/src/project/__init__.py`
- [ ] Create `backend/src/project/schema.py` — serialize/deserialize `.glitch` project files (JSON)
- [ ] Test: create project → serialize → deserialize → verify all fields roundtrip
- [ ] Test: corrupt project file → deserialize → get clear validation error

**Session 3 commit checkpoint:** `feat: Phase 0B complete — schemas, canvas, validation tests, Nuitka`

---

## Test Plan

### What to test (unit level)
- [ ] Determinism: same inputs → same outputs, always
- [ ] MJPEG encoding: correct headers, reasonable size, high PSNR on decode
- [ ] Ring buffer: wrap-around, concurrent read/write safety (single writer)
- [ ] PyAV: open/seek/decode/encode for MP4 H.264
- [ ] Effect Container: mask isolation, mix blending, pure function contract
- [ ] Registry: registration, lookup, list
- [ ] ZMQ commands: each new command returns correct response format
- [ ] JSON Schema: valid/invalid message validation
- [ ] Project file: roundtrip serialization
- [ ] C++ native module: loads, reads mmap, returns Buffer

### Edge cases to verify
- [ ] Empty video file → ingest returns clear error, no crash
- [ ] Zero-length frame → cache encoder handles gracefully
- [ ] mmap file doesn't exist yet → writer creates it, reader waits or errors clearly
- [ ] mmap file is stale from crashed session → writer truncates and recreates
- [ ] 4K frame (33MB raw) → fits in 4MB slot after MJPEG compression (verify Q95 is sufficient)
- [ ] Frame with all-black or all-white pixels → fx.invert produces correct inverse
- [ ] mix=0.0 → output is exactly the input (no floating point drift)
- [ ] mix=1.0 → output is exactly the effect output
- [ ] Mask with all-zeros → output is exactly the input (effect not applied)
- [ ] Mask with all-ones → output is fully effected
- [ ] Ring buffer full (4 writes without reads) → oldest slot overwritten, no crash
- [ ] PyAV seek past end of video → returns last frame or clear error
- [ ] Malformed ZMQ command (missing fields) → error response, no crash
- [ ] Unicode file paths → PyAV handles correctly

### How to verify (reproduction commands)
```bash
# Run all backend tests
cd ~/Development/entropic-v2challenger/backend && python3 -m pytest tests/ -x --tb=short -v

# Run frontend tests
cd ~/Development/entropic-v2challenger/frontend && npx vitest run

# TypeScript check
cd ~/Development/entropic-v2challenger/frontend && npx tsc --noEmit

# Build C++ native module
cd ~/Development/entropic-v2challenger/frontend/native && \
  HOME=~/.electron-gyp node-gyp rebuild \
  --target=40.0.0 --arch=arm64 \
  --dist-url=https://electronjs.org/headers

# Run validation tests specifically
cd ~/Development/entropic-v2challenger/backend && python3 -m pytest tests/validation/ -x --tb=short -v

# Nuitka build
cd ~/Development/entropic-v2challenger/backend && \
  python3 -m nuitka --standalone --follow-imports src/main.py

# Launch app (manual UAT)
cd ~/Development/entropic-v2challenger/frontend && npm start
```

### What "working" looks like
- All pytest + vitest tests pass (0 failures)
- `npm start` → Electron window opens → "Engine: Connected" indicator
- Click "Load Video" → first frame appears on canvas
- FPS counter shows ≥30fps during frame streaming
- V1–V7 validation tests all pass
- Nuitka binary runs and passes all validation tests

### What "broken" looks like
- Native module fails to load → `Error: dlopen() failed` or ABI mismatch
- Shared memory reads return empty/corrupt data → garbled canvas
- PyAV crashes on seek → segfault (check codec/container compatibility)
- ZMQ deadlock → UI hangs on command (check REQ/REP socket pattern)
- Nuitka binary missing pyzmq/numpy/pyav → import errors

### Existing test patterns to follow
- Backend: pytest with `conftest.py` fixtures, `tests/test_zmq_server.py` shows ZMQ test pattern
- Frontend: vitest with `src/__tests__/*.test.ts`, mocking pattern from watchdog tests
- Test framework: pytest (backend), vitest (frontend) — match Phase 0A

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| node-gyp build fails on Apple Silicon | Medium | High | Use cmake-js as fallback, or pure JS SharedArrayBuffer if C++ blocked |
| PyAV segfaults on certain codecs | Low | Medium | Pin PyAV version, test with H.264 only, add try/catch |
| 4K frames exceed 4MB slot size at Q95 | Low | Medium | Dynamic quality reduction (Q85→Q75) if frame > slot_size |
| mmap contention between Python writer + C++ reader | Low | Medium | Single-writer guarantee + atomic write_index |
| Nuitka + PyAV compatibility | Medium | Medium | Test early (don't leave to V7), have pyinstaller as backup |
| Python 3.14 + node-gyp distutils | Medium | Low | Already have setuptools in venv, pin node-gyp >= v10 |

---

## Dependencies & Build Requirements

### Python (backend)
- pyzmq >= 27.0 (already installed)
- numpy >= 2.0 (already installed)
- PyAV >= 14.0 (`pip install av`)
- Pillow >= 11.0 (for MJPEG encoding alternative to OpenCV)
- pytest (already installed)
- nuitka (already installed)

### Node.js (frontend)
- node-addon-api (`npm install --save-dev node-addon-api`)
- @electron/rebuild (`npm install --save-dev @electron/rebuild`)
- ajv (`npm install ajv`) for JSON Schema validation
- Existing: electron 40, react 19, electron-vite 5, zustand 5, zeromq.js 6.5

### System
- Xcode Command Line Tools (or full Xcode) — for node-gyp C++ compilation
- node-gyp >= v10 (`npm install -g node-gyp`)
- Python 3.14 with setuptools (already in venv)

---

## NOT in Phase 0B

- No UI beyond canvas + status indicator + "Load Video" button
- No timeline (Phase 4)
- No audio (Phase 2B)
- No parameter UI / knobs (Phase 2A)
- No upload flow with progress (Phase 1)
- Only one test effect (fx.invert)
- No multi-effect chains (Phase 1)
- No automation or modulation (Phase 6-7)
