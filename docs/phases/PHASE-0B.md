# Phase 0B: Pipeline Validation

> Shared memory + frame transport + PyAV + JSON Schema + Effect Container.
> **Goal:** Prove the frame pipeline works at 30fps before building anything on it.
> **Sessions:** 2-3
> **Depends on:** Phase 0A (skeleton working)

---

## Acceptance Criteria

1. Python writes 1080p RGBA frames to shared memory at 30fps
2. Electron reads frames from shared memory via C++ native module and displays on canvas
3. Measured latency: <16ms round-trip (write → display)
4. PyAV can open, seek, and decode frames from an MP4 file
5. PyAV can encode frames to MP4 (H.264)
6. JSON Schema validates all IPC messages (both directions)
7. Effect Container base class works: mask → process → mix pipeline
8. Taxonomy registry exists: effects registered under `util.*`, `fx.*`, `mod.*`
9. One test effect (`fx.invert`) runs through the full pipeline: file → decode → effect → shared memory → display
10. Project file schema (`.glitch`) can be serialized and deserialized
11. All validation tests pass in CI

---

## Deliverables

### C++ Native Module (`frontend/native/`)

```
frontend/native/
├── binding.gyp
├── src/
│   └── shared_memory.cc      # ~200 lines
└── index.d.ts
```

**API:**
```typescript
// Exposed to Node.js via native module
interface SharedMemory {
  open(name: string): void;
  readLatestFrame(): Buffer;  // Returns MJPEG bytes
  getWriteIndex(): number;
  close(): void;
}
```

### Shared Memory Writer (Python)

```
backend/src/memory/
├── __init__.py
└── writer.py                  # mmap ring buffer write
```

### PyAV Integration

```
backend/src/video/
├── __init__.py
├── reader.py                  # Decode frames, seek
├── writer.py                  # Encode frames (export)
└── ingest.py                  # Header validation (fast) + deep probe (background)
```

### Effect Container

```
backend/src/engine/
├── __init__.py
├── container.py               # Mask → Process → Mix pipeline
├── determinism.py             # Seeded RNG: Hash(project_id + effect_id + frame_index + seed)
└── cache.py                   # MJPEG Q95 encoding for shared memory
```

### Taxonomy Registry

```
backend/src/effects/
├── __init__.py
├── registry.py                # { "fx.invert": { fn, params, name, category } }
└── fx/
    └── invert.py              # Simplest possible effect (test harness)
```

### JSON Schema

```
frontend/src/shared/
├── schemas/
│   ├── project.schema.json
│   ├── ipc-command.schema.json
│   └── ipc-response.schema.json
├── types.ts                   # TypeScript interfaces (generated from or matching schemas)
└── validate.ts                # Schema validation utility
```

---

## Validation Tests (The Gate)

These tests MUST pass before Phase 1 begins:

### V1: Shared Memory Throughput
```
Setup: Python writes random 1080p RGBA frames to mmap ring buffer
       Electron reads via C++ native module
Measure: FPS and latency over 300 frames (10 seconds)
Pass: ≥30fps sustained, <16ms per frame
Fail action: Investigate mmap setup. If unfixable, fallback to named pipes.
```

### V2: PyAV Scrub Test
```
Setup: Open a 4K H.264 MP4 (30 seconds)
       Seek to 100 random frame positions
Measure: Average decode time per seek
Pass: <50ms per random seek at 1080p, <100ms at 4K
Fail action: Profile PyAV decode. Check if keyframe distance is the bottleneck.
```

### V3: PyAV Write Test
```
Setup: Generate 300 synthetic frames (1080p, random gradients)
       Encode to H.264 MP4 via PyAV
Measure: Encoding time, output file validity (ffprobe)
Pass: File plays correctly in VLC/QuickTime
Fail action: Debug PyAV codec configuration.
```

### V4: Effect Container Pipeline
```
Setup: Load a frame via PyAV
       Run through EffectContainer with fx.invert effect
       With mask (checkerboard pattern)
       With mix=0.5
Verify: Output is 50% original + 50% inverted, only in masked regions
Pass: Pixel-level comparison matches expected output
```

### V5: ZMQ Command Latency Under Load
```
Setup: While shared memory streams frames at 30fps,
       Send 60 ZMQ commands/second (matching heartbeat spec)
Measure: Command round-trip time
Pass: 95th percentile <10ms
Fail action: Check if ZMQ and mmap are contending. May need separate threads.
```

### V6: Determinism Test
```
Setup: Run fx.invert on same frame with same seed twice
Verify: Outputs are byte-identical
Pass: np.array_equal(result1, result2) == True
```

### V7: Nuitka Build Test
```
Setup: Compile backend with Nuitka
       Run V1-V6 with the compiled binary instead of Python interpreter
Pass: All tests still pass. Binary size <200MB.
Fail action: Check Nuitka compatibility with pyzmq/numpy/pyav.
```

---

## Implementation Notes

### mmap on macOS
```python
import mmap
import os

RING_SIZE = 4
SLOT_SIZE = 4 * 1024 * 1024  # 4MB per slot
HEADER_SIZE = 64
TOTAL_SIZE = HEADER_SIZE + (RING_SIZE * SLOT_SIZE)

# Create file-backed mmap (macOS doesn't support shm_open easily from Python)
fd = os.open('/tmp/entropic-frames', os.O_RDWR | os.O_CREAT)
os.ftruncate(fd, TOTAL_SIZE)
buf = mmap.mmap(fd, TOTAL_SIZE)
```

**Note:** `/tmp/entropic-frames` is a file-backed mmap. On macOS, POSIX shared memory via `shm_open` requires C-level code, which our C++ native module handles. Python uses file-backed mmap as a simpler alternative. Both Python and C++ can open the same file.

### Canvas Display (Electron)
```typescript
// In renderer process
const canvas = document.getElementById('preview') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

function displayFrame(mjpegBytes: Buffer) {
  const blob = new Blob([mjpegBytes], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
```

---

## NOT in Phase 0B

- No UI beyond canvas + status indicator
- No timeline (Phase 4)
- No audio (Phase 2B)
- No parameter UI (Phase 2A)
- No upload flow (Phase 1)
- Only one test effect (fx.invert)
