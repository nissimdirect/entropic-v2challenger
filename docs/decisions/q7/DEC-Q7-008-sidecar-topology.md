# DEC-Q7-008 — Sidecar topology: separate L worker process

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #4 (Session 1) — blocks Session 2 PR #9
**Scope:** Should the multi-headed L backbone run inside the existing Python ZMQ sidecar (one process, two ZMQ endpoints) OR as a separate Python process with its own IPC channel?

This is the single highest-leverage architectural decision in Q7. It cascades into SG-4 (audio thread isolation), the lifecycle code in PR #9, the watchdog story, and how the frontend wires up encoded-latent caching.

## Question

The existing v2 Challenger architecture: Electron → Python sidecar (`backend/src/zmq_server.py`, `backend/src/main.py`) over ZMQ REQ/REP with token auth + 1s watchdog heartbeat. One Python process. Memory file confirms: "single ZMQ REQ/REP, auto-spawn, token auth, separate ping port."

The L backbone (DINOv2 + CLIP + CLAP) needs to:
- Run inference on demand (encode frames → 384/512-dim embeddings)
- Stay resident in memory (model load is slow — many seconds per backbone)
- Not starve the realtime audio thread (SG-4 contract)
- Survive backbone crashes without taking down the renderer
- Get torn down on app exit cleanly

Where does it live?

## Options considered

### Option A — One Python process, two ZMQ endpoints

- Same `python -m main` process hosts both the rendering ZMQ server AND a second ZMQ socket for L inference (different port)
- Shared interpreter, shared GIL, shared memory pools
- Frontend opens two ZMQ sockets (render port + L port)

**Pros:**
- Single lifecycle (start, stop, restart, crash recovery)
- One watchdog
- One log file
- No double-spawn overhead
- Easier dev iteration (one process to attach debugger to)

**Cons:**
- **GIL contention.** Python's GIL serializes Python-level work between threads. The render path is mostly NumPy/PyAV (releases GIL) but Python-level dispatching still contends. ML inference paths (torch / mlx) release the GIL during forward passes but spend Python time in pre/post-processing.
- **OS scheduling.** Both render-path and L-inference threads share OS priority. Long-tail latency (e.g., DINOv2 cold-load taking 3 seconds) blocks ZMQ render handling.
- **SG-4 violation risk.** SG-4 requires the audio render thread to NOT be starved by L work. In a single process, achieving that requires careful Python thread-priority configuration which is platform-specific and brittle.
- **Crash blast radius.** If `torch.load` segfaults loading a quantized DINOv2 weight on Apple silicon (a real possibility with bleeding-edge MLX), the entire Python process dies and rendering goes down with it.
- **Memory pressure recovery.** SG-8 disable order ends with "unload backbones, keep rendering." Hard to unload `torch` state from a running process without restarting; restarting the whole process means stopping rendering too.

### Option B — Separate Python process for L worker (CHOSEN)

- `python -m main` continues to host the rendering ZMQ server (unchanged)
- New `python -m q7_worker` hosts the L backbones behind a separate ZMQ REQ/REP socket on a different port
- Frontend opens a second ZMQ socket to the L worker port
- Independent lifecycle, independent watchdog, independent crash recovery
- Two Python processes ≠ two Electron sidecars (Electron sees both via the relay layer)

**Pros:**
- **Real OS-level isolation.** Separate process = separate scheduling, separate memory address space, separate GIL. The OS can pin them to different CPU cores. RT-priority audio rendering doesn't need to defend against ML inference scheduling.
- **SG-4 satisfied by construction.** Audio thread is in process A; L inference is in process B. No code path in process A imports L modules; lint rule in PR #10 enforces this mechanically.
- **Bounded crash blast radius.** L worker crash → renderer continues; UI surfaces a "L backbones unavailable" toast. SG-3 latent sentinel can route around dead heads. SG-8 memory-pressure unload can kill the L worker entirely.
- **Memory ownership clarity.** L worker owns model weights + inference state. SG-8 can deterministically free that memory (kill process; respawn lazy).
- **Decoupled rollout.** L worker can ship at a different cadence (new model versions, new backends) without restarting the render path.
- **Mirrors the existing pattern.** Electron already spawns one Python sidecar; spawning a second is the established mechanism (`backend/src/main.py` shows the entry-point pattern).

**Cons:**
- **Lifecycle complexity (×2).** Two ports, two health monitors, two crash recoveries, two shutdown sequences. Mitigated by reusing the existing `main.py` watchdog scaffolding for the L worker.
- **IPC marshalling overhead.** Embeddings (384 + 512 + 512 = ~5KB per encode) cross a ZMQ socket vs in-process function call (~50ns). Measured cost: ZMQ REQ/REP roundtrip on localhost ≈ 200-300μs. Negligible relative to 8-18ms encode times.
- **State coordination.** Frontend needs to know about TWO sidecars (latency monitoring, restart policies). Encapsulated in a `LBackboneClient` class in PR #9.
- **Develop-time friction.** Two processes to attach debuggers to. Mitigated by separate log files per process.

