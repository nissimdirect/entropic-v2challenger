---
title: Phase 2B — Audio Sprint (PyAV Decode → Audio Playback → Decoupled A/V Clock)
status: completed
project: entropic-v2challenger
depends_on: Phase 1 (video playback working — preview canvas, scrub bar, play/pause)
sessions: 3
created: 2026-02-22
---

# Phase 2B: Audio Sprint — Implementation Plan

## Context

Phase 1 delivers silent video playback — a user can load a clip, apply effects, scrub, and export. But videos have audio, and audio is the timing backbone of any creative app. Phase 2B adds audio decode (PyAV), audio playback (native module), and a decoupled A/V clock where audio is the master and video is the slave. This is the foundation for audio-reactive modulation in Phase 6.

**Goal:** Load a video with audio → audio plays through speakers in sync with video (within ±1 frame / 33ms). Scrub/seek → audio follows. Pause → audio stops. Volume control works.

**Why audio-as-master:** Human perception is more sensitive to audio glitches than video dropped frames. If the system is under load, dropping a video frame is imperceptible; stuttering audio is intolerable. The audio callback runs on a real-time thread and never waits for video.

---

## What Already Exists

### Backend (`backend/src/`)
- `video/reader.py` — `VideoReader.decode_frame(index)` → RGBA ndarray (video only, no audio decode)
- `video/ingest.py` — `probe(path)` → returns metadata including `has_audio: bool`
- `zmq_server.py` — REP socket with command handlers (no audio commands yet)
- PyAV is already a dependency (used for video decode/encode)

### Frontend (`frontend/src/`)
- `renderer/components/preview/PreviewCanvas.tsx` — canvas element for video display
- `renderer/components/preview/PreviewControls.tsx` — scrub bar, play/pause, frame counter
- `main/watchdog.ts` — ZMQ heartbeat (can be extended for audio status)
- `preload/index.ts` — contextBridge (needs audio API exposure)
- `shared/ipc-types.ts` — already defines `audio_decode` and `audio_analyze` command shapes

### Native Module (`frontend/native/`)
- `src/shared_memory.cc` — C++ native module for mmap frame reading (from Phase 0B)
- `binding.gyp` — node-gyp build config (can be extended for audio)
- `index.d.ts` — TypeScript declarations

### Key Gaps
- No audio decode in Python (PyAV only decodes video frames currently)
- No audio playback in Electron (no PortAudio/miniaudio binding)
- No A/V clock synchronization
- No waveform display
- No volume/mute controls

---

## Research: Audio Library Selection

### Comparison: PortAudio vs miniaudio vs SDL_audio

| Criterion | PortAudio | miniaudio | SDL_audio |
|-----------|-----------|-----------|-----------|
| **Build complexity** | Requires system lib install | Single header file, zero deps | Requires SDL2 framework |
| **Node.js bindings** | `naudiodon` (N-API, mature) | `@thesusheer/node-miniaudio` (newer, simpler) | No maintained bindings |
| **Electron compat** | Proven (naudiodon + Electron) | Proven (node-miniaudio for Electron) | Would need custom addon |
| **Latency** | 64-256 samples (configurable) | 64-256 samples (configurable) | Higher (SDL abstraction) |
| **Device enumeration** | Full API | Full API | Limited |
| **Callback model** | C callback on RT thread | C callback on RT thread | SDL event pump |
| **Platform support** | macOS/Win/Linux | macOS/Win/Linux/iOS/Android | macOS/Win/Linux |
| **Raw PCM streaming** | Yes (WritableStream via naudiodon) | Yes (buffer push) | Yes |
| **License** | MIT | Public domain (Unlicense) | zlib |
| **Custom C++ addon** | Well-documented C API | Single file include | Overkill |

### Decision: miniaudio (custom C++ native addon)

