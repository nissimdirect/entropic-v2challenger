# Entropic v2 — System Architecture

> Fresh specification. Informed by v2 Challenger spec + gap analysis Rev 5.
> All decisions locked 2026-02-18.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────┐
│                   ELECTRON SHELL                     │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  React App   │  │  Audio Out   │  │  Node.js  │ │
│  │  (TypeScript) │  │  (PortAudio) │  │  Native   │ │
│  │              │  │              │  │  Module    │ │
│  │  - UI State  │  │  - Decode    │  │  (C++ mmap)│ │
│  │  - Timeline  │  │  - Playback  │  │  ~200 LOC │ │
│  │  - Effects   │  │  - A/V Sync  │  │           │ │
│  │  - Undo/Redo │  │              │  │           │ │
│  └──────┬───────┘  └──────────────┘  └─────┬─────┘ │
│         │                                   │       │
│         │  ZMQ (commands, JSON)              │       │
│         │                                   │       │
│         │  Shared Memory (mmap, frames)     │       │
└─────────┼───────────────────────────────────┼───────┘
          │                                   │
          ▼                                   ▼
┌─────────────────────────────────────────────────────┐
│               PYTHON SIDECAR (Nuitka)                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  ZMQ Server  │  │  Effect      │  │  Video    │ │
│  │              │  │  Engine      │  │  I/O      │ │
│  │  - Commands  │  │              │  │  (PyAV)   │ │
│  │  - Heartbeat │  │  - Pure fns  │  │           │ │
│  │  - Export    │  │  - Container │  │  - Decode  │ │
│  │              │  │  - Seeded    │  │  - Encode  │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  Shared Mem  │  │  Signal      │                 │
│  │  Writer      │  │  Engine      │                 │
│  │              │  │              │                 │
│  │  - mmap ring │  │  - LFO       │                 │
│  │  - MJPEG Q95 │  │  - Envelope  │                 │
│  │  - Frame idx │  │  - Sidechain │                 │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

## 2. Foundational Principles

### 2.1 State Authority
**React is the single source of truth.** Python holds zero persistent state.

- Project state, effect chains, parameter values, timeline clips, undo history — all in React.
- If Python crashes, React spawns a new instance and flushes the full project state to it.
- Python rebuilds the render graph and resumes. No data loss.

### 2.2 Pure Function Effects
Every effect is a pure function:
```python
def apply(frame: np.ndarray, params: dict, state_in: dict | None) -> tuple[np.ndarray, dict | None]:
    """
    Args:
        frame: Input RGBA image as numpy array (H, W, 4), uint8
        params: Effect parameters (all values, already modulated)
        state_in: Previous frame state (for temporal effects), or None

    Returns:
        (output_frame, state_out): Processed frame + state to pass to next frame
    """
```

- No module-level globals. No class-level mutable state.
- Temporal effects (feedback, physics) use explicit `state_in`/`state_out`.
- Seeded determinism: `random_state = Hash(project_id + effect_id + frame_index + user_seed)`

### 2.3 Effect Container
Every effect instance follows the standard container flow:
```
Input Frame → [Masking Stage] → [Processing Stage] → [Mix/Blend Stage] → Output Frame
```

- **Masking:** Per-pixel wet/dry multiplier (mask image or generated mask)
- **Processing:** The pure function effect algorithm
- **Mix/Blend:** Dry/wet slider (0-100%)
- Built into the base `Effect` class. Every effect gets masking and mix for free.

### 2.4 Seeded Determinism
```python
seed = hash(f"{project_id}:{effect_id}:{frame_index}:{user_seed}")
rng = np.random.default_rng(seed)
```
Preview and export produce identical output. No effect can hold internal random state.

## 3. Communication Layers

### 3.1 ZMQ Command Channel
- **Direction:** Bidirectional (REQ/REP pattern)
- **Content:** JSON-encoded commands and responses
- **Uses:** PING/PONG heartbeat, effect apply, parameter updates, export, transport
- **Latency budget:** <5ms per command (generous — commands are small)

### 3.2 Shared Memory Frame Transport
- **Direction:** Python writes → Electron reads
- **Implementation:** mmap ring buffer via C++ native Node.js addon (~200 lines)
- **Content:** MJPEG-compressed frames at quality 95 (10x compression, imperceptible loss)
- **Latency:** ~0.1ms (zero-copy)
- **Ring buffer:** N slots (configurable, default 4). Python writes to next slot, Electron reads current.

### 3.3 Why Two Channels
- ZMQ for commands: reliable, ordered, small messages, easy to debug
- Shared memory for frames: zero-copy, no serialization overhead, mandatory for real-time video
- Mixing them would either slow down frames (ZMQ serialization of 8MB RGBA) or complicate command ordering

## 4. Clock Architecture (Decoupled)

```
Electron (Master Clock)
  │
  ├── Audio playback position (PortAudio callback, sample-accurate)
  │
  └── Sends current_time to Python via ZMQ at 60Hz
        │
        Python (Slave Clock)
          │
          └── Renders frame nearest to current_time
              Writes to shared memory
```

