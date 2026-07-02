# Entropic v2 — IPC Protocol Specification

> Defines all communication between Electron (frontend) and Python (backend).
> Two channels: ZMQ for commands, shared memory for frames.

---

## 1. ZMQ Command Channel

### 1.1 Transport
- **Pattern:** REQ/REP (synchronous request-response)
- **Binding:** Python binds `tcp://127.0.0.1:{PORT}`, Electron connects
- **PORT:** Dynamically assigned (Python prints port to stdout on startup, Electron reads it)
- **Encoding:** JSON (UTF-8)

### 1.2 Message Format
Every message is a JSON object with a `cmd` field:

```json
// Request (Electron → Python)
{
  "cmd": "command_name",
  "id": "uuid-for-correlation",
  ...payload
}

// Response (Python → Electron)
{
  "id": "uuid-for-correlation",
  "ok": true,
  ...result
}

// Error response
{
  "id": "uuid-for-correlation",
  "ok": false,
  "error": "Human-readable error message"
}
```

### 1.3 Commands

#### System
| Command | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `ping` | E→P | `{}` | `{ status: "alive"\|"busy", uptime_s, last_frame_ms }` |
| `shutdown` | E→P | `{}` | `{ ok: true }` (Python exits cleanly) |
| `flush_state` | E→P | `{ project: Project }` | `{ ok: true }` (Python rebuilds render graph) |

#### Video
| Command | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `ingest` | E→P | `{ path: string }` | `{ ok, asset_id, width, height, fps, duration, codec, has_audio }` |
| `seek` | E→P | `{ time: float }` | `{ ok, frame_index }` (frame written to shared memory) |
| `render_frame` | E→P | `{ time: float, chain: EffectInstance[] }` | `{ ok, frame_index }` (frame in shared memory) |
| `render_range` | E→P | `{ start: float, end: float, chain: EffectInstance[], fps: int }` | Stream of `{ progress, frame_index }` then `{ ok, cached_count }` |

#### Effects
| Command | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `list_effects` | E→P | `{}` | `{ effects: [{ id, name, category, params: ParamDef[] }] }` |
| `apply_chain` | E→P | `{ frame_index: int, chain: EffectInstance[] }` | `{ ok }` (result in shared memory) |

#### Export
| Command | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `export_start` | E→P | `{ path, codec, bitrate, resolution, chain, in_point, out_point }` | `{ ok, job_id }` |
| `export_status` | E→P | `{ job_id }` | `{ progress: 0.0-1.0, eta_s, current_frame }` |
| `export_cancel` | E→P | `{ job_id }` | `{ ok }` |

#### Audio
| Command | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `audio_decode` | E→P | `{ asset_id, start: float, duration: float }` | `{ ok, pcm_path }` (temp WAV file) |
| `audio_analyze` | E→P | `{ asset_id, time: float }` | `{ rms, peak, frequency_bands: float[] }` |

### 1.4 Heartbeat Protocol
```
Every 1000ms:
  Electron sends: { cmd: "ping", id: "..." }
  Python responds: { id: "...", status: "alive", uptime_s: 42.3, last_frame_ms: 8.2 }

Miss counter:
  miss_count = 0
  on_pong: miss_count = 0
  on_timeout (>2000ms): miss_count += 1
  if miss_count >= 3: trigger ENGINE_RESTART
```

---

## 2. Shared Memory Frame Transport

### 2.1 Ring Buffer Layout
```
┌────────────────────────────────────────────┐
│              HEADER (64 bytes)              │
│  write_index: uint32  (Python increments)  │
│  frame_count: uint32  (total written)      │
│  slot_size:   uint32  (max bytes per slot) │
│  ring_size:   uint32  (number of slots)    │
│  width:       uint32  (frame width)        │
│  height:      uint32  (frame height)       │
│  reserved:    32 bytes                     │
├────────────────────────────────────────────┤
│  SLOT 0: [length: uint32] [mjpeg data...]  │
├────────────────────────────────────────────┤
│  SLOT 1: [length: uint32] [mjpeg data...]  │
├────────────────────────────────────────────┤
│  SLOT 2: [length: uint32] [mjpeg data...]  │
├────────────────────────────────────────────┤
│  SLOT 3: [length: uint32] [mjpeg data...]  │
└────────────────────────────────────────────┘
```

### 2.2 Write Protocol (Python)
```python
def write_frame(frame: np.ndarray, ring_buffer: mmap, header: Header):
    # Encode to MJPEG quality 95
    img = Image.fromarray(frame[:, :, :3])  # Drop alpha for JPEG
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=95)
    data = buf.getvalue()

    # Write to next slot
    slot_index = header.write_index % header.ring_size
    offset = HEADER_SIZE + (slot_index * header.slot_size)
    ring_buffer[offset:offset+4] = len(data).to_bytes(4, 'little')
    ring_buffer[offset+4:offset+4+len(data)] = data

    # Increment write index (atomic)
    header.write_index += 1
```

### 2.3 Read Protocol (Electron/C++)
```cpp
// In the native Node.js module
Napi::Value ReadLatestFrame(const Napi::CallbackInfo& info) {
    uint32_t write_index = *(uint32_t*)header;
    uint32_t slot_index = (write_index - 1) % ring_size;
    uint32_t offset = HEADER_SIZE + (slot_index * slot_size);
    uint32_t length = *(uint32_t*)(buffer + offset);
    // Return MJPEG bytes as Buffer
    return Napi::Buffer<uint8_t>::Copy(env, buffer + offset + 4, length);
}
```

### 2.4 Configuration
| Parameter | Default | Notes |
|-----------|---------|-------|
| `RING_SIZE` | 4 | Number of frame slots |
| `SLOT_SIZE` | 4MB | Max size per MJPEG frame (1080p Q95 ≈ 800KB, 4K Q95 ≈ 3MB) |
| `TOTAL_SIZE` | ~16MB + 64B header | Negligible memory footprint |

### 2.5 mmap Setup
- **Name:** Platform-dependent. macOS: `/dev/shm/entropic-frames` or file-backed mmap
- **Created by:** Python (on startup)
- **Opened by:** Electron (via C++ native module)
- **Cleanup:** Python unlinks on graceful shutdown. Electron unlinks on watchdog restart.

---

## 3. Error Handling

### 3.1 ZMQ Errors
- Timeout (no response in 2000ms): Increment miss counter
- Malformed JSON: Log error, return `{ ok: false, error: "malformed" }`
- Unknown command: Return `{ ok: false, error: "unknown command: X" }`

### 3.2 Shared Memory Errors
- Stale data (write_index hasn't changed in 5 seconds during playback): Log warning, hold last frame
- Buffer corruption: Detect via length field (if length > SLOT_SIZE, skip frame)
- mmap file missing: Python crashed. Watchdog will restart.

### 3.3 Recovery Flow
```
Python crash detected (3 missed pings)
→ Kill Python process
→ Show toast: "Engine restarting..."
→ Delete stale mmap file
→ Spawn new Python process
→ Wait for first PONG
→ Send flush_state with full project state
→ Resume rendering
→ Show toast: "Engine recovered"
```
