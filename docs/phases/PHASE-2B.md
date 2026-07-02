# Phase 2B: Audio Sprint

> PyAV decode → PortAudio → decoupled A/V clock.
> **Goal:** Video plays with synced audio. Audio-reactive features have a foundation.
> **Sessions:** 2-3
> **Depends on:** Phase 1 (video playback working)

---

## Acceptance Criteria

1. Load a video with audio → audio plays through system speakers via PortAudio
2. Audio stays in sync with video during normal playback (within ±1 frame / 33ms)
3. Scrub/seek → audio follows (no stale audio playing)
4. Pause → audio stops immediately (no tail)
5. Master volume control (0-100%) works
6. Audio waveform displays in transport bar (overview of full clip)
7. Audio never waits for video — if video drops frames, audio plays uninterrupted
8. Audio plays at correct sample rate (48kHz default, matches source)
9. PortAudio device selection (if multiple outputs available)
10. Mute button works

---

## Deliverables

### Python: Audio Decode
```
backend/src/video/
└── audio.py              # PyAV audio stream decode, PCM extraction
```

```python
def decode_audio(asset_path: str, start_time: float, duration: float) -> dict:
    """
    Decode audio from video file.
    Returns: {
        'pcm': np.ndarray (float32, -1.0 to 1.0),
        'sample_rate': int,
        'channels': int,
        'duration': float
    }
    """
    container = av.open(asset_path)
    audio_stream = container.streams.audio[0]
    # Seek, decode, resample to float32
    ...
```

### Electron: PortAudio Playback
```
frontend/native/
├── src/
│   ├── shared_memory.cc  # (from 0B)
│   └── audio.cc          # PortAudio output stream (~150 LOC)
└── index.d.ts            # Add audio API types
```

**Native audio API:**
```typescript
interface AudioEngine {
  init(sampleRate: number, channels: number, bufferSize: number): void;
  play(pcmBuffer: Float32Array): void;
  pause(): void;
  resume(): void;
  seek(sampleOffset: number): void;
  setVolume(volume: number): void;  // 0.0 - 1.0
  getPlaybackPosition(): number;    // Current sample offset
  listDevices(): AudioDevice[];
  setDevice(deviceId: number): void;
  close(): void;
}
```

### Decoupled A/V Clock
```
frontend/src/main/
└── clock.ts              # Master clock, audio-driven
```

```typescript
// Audio is the master clock
// Video is the slave — renders frame nearest to audio position

class AVClock {
  private audioPosition: number = 0;  // In seconds, from PortAudio callback

  getAudioPosition(): number {
    return this.audioPosition;
  }

  // Called at 60Hz to tell Python what frame to render
  getTargetFrameIndex(fps: number): number {
    return Math.round(this.audioPosition * fps);
  }

  // If video can't keep up, it holds the previous frame
  // Audio NEVER skips or stutters
}
```

### Audio Waveform Display
```
frontend/src/renderer/components/transport/
├── Waveform.tsx          # Canvas-based waveform overview
└── useWaveform.ts        # Downsample PCM to display resolution
```

### IPC Commands (additions)
```python
# New commands in zmq_server.py
"audio_decode":  # {asset_id, start, duration} → {pcm_path, sample_rate, channels}
"audio_analyze": # {asset_id, time} → {rms, peak, frequency_bands}  (for Phase 6)
```

**Note:** PCM data is too large for ZMQ JSON. Python writes decoded PCM to a temp file, responds with the file path. Electron reads the file via native module.

---

## Architecture: Why PortAudio, Not Web Audio

| | Web Audio | PortAudio |
|-|-----------|-----------|
| Latency | 128-512 samples (browser-controlled) | 64-256 samples (app-controlled) |
| Sample rate | Locked to AudioContext rate | Any rate |
| Threading | Main thread or AudioWorklet | Native callback thread |
| Device access | Limited | Full device enumeration |
| A/V sync | Harder (browser clock vs video) | Direct (same process, shared clock) |

PortAudio runs in a native C++ callback — never blocks the UI. Electron's main process feeds the buffer.

---

## Testing

### Frontend (Vitest)
- AVClock: getTargetFrameIndex returns correct frame for given audio position
- AVClock: audio position advances at correct rate
- Waveform: downsampling preserves peak values

### Backend (pytest)
- `test_audio.py`: Decode audio from MP4, verify sample rate and duration
- `test_audio.py`: Seek to timestamp, verify PCM offset
- `test_audio.py`: No audio stream → graceful error (not crash)

### Integration
- Load video with audio → play 5 seconds → verify A/V sync within 33ms
- Seek to random position → audio and video both at new position

---

## NOT in Phase 2B

- No audio-reactive modulation (Phase 6)
- No audio sidechain (Phase 6)
- No audio export (Phase 11 — just playback here)
- No multiple audio tracks
- No audio effects (this is video-first)