- Audio never waits for video. Audio is always correct.
- Video catches up when it can. If it can't keep up: frame drop (hold previous frame).
- Green Bar (RAM cache): pre-render a range to shared memory. Playback reads from cache = guaranteed smooth.

## 5. Watchdog Protocol

1. Electron sends `PING` every 1000ms via ZMQ
2. Python responds `PONG` with status: `{ status: "alive" | "busy", uptime_s, last_frame_ms }`
3. If Electron misses 3 consecutive PONGs:
   - Kill Python process
   - Show toast: "Engine restarting..."
   - Spawn new Python process
   - Flush full project state to new instance
   - Resume rendering

## 6. Resource Management

### 6.1 RAM Budget (16GB cap)
| Component | Budget | Notes |
|-----------|--------|-------|
| Electron + React | ~500MB | Standard Electron overhead |
| Frame cache (MJPEG Q95) | 4-10GB | ~2,000 frames at 1080p |
| Python process | 1-4GB | Effects processing, PyAV buffers |
| Undo history | 50MB RAM + disk overflow | 500 steps in RAM, rest on disk |
| OS + other apps | 2-4GB | Leave room |

### 6.2 Dynamic Resolution Scaling
- **During playback:** If frame render exceeds 33ms, drop to next tier (75% → 50% → 25%)
- **When stopped:** Render full resolution, allow up to 10-second wait
- **User never sees degraded frame when canvas is static** — only during real-time playback

### 6.3 Auto-Freeze (Hardening)
When RAM usage approaches cap:
1. Toast warning: "Memory high — consider freezing effects"
2. If idle for N seconds (threshold TBD): auto-freeze the longest static prefix chain
3. Frozen frames cached to disk, freeing RAM

## 7. Undo Architecture

### 7.1 Two Systems
| What | Method | Storage |
|------|--------|---------|
| Timeline operations (move, split, delete clips) | Command pattern (action + inverse) | RAM (50KB each) |
| Parameter changes (knob tweaks) | State diff (old value → new value) | RAM (bytes each) |
| Freeze undo | Separate disk buffer | Disk (always) |

### 7.2 History Panel
- Photoshop-style vertical list showing all operations
- Click any entry to jump to that state
- **Linear branching:** Jump back + make change = cut forward history (no tree)

### 7.3 Caps
- 500 steps in RAM (configurable to 2000)
- 50MB RAM safety cap
- When cap hit: overflow oldest entries to disk + toast notification
- Critical actions (delete track, clear all) are never pruned

## 8. Audio Pipeline

### 8.1 Playback Path
```
PyAV decode audio → PCM buffer → PortAudio → System audio output
```
- NOT Web Audio. Native desktop audio.
- Dedicated audio sprint (Phase 2B)

### 8.2 Audio-Reactive Sidechain (Phase 6)
```
PyAV decode audio → PCM analysis (amplitude, frequency bands, onset detection)
                  → Signal extraction → 0.0-1.0 control signal
                  → Modulation routing → Effect parameters
```
- Analysis happens in Python, not frontend
- Signal extraction runs on the same audio decode pipeline as playback
- Core functionality, not deferred

## 9. Taxonomy

Three categories + Performance Track:

| Category | Namespace | Purpose | Examples |
|----------|-----------|---------|---------|
| **Tools** | `util.*` | Non-destructive utilities, color correction, compositing | levels, curves, hsl_adjust, chroma_key, blur |
| **Effects** | `fx.*` | Destructive/generative pixel processing | pixelsort, datamosh, vhs, noise, wave_distort |
| **Operators** | `mod.*` / `op.*` | Control signals, logic, modulation (no pixel output) | lfo, envelope, sidechain, gate, math, fusion |
| **Performance Track** | (track type) | Dedicated timeline track for triggers/MIDI | keyboard input, MIDI, choke groups, retro-capture |

## 10. Signal Architecture (4 Layers)

```
Source → Extraction → Processing → Routing
```

### Layer 1: Sources (7 types)
Video luminance, video motion, video color channel, video edge density, audio amplitude, audio frequency band, MIDI/performance gate

### Layer 2: Extraction
Luminance average, frame difference (motion), color histogram, edge detection (Sobel), audio RMS, FFT band energy

### Layer 3: Processing
Threshold, ADSR envelope, smoothing (slew limiter), quantize, invert, scale/offset

### Layer 4: Routing
One-to-many (one signal → multiple params), many-to-one (blend multiple signals), DAG enforcement (no cycles)

### Signal Order (v2 Lock 5)
```
Base Value → Modulation → Automation → Clamp (to valid range)
```
Stacking allowed: Modulation does NOT disable Automation. Ghost Handle shows actual value after full stack.

## 11. Build & Distribution

| Component | Tool | Notes |
|-----------|------|-------|
| Frontend bundler | Vite | Fast HMR, TypeScript, React |
| Python compiler | Nuitka | Compiles to native C. From Phase 0, not retrofitted. |
| Desktop shell | Electron | Full Chrome, DevTools, multi-window capable |
| Native module | node-gyp | C++ mmap shared memory addon |
| Auto-update | electron-updater | GitHub Releases |
| Distribution | PWYW + open source | No license system |