**Rationale:**
1. **Zero dependencies** — single `miniaudio.h` include, no system library install needed. This eliminates the "install PortAudio via brew/apt" step that breaks CI and new-dev onboarding.
2. **Already have a C++ native module** — `frontend/native/src/shared_memory.cc` exists with `binding.gyp`. Adding `audio.cc` alongside it is trivial.
3. **Public domain license** — no attribution requirements.
4. **Buffer-push model** fits our architecture — Python decodes PCM, writes to file, Electron reads file and pushes buffers to miniaudio. No streaming socket needed.
5. **naudiodon** (PortAudio) is mature but adds a heavy system dependency. For our use case (playback only, no recording), miniaudio is lighter.

**Risk mitigation:** If miniaudio causes issues on a specific platform, the abstraction layer (`AudioEngine` interface in `audio.cc`) makes swapping to PortAudio straightforward — same buffer-push API, different backend.

### PyAV Audio Decode Strategy

PyAV can decode audio streams via `container.decode(audio=0)`, yielding `AudioFrame` objects. Each frame contains PCM samples. We resample to a standard format using `AudioResampler`:

```python
resampler = av.AudioResampler(
    format='flt',         # float32
    layout='stereo',      # 2 channels
    rate=48000,           # standard sample rate
)
for frame in container.decode(audio=0):
    resampled = resampler.resample(frame)
    for rf in resampled:
        pcm = rf.to_ndarray()  # shape: (channels, samples), dtype float32
```

**PCM transport:** PCM data is too large for ZMQ JSON messages. Python writes the decoded PCM to a binary file (`{project_dir}/.cache/audio_{asset_id}.pcm`), responds with the file path. Electron's native module reads the file via `mmap` for zero-copy access.

### A/V Sync Strategy

Based on Ross Bencina's PortAudio synchronization paper and standard media player architecture:

1. **Audio is master clock** — the audio callback runs on a real-time OS thread at the audio device's hardware sample rate. It never waits.
2. **Video is slave** — a 60Hz `requestAnimationFrame` loop queries the audio clock position and renders the nearest video frame.
3. **Drift correction** — audio position is reported as `samples_played / sample_rate` (absolute time). Video computes `target_frame = floor(audio_time * fps)`. If video falls behind (rendering too slow), it skips frames. Audio never skips.
4. **Seek** — on seek: (a) pause audio callback, (b) set new audio position, (c) flush video frame cache, (d) resume audio callback. Video follows automatically.
5. **Pause** — on pause: stop feeding audio callback (it outputs silence). Video stops requesting new frames. Audio position frozen.

---

## Plan (3 Sessions)

### Session 1: Backend Audio Decode + IPC
> Python decodes audio from video files. No playback yet.

- [ ] **1.1** Create `backend/src/video/audio.py`
  ```python
  def decode_audio(asset_path: str) -> dict:
      """
      Decode full audio track from video file to PCM float32.
      Returns: {
          'pcm_path': str,       # Path to written .pcm binary file
          'sample_rate': int,    # Always resampled to 48000
          'channels': int,       # Always resampled to 2 (stereo)
          'duration': float,     # Seconds
          'total_samples': int,  # Per channel
      }
      """
  ```
  - Open container via `av.open(asset_path)`
  - Check `container.streams.audio` exists, raise `ValueError("No audio stream")` if not
  - Create `AudioResampler(format='flt', layout='stereo', rate=48000)`
  - Decode all audio frames, resample, concatenate into single `np.ndarray` shape `(2, total_samples)` dtype `float32`
  - Write interleaved PCM to `{asset_dir}/.cache/audio_{hash}.pcm` as raw binary
  - Return metadata dict

- [ ] **1.2** Create `backend/src/video/waveform.py`
  ```python
  def compute_waveform(pcm_path: str, sample_rate: int, channels: int,
                       total_samples: int, bins: int = 1000) -> dict:
      """
      Downsample PCM to a waveform overview for display.
      Returns: {
          'peaks': list[float],   # Max absolute amplitude per bin (0.0-1.0)
          'rms': list[float],     # RMS amplitude per bin (0.0-1.0)
          'bins': int,
      }
      """
  ```
  - Memory-map the PCM file (read-only)
  - Divide total_samples into `bins` equal chunks
  - For each chunk: compute max abs value (peak) and RMS
  - Return as lists (JSON-serializable)