### Option C — Background thread in the same process (REJECTED)

Use `threading.Thread` to run L inference in the same process but off the main ZMQ handler thread. Same Python interpreter, same address space.

**Why rejected:** GIL contention is the same as Option A; the thread boundary doesn't help. Also, hangs in ML libraries can't be recovered without killing the whole process.

### Option D — asyncio + cooperative multitasking (REJECTED)

Run L inference via asyncio coroutines. The encode call yields control back to the event loop between operations.

**Why rejected:** ML libraries (torch.forward, mlx.core) are synchronous and block the event loop for the full forward pass duration. asyncio doesn't help when the underlying operation can't yield.

## Decision

**Option B — separate L worker process.** Spec-aligned (SPEC-5 §4), SG-4-aligned, future-proof, with the lifecycle-complexity cost paid up front.

### Process boundary

```
Electron renderer (frontend)
    │
    ├── ZMQ REQ socket → tcp://127.0.0.1:RENDER_PORT
    │    └── Python sidecar (backend/src/main.py)
    │         · existing render path (effects, video I/O, audio mux)
    │         · NO L backbone imports (enforced by SG-4 lint rule)
    │
    └── ZMQ REQ socket → tcp://127.0.0.1:L_WORKER_PORT
         └── Python L worker (backend/src/q7_worker/__main__.py — NEW in PR #9)
              · DINOv2, CLIP, CLAP backbones
              · sparse-encode dispatcher
              · SG-8 memory-pressure auto-unload
              · independent watchdog (1s heartbeat from frontend)
```

### Port allocation

- Render port: existing (auto-allocated by `main.py`; first free in range)
- L worker port: NEW, separately auto-allocated; range bumped to avoid collision (e.g., L worker uses ports 6000-6099 vs render's 5000-5099)
- Both ports communicated to Electron via stdout handshake (matches existing pattern)

### Lifecycle

- L worker spawned LAZILY on first L request (frontend → `LBackboneClient.encode(...)` triggers spawn if not running)
- L worker watchdog: 1s heartbeat from frontend; 3 missed → auto-restart
- Render sidecar lifecycle UNCHANGED
- Shutdown: Electron quits → SIGTERM to both processes (parallel)
- Crash: render sidecar crash → respawn (existing); L worker crash → respawn (new); neither affects the other

### Decoupling for testing

- `LBackboneClient` (PR #9) is the frontend's only entry to L work
- Backed by a real subprocess OR by an in-process stub for unit tests
- Integration tests (PR #5+) spin up real subprocess; unit tests use stub

### What lights up in PR #4

Just the decision + the proof-of-concept IPC shape (a stub `q7_worker/__main__.py` that accepts an `encode` command and replies via mock). The full L worker ships in PR #9 (Session 2, conditional on Q7 PASS).

## Cost analysis

- **PR #4 cost:** ~2 hours additional (stub worker entry-point + IPC shape + decision doc; harness wires through `LBackboneClient` interface)
- **PR #9 cost:** ~6-8 hours (real worker process, lifecycle, watchdog, frontend client)
- **Ongoing operations cost:** 2 processes vs 1. Watchdog code 2× (~150 LOC). Worth it for the isolation guarantee.
- **Migration-from-A cost (if we'd picked A):** ~12-16 hours later, because every callsite would have to be retrofitted with subprocess boundary. Better to pay now.

## Verification

After PR #4 + PR #9 merge:

```bash
# Both processes running
ps aux | grep -E "main\.py|q7_worker"
# Expected: two python processes, distinct PIDs

# Render path works without L worker (graceful degradation)
kill -9 <q7_worker PID>
# Expected: rendering continues; frontend toast "L backbones unavailable"; L worker auto-respawns

# L worker crash does not affect render path
# (verified by SG-3 / SG-4 contract tests in PR #10)
```

## Security considerations

- L worker accepts requests from same-host ZMQ only (matches render sidecar's token-auth pattern)
- Frontend → L worker IPC uses the same `_token` field as render sidecar
- L worker can be arbitrarily resource-bounded by Electron via `setpriority`, ulimits, or running under a different macOS sandbox profile (FUTURE; not v1)

## Cross-references

- SPEC-5 §4 — "separate process for OS-level RT-priority isolation" (this decision implements that)
- SG-4 (PR #10) — audio thread isolation contract; THIS decision is the precondition
- SG-8 (PR #11) — memory-pressure can kill the L worker as a degrade step
- PR #9 — L backbone worker skeleton (CONDITIONAL on Q7 PASS); implements this topology
- CTO R1 (this session) — "sidecar topology decision is highest-leverage open question"
- Memory: `[[entropic]]` — confirms existing single-sidecar pattern + ZMQ REQ/REP + token auth + 1s watchdog
