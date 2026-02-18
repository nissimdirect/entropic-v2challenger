# Entropic v2 — Project File Structure

> Clean-room directory layout. No patterns carried from v0.7.

---

```
entropic-v2challenger/
│
├── docs/                          # You are here
│   ├── ARCHITECTURE.md
│   ├── TECH-STACK.md
│   ├── FILE-STRUCTURE.md
│   ├── IPC-PROTOCOL.md
│   ├── EFFECT-CONTRACT.md
│   ├── DATA-SCHEMAS.md
│   ├── SIGNAL-ARCHITECTURE.md
│   └── phases/
│       ├── PHASE-0A.md
│       ├── PHASE-0B.md
│       ├── PHASE-1.md
│       └── ...
│
├── frontend/                      # Electron + React app
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── electron.vite.config.ts
│   │
│   ├── src/
│   │   ├── main/                  # Electron main process
│   │   │   ├── index.ts           # App entry, window creation
│   │   │   ├── python.ts          # Spawn + manage Python sidecar
│   │   │   ├── watchdog.ts        # PING/PONG, 3-miss restart
│   │   │   ├── zmq.ts             # ZMQ client (commands to Python)
│   │   │   └── shared-memory.ts   # Native module interface (mmap read)
│   │   │
│   │   ├── preload/               # Electron preload scripts
│   │   │   └── index.ts           # Expose IPC to renderer (contextBridge)
│   │   │
│   │   ├── renderer/              # React app (the UI)
│   │   │   ├── App.tsx            # Root component
│   │   │   ├── index.html
│   │   │   ├── index.tsx          # React entry
│   │   │   │
│   │   │   ├── stores/            # Zustand state stores
│   │   │   │   ├── project.ts     # Project state (SSOT)
│   │   │   │   ├── timeline.ts    # Timeline, tracks, clips
│   │   │   │   ├── effects.ts     # Effect chain, parameters
│   │   │   │   ├── undo.ts        # Undo/redo history
│   │   │   │   ├── ui.ts          # UI state (panels, selection)
│   │   │   │   └── engine.ts      # Python connection status, metrics
│   │   │   │
│   │   │   ├── components/        # React components
│   │   │   │   ├── layout/        # Top bar, panels, splitters
│   │   │   │   ├── timeline/      # Timeline, tracks, clips, playhead
│   │   │   │   ├── effects/       # Effect rack, browser, knobs
│   │   │   │   ├── preview/       # Canvas, frame display
│   │   │   │   ├── transport/     # Play/pause/seek, meters
│   │   │   │   └── common/        # Shared: buttons, sliders, toasts
│   │   │   │
│   │   │   ├── hooks/             # Custom React hooks
│   │   │   │   ├── useEngine.ts   # Python connection, frame display
│   │   │   │   ├── useUndo.ts     # Undo/redo integration
│   │   │   │   └── useKeyboard.ts # Global keyboard shortcuts
│   │   │   │
│   │   │   └── styles/            # CSS
│   │   │       ├── global.css     # Dark theme (#1a1a1a base)
│   │   │       ├── fonts.css      # JetBrains Mono + Inter
│   │   │       └── variables.css  # Design tokens
│   │   │
│   │   └── shared/                # Types shared between main/renderer
│   │       ├── types.ts           # Project, Track, Clip, Effect interfaces
│   │       ├── ipc-types.ts       # ZMQ message types
│   │       └── constants.ts       # Effect IDs, category prefixes
│   │
│   ├── native/                    # C++ native module (shared memory)
│   │   ├── binding.gyp            # node-gyp build config
│   │   ├── src/
│   │   │   └── shared_memory.cc   # mmap ring buffer read (~200 LOC)
│   │   └── index.d.ts             # TypeScript declarations
│   │
│   └── tests/
│       ├── unit/                  # Vitest unit tests
│       └── e2e/                   # Playwright E2E tests
│
├── backend/                       # Python sidecar
│   ├── pyproject.toml             # Python project config (PEP 621)
│   ├── nuitka.config              # Nuitka compilation settings
│   │
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py                # Entry point: ZMQ server loop
│   │   ├── zmq_server.py          # ZMQ REP socket, command dispatch
│   │   ├── watchdog.py            # PONG response, health metrics
│   │   │
│   │   ├── engine/                # Core render engine
│   │   │   ├── __init__.py
│   │   │   ├── pipeline.py        # Frame pipeline: ingest → effects → output
│   │   │   ├── container.py       # Effect Container (mask → process → mix)
│   │   │   ├── determinism.py     # Seeded RNG utilities
│   │   │   └── cache.py           # MJPEG RAM cache write
│   │   │
│   │   ├── effects/               # Pure function effects
│   │   │   ├── __init__.py
│   │   │   ├── registry.py        # Effect registry (name → function mapping)
│   │   │   ├── util/              # util.* (Tools)
│   │   │   │   ├── levels.py
│   │   │   │   ├── curves.py
│   │   │   │   └── ...
│   │   │   ├── fx/                # fx.* (Effects)
│   │   │   │   ├── pixelsort.py
│   │   │   │   ├── datamosh.py
│   │   │   │   └── ...
│   │   │   └── mod/               # mod.* (Operators)
│   │   │       ├── lfo.py
│   │   │       ├── envelope.py
│   │   │       └── ...
│   │   │
│   │   ├── video/                 # Video I/O (PyAV)
│   │   │   ├── __init__.py
│   │   │   ├── reader.py          # Decode frames, seek
│   │   │   ├── writer.py          # Encode frames, export
│   │   │   ├── audio.py           # Audio decode, PCM extraction
│   │   │   └── ingest.py          # Two-stage validation (header + deep probe)
│   │   │
│   │   ├── signal/                # Signal/modulation engine
│   │   │   ├── __init__.py
│   │   │   ├── engine.py          # Signal evaluation per frame
│   │   │   ├── sources.py         # Signal sources (luma, motion, audio, MIDI)
│   │   │   ├── processors.py      # Threshold, ADSR, smooth, quantize
│   │   │   ├── routing.py         # DAG routing, cycle detection
│   │   │   └── fusion.py          # Cross-modal signal combination
│   │   │
│   │   ├── memory/                # Shared memory interface
│   │   │   ├── __init__.py
│   │   │   └── writer.py          # mmap ring buffer write (Python side)
│   │   │
│   │   └── safety/                # Input validation, resource guards
│   │       ├── __init__.py
│   │       ├── validation.py      # Parameter validation, type checking
│   │       └── resources.py       # RAM monitoring, threshold alerts
│   │
│   └── tests/
│       ├── test_effects/          # Per-effect unit tests
│       ├── test_engine/           # Pipeline tests
│       ├── test_signal/           # Signal routing tests
│       ├── test_video/            # PyAV integration tests
│       └── conftest.py            # Shared fixtures
│
└── .github/
    └── workflows/
        └── ci.yml                 # Build + test on macOS ARM64
```

## Key Design Decisions in Structure

1. **`frontend/` and `backend/` are siblings** — neither contains the other. Clean separation.
2. **`frontend/src/main/`** is Electron's main process (Node.js). It spawns Python and manages ZMQ.
3. **`frontend/src/renderer/`** is the React app. It never touches Python directly.
4. **`frontend/native/`** is the C++ mmap module. Built by node-gyp during `npm install`.
5. **`backend/src/effects/`** mirrors the taxonomy: `util/`, `fx/`, `mod/`.
6. **`backend/src/signal/`** is separate from effects — operators generate control signals, effects process pixels.
7. **No `core/` mega-directory.** Responsibilities are split into focused modules.
8. **Shared types in `frontend/src/shared/`** — TypeScript interfaces that match Python's JSON schemas.