- [ ] **1.3** Add ZMQ commands in `backend/src/zmq_server.py`:
  - `audio_decode` — `{cmd: "audio_decode", id, path}` → calls `decode_audio()` → returns metadata
  - `audio_waveform` — `{cmd: "audio_waveform", id, pcm_path, sample_rate, channels, total_samples, bins}` → calls `compute_waveform()` → returns peaks/rms
  - Error handling: no audio stream → `{ok: false, error: "No audio stream in file"}`

- [ ] **1.4** Update `frontend/src/shared/ipc-types.ts` — add response types:
  ```typescript
  export interface AudioDecodeResponse {
    id: string;
    ok: true;
    pcm_path: string;
    sample_rate: number;
    channels: number;
    duration: number;
    total_samples: number;
  }

  export interface AudioWaveformResponse {
    id: string;
    ok: true;
    peaks: number[];
    rms: number[];
    bins: number;
  }
  ```

- [ ] **1.5** Tests (backend pytest):
  - `backend/tests/test_video/test_audio.py`
    - Decode audio from test MP4 → verify sample_rate=48000, channels=2
    - PCM file exists and has correct size (total_samples * channels * 4 bytes)
    - Duration matches video duration (within 0.1s)
    - No audio stream → raises ValueError
    - Corrupted file → raises appropriate error
  - `backend/tests/test_video/test_waveform.py`
    - Waveform bins count matches requested bins
    - All peak values in [0.0, 1.0]
    - All-silence PCM → all peaks near 0.0
    - Single-channel source → still outputs stereo PCM

### Session 2: Native Audio Module + A/V Clock
> Build the C++ miniaudio addon and the TypeScript A/V clock.

- [ ] **2.1** Add `miniaudio.h` to `frontend/native/vendor/miniaudio.h`
  - Download from https://raw.githubusercontent.com/mackron/miniaudio/master/miniaudio.h
  - Single header, ~900KB, public domain

- [ ] **2.2** Create `frontend/native/src/audio.cc` (~200 LOC)
  - N-API native addon using `node-addon-api`
  - Functions exposed to Node.js:
    ```cpp
    // Initialize miniaudio device for playback
    Napi::Value Init(const Napi::CallbackInfo& info);
    // args: sampleRate (int), channels (int), bufferSizeFrames (int)

    // Load PCM data from file path (mmap for zero-copy)
    Napi::Value LoadPCM(const Napi::CallbackInfo& info);
    // args: filePath (string), totalSamples (int), channels (int)

    // Start/resume playback from current position
    Napi::Value Play(const Napi::CallbackInfo& info);

    // Pause playback (output silence, freeze position)
    Napi::Value Pause(const Napi::CallbackInfo& info);

    // Seek to sample offset
    Napi::Value Seek(const Napi::CallbackInfo& info);
    // args: sampleOffset (int)

    // Set volume (0.0 - 1.0)
    Napi::Value SetVolume(const Napi::CallbackInfo& info);

    // Get current playback position in samples
    Napi::Value GetPosition(const Napi::CallbackInfo& info);

    // List available audio output devices
    Napi::Value ListDevices(const Napi::CallbackInfo& info);

    // Select output device by index
    Napi::Value SetDevice(const Napi::CallbackInfo& info);

    // Cleanup
    Napi::Value Close(const Napi::CallbackInfo& info);
    ```
  - **Audio callback** (`ma_device_data_callback`):
    - Runs on miniaudio's real-time thread
    - Copies PCM samples from mmap buffer to output buffer
    - Applies volume scaling
    - Atomically updates playback position counter
    - If paused: fills output with zeros (silence)
    - If past end of PCM: fills with zeros, sets `isFinished` flag

