# Entropic v2 — Signal Architecture

> How modulation, sidechain, and operators work.
> 4-layer system: Source → Extraction → Processing → Routing.

---

## 1. Overview

Operators don't process pixels. They generate **control signals** (0.0 - 1.0) that modulate effect parameters over time.

```
                    ┌──────────────┐
                    │  SOURCES     │  Video, Audio, MIDI, LFO
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  EXTRACTION  │  Luminance, Motion, RMS, FFT
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  PROCESSING  │  Threshold, ADSR, Smooth, Quantize
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  ROUTING     │  → Effect params (via mapping)
                    └──────────────┘
```

## 2. Layer 1: Sources

| Source Type | What It Reads | Output | Phase |
|-------------|--------------|--------|-------|
| `mod.lfo` | Internal oscillator (sine/saw/square/tri/random/noise/S&H) | 0.0-1.0 per frame | 6 |
| `mod.envelope` | Trigger events (manual, threshold, MIDI) | ADSR-shaped 0.0-1.0 | 6 |
| `mod.video_analyzer` | Current video frame | Feature value (luma, motion, color, edges) | 6 |
| `mod.audio_follower` | Audio PCM buffer | Amplitude, frequency band energy | 6 (after 2B) |
| `mod.step_sequencer` | Programmable grid | Step values | 6 |
| `mod.performance_gate` | Keyboard/MIDI input | Gate signal (0 or 1) | 9 |
| `mod.multimodal_fusion` | Multiple sources combined | Weighted sum | 6 |

## 3. Layer 2: Extraction Methods

For sources that read external data (video, audio), extraction converts raw data to a single float:

### Video Extraction
```python
def extract_luminance(frame: np.ndarray) -> float:
    """Average brightness of frame. Returns 0.0-1.0."""
    gray = np.mean(frame[:,:,:3], axis=2)
    return float(np.mean(gray) / 255.0)

def extract_motion(frame: np.ndarray, prev_frame: np.ndarray | None) -> float:
    """Frame difference magnitude. Returns 0.0-1.0."""
    if prev_frame is None:
        return 0.0
    diff = np.abs(frame.astype(float) - prev_frame.astype(float))
    return float(np.mean(diff) / 255.0)

def extract_color_channel(frame: np.ndarray, channel: int) -> float:
    """Average of specific color channel (0=R, 1=G, 2=B). Returns 0.0-1.0."""
    return float(np.mean(frame[:,:,channel]) / 255.0)

def extract_edge_density(frame: np.ndarray) -> float:
    """Proportion of edge pixels (Sobel). Returns 0.0-1.0."""
    # Sobel on grayscale, threshold, count
    ...

def extract_histogram_peak(frame: np.ndarray) -> float:
    """Location of histogram peak. Returns 0.0-1.0."""
    ...
```

**Performance note (from v2 spec):** Video analysis MUST run on downscaled proxy (64x64) not full frame. At 1080p, luminance average on full frame = ~8ms. At 64x64 = ~0.01ms.

### Audio Extraction
```python
def extract_rms(pcm: np.ndarray, window_size: int = 1024) -> float:
    """Root mean square amplitude. Returns 0.0-1.0."""
    return float(np.sqrt(np.mean(pcm[-window_size:] ** 2)))

def extract_frequency_band(pcm: np.ndarray, band: tuple[float, float], sample_rate: int) -> float:
    """Energy in frequency band (Hz range). Returns 0.0-1.0."""
    fft = np.fft.rfft(pcm[-2048:])
    freqs = np.fft.rfftfreq(2048, 1.0 / sample_rate)
    mask = (freqs >= band[0]) & (freqs <= band[1])
    return float(np.mean(np.abs(fft[mask])))

def extract_onset(pcm: np.ndarray, threshold: float = 0.3) -> bool:
    """Onset detection (transient). Returns True on attack."""
    ...
```

## 4. Layer 3: Processing

After extraction, the raw signal goes through a processing chain:

