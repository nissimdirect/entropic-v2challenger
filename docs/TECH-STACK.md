# Entropic v2 — Technology Stack

> Exact dependencies, versions, and rationale for every technology choice.
> Locked 2026-02-18.

---

## Frontend (Electron + React)

| Package | Version | Why |
|---------|---------|-----|
| `electron` | latest stable | Desktop shell. Full Chrome, DevTools, rich ecosystem. Required for DAW-complexity UI. |
| `react` | 19.x | Component model scales to DAW complexity. SSOT for state. |
| `react-dom` | 19.x | DOM rendering for React. |
| `typescript` | 5.x | Type safety across frontend codebase. Shared types with IPC. |
| `vite` | 6.x | Fast HMR, native ESM, TypeScript out of box. |
| `electron-vite` or `vite-plugin-electron` | latest | Bridges Vite + Electron (main/renderer/preload). |
| `zustand` | 5.x | Lightweight state management. No boilerplate. React SSOT for project state. |
| `zeromq` (zeromq.js) | 6.x | ZMQ bindings for Node.js. Commands channel to Python. |
| `electron-updater` | latest | Auto-update via GitHub Releases. Phase 11. |

### Why NOT Redux
Zustand is simpler, less boilerplate, and sufficient for this use case. Redux would add ceremony without benefit. State shape is known and stable (project, timeline, effects, undo).

### Why NOT Next.js / Remix
We're building a desktop app, not a web app. No routing, no SSR, no server components. Plain React + Vite is correct.

---

## Backend (Python Sidecar)

| Package | Version | Why |
|---------|---------|-----|
| `python` | 3.12+ | Latest stable. Required for Nuitka compatibility. |
| `pyzmq` | 26.x | ZMQ bindings for Python. Commands channel from Electron. |
| `numpy` | 2.x | Frame manipulation. Every effect uses NumPy arrays. |
| `pyav` | 13.x | Video I/O (decode + encode). Replaces both FFmpeg CLI and manual frame extraction. Single video library for everything. |
| `pillow` | 11.x | MJPEG encoding for RAM cache. Image format conversion. |
| `nuitka` | 2.x (build tool) | Compiles Python to native C code. From Phase 0 — not retrofitted. Produces single binary. |

### Why NOT OpenCV
NumPy is sufficient for pixel manipulation. OpenCV adds a large dependency for features we don't need (face detection, SLAM, etc.). Individual algorithms (Sobel, blur) are trivial in NumPy.

### Why NOT FFmpeg CLI
PyAV wraps FFmpeg's libav libraries directly. Same codecs, same quality, but:
- No subprocess spawning overhead
- Direct frame access (no temp files)
- Better error handling (exceptions vs exit codes)
- More performant for both reading and writing

### Why Nuitka over PyInstaller
- Compiles Python to C → native binary (faster runtime)
- Better support for C extension modules (NumPy, PyAV)
- User decided: "I don't mind a longer build if we have better support and better performance"
- "Won't we have even more to debug later if we try to retrofit?" → Start with Nuitka from Phase 0

---

## Native Module (C++)

| Component | Implementation | Why |
|-----------|---------------|-----|
| Shared memory | mmap ring buffer | Zero-copy frame transport between Python and Electron |
| Build system | node-gyp | Standard Node.js native addon build tool |
| Size | ~200 lines C++ | Minimal surface area. Just mmap read/write + ring buffer management. |
| Prebuild | prebuildify | Pre-compiled binaries for macOS ARM64 + x86_64 |

### The Ring Buffer
```
Python writes frame N to slot (N % RING_SIZE)
Electron reads from slot indicated by "latest frame" atomic counter
```
- RING_SIZE = 4 (default). Enough to absorb jitter without wasting memory.
- Each slot holds one MJPEG-compressed frame (~800KB at 1080p Q95)
- Total ring buffer memory: ~3.2MB (negligible)

---

## Audio

| Package | Version | Why |
|---------|---------|-----|
| `portaudio` | 19.x (via Python bindings) | Native desktop audio output. CoreAudio backend on macOS. |
| `pyav` (audio) | (same as video) | Audio decode from video files. PCM extraction for analysis + playback. |

### Why NOT Web Audio API
Electron has Web Audio but:
- We're a desktop app, not a web app
- PortAudio gives lower latency on macOS (CoreAudio direct)
- Audio-reactive sidechain needs PCM analysis in Python, not in the renderer

### Audio Library Research Needed (R1)
Before Phase 2B, evaluate:
- `sounddevice` (PortAudio wrapper, most popular)
- `miniaudio` (single-header C library, Python bindings exist)
- `pyaudio` (older PortAudio wrapper)

Selection criteria: macOS ARM64 support, latency, Nuitka compatibility.

---

## Dev Tools

| Tool | Purpose |
|------|---------|
| `vitest` | Frontend unit tests (fast, Vite-native) |
| `playwright` | E2E tests (Electron mode) |
| `pytest` | Python unit tests |
| `eslint` + `prettier` | Frontend linting + formatting |
| `ruff` | Python linting (fast, replaces flake8/black) |
| `git` | Version control |
| `github actions` | CI (build + test on macOS ARM64) |

---

## What We're NOT Using

| Technology | Why Not |
|-----------|---------|
| **GStreamer** | Too complex for desktop DAW. PyAV is simpler and sufficient. |
| **OpenCV** | Unnecessary dependency. NumPy covers our needs. |
| **FFmpeg CLI** | PyAV wraps the same libraries without subprocess overhead. |
| **Redux** | Too much boilerplate. Zustand is lighter and sufficient. |
| **Web Audio** | Desktop app needs native audio. PortAudio/CoreAudio is correct. |
| **PyInstaller** | Nuitka compiles to native C. Better performance, better bundling. |
| **SharedArrayBuffer** | Browser API. We need mmap for Node.js ↔ Python shared memory. |
| **Tauri** | Considered but Electron has larger ecosystem and React DevTools. Decision locked. |
| **Vue/Svelte** | React has the largest ecosystem for complex UI (DAW components, drag-drop, etc.). |