- [ ] **2.3** Update `frontend/native/binding.gyp` — add `audio.cc` to sources, add `vendor/` to include paths

- [ ] **2.4** Update `frontend/native/index.d.ts` — add audio API types:
  ```typescript
  export interface AudioDevice {
    index: number;
    name: string;
    isDefault: boolean;
  }

  export function audioInit(sampleRate: number, channels: number, bufferSize: number): void;
  export function audioLoadPCM(filePath: string, totalSamples: number, channels: number): void;
  export function audioPlay(): void;
  export function audioPause(): void;
  export function audioSeek(sampleOffset: number): void;
  export function audioSetVolume(volume: number): void;
  export function audioGetPosition(): number;
  export function audioListDevices(): AudioDevice[];
  export function audioSetDevice(deviceIndex: number): void;
  export function audioClose(): void;
  ```

- [ ] **2.5** Create `frontend/src/main/clock.ts` — the A/V clock:
  ```typescript
  export class AVClock {
    private sampleRate: number = 48000;
    private fps: number = 30;
    private isPlaying: boolean = false;

    // Get current audio time in seconds
    getAudioTime(): number {
      const samples = nativeModule.audioGetPosition();
      return samples / this.sampleRate;
    }

    // Get the video frame index that should be displayed now
    getTargetFrameIndex(): number {
      return Math.floor(this.getAudioTime() * this.fps);
    }

    // Start playback
    play(): void { ... }

    // Pause playback
    pause(): void { ... }

    // Seek to time in seconds
    seek(timeSeconds: number): void {
      const sampleOffset = Math.floor(timeSeconds * this.sampleRate);
      nativeModule.audioSeek(sampleOffset);
      // Emit seek event so video updates immediately
    }

    // Set video FPS (from asset metadata)
    setFPS(fps: number): void { ... }
  }
  ```

- [ ] **2.6** Extend contextBridge (`frontend/src/preload/index.ts`) — add audio APIs:
  - `audioInit(sampleRate, channels, bufferSize)` → IPC to main → native module
  - `audioLoadPCM(pcmPath, totalSamples, channels)` → IPC to main → native module
  - `audioPlay()`, `audioPause()`, `audioSeek(offset)`, `audioSetVolume(vol)`
  - `audioGetPosition()` → returns current sample position
  - `audioListDevices()`, `audioSetDevice(idx)`
  - `onAudioClock(callback)` — receives clock tick events from main process (60Hz)

- [ ] **2.7** Tests:
  - `frontend/src/__tests__/clock.test.ts` (vitest, mocked native module)
    - `getTargetFrameIndex()` returns correct frame for given audio position
    - Seek updates audio position and emits event
    - Play/pause toggle works
    - FPS change recalculates frame index correctly

### Session 3: Frontend UI + Integration
> Waveform display, volume controls, wire up A/V sync loop.

- [x] **3.1** Create Zustand audio store `frontend/src/renderer/stores/audio.ts` (done in Sprint 2B-5)
  ```typescript
  interface AudioState {
    isLoaded: boolean;
    isPlaying: boolean;
    isMuted: boolean;
    volume: number;          // 0.0 - 1.0
    duration: number;        // seconds
    currentTime: number;     // seconds (updated at 60Hz from clock)
    sampleRate: number;
    devices: AudioDevice[];
    selectedDevice: number;
    waveformPeaks: number[];
    waveformRMS: number[];
    // Actions
    loadAudio: (assetPath: string) => Promise<void>;
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setVolume: (volume: number) => void;
    toggleMute: () => void;
    selectDevice: (index: number) => void;
  }
  ```