```python
class SignalProcessor:
    """Processes a raw signal value through a chain of operations."""

    @staticmethod
    def threshold(value: float, threshold: float) -> float:
        """Below threshold = 0, above = scaled 0-1."""
        if value < threshold:
            return 0.0
        return (value - threshold) / (1.0 - threshold)

    @staticmethod
    def adsr(value: float, state: dict, attack: int, decay: int,
             sustain: float, release: int, frame_index: int) -> tuple[float, dict]:
        """ADSR envelope shaping. Returns (shaped_value, new_state)."""
        # State machine: idle → attack → decay → sustain → release → idle
        ...

    @staticmethod
    def smooth(value: float, prev: float, amount: float) -> float:
        """Slew limiter. Higher amount = slower response."""
        return prev + (value - prev) * (1.0 - amount)

    @staticmethod
    def quantize(value: float, steps: int) -> float:
        """Snap to N discrete levels."""
        return round(value * steps) / steps

    @staticmethod
    def invert(value: float) -> float:
        return 1.0 - value

    @staticmethod
    def scale(value: float, min_out: float, max_out: float) -> float:
        """Map 0-1 to custom range."""
        return min_out + value * (max_out - min_out)
```

## 5. Layer 4: Routing

### One-to-Many
One signal source → multiple effect parameters.
```
LFO (2Hz sine) ──┬── pixelsort.threshold (depth 0.5, range 0.2-0.8)
                  ├── vhs.tracking (depth 1.0, range 0.0-1.0)
                  └── feedback.decay (depth 0.3, range 0.1-0.9)
```

### Many-to-One
Multiple signals → one parameter (blended).
```
LFO (2Hz) ────────┐
                   ├── BLEND → pixelsort.threshold
Audio follower ───┘
```
Blend modes: `add`, `multiply`, `max`, `min`, `average`.

### DAG Enforcement
```python
def check_cycle(routing: dict[str, list[str]], new_edge: tuple[str, str]) -> bool:
    """
    Returns True if adding new_edge would create a cycle.
    routing: { source_id: [target_ids] }
    new_edge: (source, target)
    """
    # BFS/DFS from target — can we reach source?
    visited = set()
    queue = [new_edge[1]]
    while queue:
        node = queue.pop(0)
        if node == new_edge[0]:
            return True  # Cycle detected
        if node not in visited:
            visited.add(node)
            queue.extend(routing.get(node, []))
    return False
```

**UI rule:** The "Sidechain From..." dropdown greys out sources that would create a cycle.

## 6. Signal Order (v2 Lock 5)

For every modulated parameter, every frame:

```
1. Base Value         ← User-set slider position
2. + Modulation       ← Sum of all operator signals × depth
3. + Automation       ← Automation lane value at current time
4. = Clamped Value    ← Clamped to parameter's [min, max]
```

**Stacking is allowed.** Modulation does NOT disable automation.
Both can affect the same parameter simultaneously.

### Ghost Handle
The UI knob shows:
- **Solid handle:** Base value (what user set)
- **Ghost ring:** Actual value after modulation + automation (semi-transparent)
- If automation is active: handle smoothly moves to automation value
- If modulation is active: ghost ring oscillates/vibrates around the handle

## 7. Cross-Modal Fusion

Two or more signals combined into one:

```python
def fusion(sources: list[tuple[float, float]]) -> float:
    """
    Weighted combination of signals.
    sources: [(signal_value, weight), ...]
    Returns: weighted sum, clamped to 0.0-1.0
    """
    total = sum(value * weight for value, weight in sources)
    return max(0.0, min(1.0, total))
```

Example: `(Video_Luma * 0.6) + (Audio_RMS * 0.4)` → combined signal driving glitch intensity.

## 8. Dual Model Reconciliation

There are TWO types of sidechain in the system:

| Type | What | Output | Category | Phase |
|------|------|--------|----------|-------|
| **Signal Sidechain** | Extracts control signal from source | 0.0-1.0 float | `mod.*` (Operator) | Phase 6 |
| **Effect Sidechain** | Processes pixels using key input | Modified frame | `fx.*` (Effect) | Phase 1 |

**Signal Sidechain** (`mod.sidechain`): Takes a video/audio source, extracts a signal, maps to params.
Example: Audio amplitude → pixelsort threshold.

**Effect Sidechain** (`fx.sidechain_duck`, `fx.sidechain_cross`): Takes a video frame + key frame, outputs a blended frame.
Example: Cross-fade between two videos based on brightness.

Both exist. Signal sidechain is the modular operator system. Effect sidechain is the legacy per-pixel processing. The 6 current sidechain effects become presets of the signal sidechain operator, but the underlying effect functions carry forward as `fx.*` effects.
