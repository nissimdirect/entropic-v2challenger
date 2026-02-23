---
title: Phase 1 Pattern Evolution — 9 Architectural Patterns from UAT Bug Fixes
date: 2026-02-23
project: entropic-v2challenger
phase: Phase 1 (Core Pipeline)
trigger: First UAT revealed 4 bugs (2x P0, 2x P1) that required 15 fixes across 12+ files
tags: [ipc, zmq, watchdog, performance, security, error-handling, serialization]
---

# Phase 1 Pattern Evolution

> UAT found 4 bugs. Fixing them produced 9 reusable architectural patterns.
> These patterns are now part of the codebase DNA — future phases must follow them.

---

## Pattern 1: IPC Serialization Boundary

**Problem:** Frontend sent camelCase `EffectInstance` objects (`effectId`, `isEnabled`, `parameters`) directly to Python, which expected snake_case (`effect_id`, `enabled`, `params`). Every effect silently failed.

**Solution:** Explicit serialization layer at the process boundary.

**File:** `frontend/src/shared/ipc-serialize.ts`

**Rule:** Never pass domain objects across process boundaries without explicit field mapping. The serialization layer is the contract — both sides agree on its shape, and only one file needs to change if either side renames a field.

**Test gate:** `backend/tests/test_ipc_contracts.py` — 10 tests that validate field names at the `apply_chain` boundary. If a field is renamed, these tests break before the bug reaches UAT.

---

## Pattern 2: Sequential Decode Optimization

**Problem:** `VideoReader.decode_frame()` called `container.seek()` for every frame, even during sequential playback. Seek cost: 5-200ms per frame (depends on I-frame distance).

**Solution:** Track `_last_decoded_index`. If `frame_index == last + 1`, use `next(decoder)` instead of seeking. Reset decoder only for non-sequential access.

**File:** `backend/src/video/reader.py`

**Rule:** Track access patterns in I/O-heavy code. The common case (sequential playback) should be the fast path. Only pay seek cost for scrubbing/jumping.

---

## Pattern 3: Persistent ZMQ Socket with Error Reset

**Problem:** New ZMQ REQ socket per command → 30 connect/disconnect cycles/sec during playback.

**Solution:** `getOrCreateSocket()` reuses a persistent socket. On error, `closePersistentSocket()` destroys it so the next call creates a fresh one.

**File:** `frontend/src/main/zmq-relay.ts`

**Rule:** Pool connections; reset on error. The persistent socket pattern is: lazy-create → reuse → destroy-on-failure → recreate. Also reconnectable: `reconnectRelay()` called by watchdog on Python restart.

---

## Pattern 4: Isolated Health Check Channel

**Problem:** Watchdog pings went through the same REQ/REP socket as heavy render commands. A slow effect (500ms) blocked the ping response, causing the watchdog to kill Python.

**Solution:** Separate ZMQ socket on a dedicated ping port. Python binds two ports at startup (`ZMQ_PORT` + `ZMQ_PING_PORT`). Watchdog pings only the ping port.

**Files:** `backend/src/zmq_server.py` (dual bind), `frontend/src/main/watchdog.ts` (ping port)

**Rule:** Health checks must be independent of the work channel. Never multiplex monitoring and workload on the same socket/thread/port.

---

## Pattern 5: Workload-Aware Timeout

**Problem:** Fixed 3-miss watchdog threshold was too aggressive during heavy renders.

**Solution:** `setRenderInFlight(true/false)` in zmq-relay.ts signals the watchdog. When a render is in flight, miss threshold rises from 3 to 10. ZMQ relay sets this flag before/after render commands.

**Files:** `frontend/src/main/zmq-relay.ts` (sets flag), `frontend/src/main/watchdog.ts` (reads flag)

**Rule:** Timeout thresholds must be context-aware. A system that kills processes based on fixed timeouts will kill them during legitimate heavy work. Coordinate tolerance with workload state.

---

## Pattern 6: Per-Session Auth Token

**Problem:** Any local process could send ZMQ commands to the Python sidecar.

**Solution:** UUID token generated at Python startup, printed to stdout (`ZMQ_TOKEN=...`), parsed by Electron. Every ZMQ message includes `_token` field. Python validates before processing.

**Files:** `backend/src/main.py` (generates), `backend/src/zmq_server.py` (validates), `frontend/src/main/python.ts` (parses), `frontend/src/main/zmq-relay.ts` (injects)

**Rule:** Authenticate even localhost IPC. The token is ephemeral (per-session), requires no config, and prevents rogue processes from manipulating the sidecar.

---

## Pattern 7: Per-Effect Timeout Guard

**Problem:** A slow effect blocked the entire ZMQ server indefinitely. No visibility into which effect was slow.

**Solution:** `pipeline.py` wraps each effect with `time.monotonic()`. Warns at 100ms, aborts at 500ms (returns input frame unchanged). Logs include effect ID and frame index.

**File:** `backend/src/engine/pipeline.py`

**Rule:** Instrument every pipeline stage with timing and a circuit breaker. Don't let one bad stage cascade into a system-wide hang. The abort threshold (500ms) preserves liveness at the cost of one dropped effect.

---

## Pattern 8: Vectorized Pixel Processing

**Problem:** Python for-loops iterating pixel rows: 200-500ms/frame at 1080p for wave_distort and pixelsort.

**Solution:** NumPy fancy indexing and `scipy.ndimage.map_coordinates` for sub-pixel interpolation. Single vectorized call replaces the for-loop.

**Files:** `backend/src/effects/fx/wave_distort.py`, `backend/src/effects/fx/pixelsort.py`

**Rule:** Never iterate pixel rows/columns in Python. Use numpy/scipy vectorized operations. Target: <100ms per effect at 1080p. Test gate: `backend/tests/test_performance.py` (43 perf tests).

---

## Pattern 9: Visible Error State

**Problem:** All render/drop errors went to `console.error()` only. User saw broken UI with no explanation.

**Solution:** `dropError` state in App.tsx. Error banner component renders when set. Clears on next successful operation.

**File:** `frontend/src/renderer/App.tsx`

**Rule:** Every error must be visible to the user, not just logged. If an IPC command returns `ok: false`, the user must see why. Silent failures are the worst kind of bug — they erode trust.

---

## Meta-Learning: The Cascade Pattern

BUG-4 demonstrated a cascade failure: slow effect → blocks ZMQ → blocks pings → watchdog kills → restart → re-apply same effect → infinite loop. Three independent patterns (4, 5, 7) were needed to break the cascade:

- Pattern 4 (separate ping port) prevents ZMQ blocking
- Pattern 5 (render-aware timeout) prevents premature kills
- Pattern 7 (per-effect timeout) prevents the slow effect from running forever

**Rule:** Cascade failures require defense at every link in the chain, not just the root cause.