- [x] **3.2** Create `frontend/src/renderer/components/transport/Waveform.tsx`
  - Canvas-based waveform overview (peaks as filled bars, RMS as inner bars)
  - Receives `peaks: number[]` and `rms: number[]` from audio store
  - Playhead position indicator (vertical line, synced to `currentTime`)
  - Click on waveform → seek to that position
  - Drag on waveform → scrub audio position
  - Color: peaks in `#4a5568` (gray), RMS in `#667eea` (blue-ish), playhead in `#4ade80` (green)

- [x] **3.3** Create `frontend/src/renderer/components/transport/useWaveform.ts`
  - Hook that downsamples waveform data to canvas width
  - Handles canvas resize (recalculate bins)
  - Memoized to avoid re-renders

- [x] **3.4** Create `frontend/src/renderer/components/transport/VolumeControl.tsx`
  - Horizontal slider (0-100%)
  - Mute button (speaker icon, toggles)
  - Visual: speaker icon changes based on volume level (muted/low/med/high)

- [ ] **3.5** Create `frontend/src/renderer/components/transport/DeviceSelector.tsx` (DEFERRED — uses system default device)

- [x] **3.6** Update `PreviewControls.tsx` — integrate A/V clock:
  - Play/pause button now controls both audio and video
  - Scrub bar position driven by audio clock (not video frame counter)
  - Frame counter shows `audioTime * fps` rounded
  - Add Waveform below the scrub bar
  - Add VolumeControl to the right of transport controls

- [x] **3.7** Wire the A/V sync loop in App.tsx (clock sync rAF loop drives setCurrentFrame from audio position):
  - Current: `requestAnimationFrame` polls mmap for latest frame
  - New: `requestAnimationFrame` → query `AVClock.getTargetFrameIndex()` → if different from last rendered frame → `sendCommand({cmd: "render_frame", time: audioTime, ...})` → Python renders → mmap → canvas
  - If video can't keep up: hold previous frame (audio never stutters)
  - If paused: render only on seek (not continuously)

- [x] **3.8** Handle edge cases:
  - Video with no audio → disable audio controls, use internal timer as clock fallback
  - Audio shorter than video → silence after audio ends, video continues with timer fallback
  - Audio longer than video → stop at video end

- [x] **3.9** CSS: `frontend/src/renderer/styles/transport.css`
  - Waveform canvas sizing and colors
  - Volume slider styling
  - Device selector dropdown

- [x] **3.10** Tests (frontend vitest): 202 tests passing (29 new)
  - `frontend/src/__tests__/stores/audio.test.ts`
    - loadAudio sets isLoaded, duration, sampleRate
    - play/pause toggles isPlaying
    - setVolume clamps to 0.0-1.0
    - toggleMute preserves volume value
  - `frontend/src/__tests__/components/transport/waveform.test.ts`
    - Renders canvas with correct width
    - Click on canvas triggers seek to proportional time
    - Empty peaks array renders without error
  - `frontend/src/__tests__/components/transport/volume.test.ts`
    - Slider updates volume store
    - Mute button toggles muted state

---

## Test Plan

### What to test
- [ ] Load video with audio → audio decodes to PCM, waveform displays
- [ ] Play → audio plays through speakers, video follows in sync
- [ ] Pause → audio stops immediately (no tail), video freezes
- [ ] Seek → both audio and video jump to new position
- [ ] Volume slider → audio gets louder/quieter
- [ ] Mute → audio goes silent, unmute restores
- [ ] A/V sync maintained for 60+ seconds of playback (within ±33ms)
- [ ] Video with no audio → plays silently, no crash, audio controls disabled

### Edge cases
- [ ] Video with audio at different sample rate (44100) → resampled to 48000 correctly
- [ ] Very short video (1 second) → audio plays and stops cleanly
- [ ] Seek to exact end of video → no crash, audio position at max
- [ ] Rapid seek (scrub quickly back and forth) → no audio glitches or crashes
- [ ] Audio device disconnected during playback → graceful error, not crash
- [ ] Large video (1GB+) → audio decode doesn't OOM (streams, doesn't load all at once)
- [ ] Mono audio source → plays through both speakers (stereo upmix)
- [ ] 5.1 surround audio → downmixed to stereo

### How to verify
- Backend: `cd backend && python -m pytest tests/test_video/ -x --tb=short`
- Frontend: `cd frontend && npx vitest run`
- Native module: `cd frontend && npm run build:native && node -e "const m = require('./native'); console.log(m.audioListDevices())"`
- Manual A/V sync: Play a video with a visible clap/sync marker → audio and video clap should align
- Expected new test count: ~35 (10 backend audio + 5 clock + 10 store + 10 component)

---

## Files to Create

### Backend
```
backend/src/video/audio.py
backend/src/video/waveform.py
backend/tests/test_video/test_audio.py
backend/tests/test_video/test_waveform.py
```

### Frontend (Native)
```
frontend/native/vendor/miniaudio.h
frontend/native/src/audio.cc
```

### Frontend (TypeScript)
```
frontend/src/main/clock.ts
frontend/src/renderer/stores/audio.ts
frontend/src/renderer/components/transport/Waveform.tsx
frontend/src/renderer/components/transport/useWaveform.ts
frontend/src/renderer/components/transport/VolumeControl.tsx
frontend/src/renderer/components/transport/DeviceSelector.tsx
frontend/src/renderer/styles/transport.css
frontend/src/__tests__/clock.test.ts
frontend/src/__tests__/stores/audio.test.ts
frontend/src/__tests__/components/transport/waveform.test.ts
frontend/src/__tests__/components/transport/volume.test.ts
```

## Files to Modify

```
frontend/native/binding.gyp                            — Add audio.cc, vendor/ include
frontend/native/index.d.ts                             — Add audio API types
frontend/src/preload/index.ts                          — Add audio APIs to contextBridge
frontend/src/shared/ipc-types.ts                       — Add AudioDecode, AudioWaveform response types
frontend/src/renderer/components/preview/PreviewControls.tsx — Integrate A/V clock, add waveform
frontend/src/renderer/components/preview/useFrameDisplay.ts  — Use AVClock for frame targeting
backend/src/zmq_server.py                              — Add audio_decode, audio_waveform commands
```

---

## NOT in Scope (Explicitly Excluded)

- No audio-reactive modulation (Phase 6) — audio_analyze command defined but not wired to effects
- No audio sidechain (Phase 6)
- No audio export (Phase 11 — playback only here)
- No multiple audio tracks
- No audio effects (EQ, compression, etc.)
- No audio recording
- No MIDI-triggered audio (Phase 8)
- No audio waveform in timeline (Phase 4 — waveform is in transport bar only)

---

## Codebase Context

### PCM File Format (internal)
```
Raw binary file: interleaved float32 stereo PCM
Layout: [L0, R0, L1, R1, L2, R2, ...]
Byte size: total_samples * channels * 4
Sample rate: always 48000 (resampled from source)
Channels: always 2 (stereo, downmixed from source)
```

### Audio Decode Flow
```
User loads video
  → Frontend sends {cmd: "ingest", path} → Backend returns metadata (has_audio: true)
  → Frontend sends {cmd: "audio_decode", path} → Backend decodes → writes .pcm file → returns path
  → Frontend sends {cmd: "audio_waveform", pcm_path, ...} → Backend computes → returns peaks/rms
  → Frontend main process: nativeModule.audioInit(48000, 2, 512)
  → Frontend main process: nativeModule.audioLoadPCM(pcmPath, totalSamples, 2)
  → User clicks Play → nativeModule.audioPlay() → AVClock starts → video follows
```

### Sync Loop (60Hz in renderer)
```
requestAnimationFrame →
  audioTime = AVClock.getAudioTime()
  targetFrame = Math.floor(audioTime * fps)
  if (targetFrame !== lastRenderedFrame) {
    sendCommand({cmd: "render_frame", time: audioTime, ...})
    lastRenderedFrame = targetFrame
  }
```
