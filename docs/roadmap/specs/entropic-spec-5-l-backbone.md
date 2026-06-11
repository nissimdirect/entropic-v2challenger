# SPEC-5 — Multi-headed L Backbone Integration Plan
*Written 2026-06-03 · how DINOv2 + CLIP + CLAP load, run, and stay out of the audio thread*

> Covers Q7 (L source = multi-headed) + SG-4 (audio-thread process isolation). The L-axis perception substrate that the vision doc commits to from day one. Three pretrained models, one shared inference queue, isolated from realtime audio, budgeted against detected RAM. Gates Tier 5 commit pending benchmark.

---

## 1. Decision recap

Round 1 chose multi-headed L from day one (DINOv2 + CLIP + CLAP) rather than starting with one model. Justification: cross-modal (audio + video) reachable in Tier 5 without a refactor; richer modulation surface; latent recommendation substrate covers more queries.

Cost: ~500MB resident at full load (22 + 150 + 300 MB roughly) + 3× inference work per frame. CTO review flagged SG-4 upgrade to "worker pool per backbone with shared inference queue + RT-priority audio thread."

---

## 2. Architecture

```
                       ┌──────────────────────────┐
                       │  Electron Renderer       │
                       │  (live preview UI)       │
                       └──────┬───────────────────┘
                              │  ZMQ IPC
                              ▼
                  ┌─────────────────────────────────┐
                  │  Python sidecar (existing)      │
                  │                                 │
                  │  audio render thread (RT)       │
                  │     ↕ never blocked             │
                  │                                 │
                  │  video render thread            │
                  │     ↕ requests latents async    │
                  └──────────┬──────────────────────┘
                             │ shared inference queue (bounded)
                             ▼
              ┌──────────────────────────────────────┐
              │  L-backbone worker process (NEW)     │
              │                                      │
              │  ┌────────┐ ┌────────┐ ┌──────────┐ │
              │  │DINOv2  │ │ CLIP   │ │  CLAP    │ │
              │  │ ~22MB  │ │ ~150MB │ │  ~300MB  │ │
              │  └────────┘ └────────┘ └──────────┘ │
              │                                      │
              │  inference scheduler                 │
              │  (sparse encode + interpolation)     │
              └──────────────────────────────────────┘
```

### 2.1 Why a separate worker process

- **SG-4 contract:** audio thread MUST keep realtime priority. CLIP inference at ~200ms/frame in same process = audio underruns at minimum, documented macOS audio driver kernel panics under sustained underruns
- **Process isolation:** OS scheduler can pin RT thread to its own core; backbone work happens elsewhere
- **Memory containment:** if a backbone gets large (E1 project-fit VAE), it's bounded inside the worker process — can be killed + restarted without taking down the app
- **Independent restart:** backbone crash doesn't crash the sidecar or the UI

### 2.2 Why shared inference queue

- Three backbones × independent queues = three sets of queue management + three batch coordination paths. Shared queue is cleaner.
- Different requests can target different backbones (B8 latent-grain-selection needs DINOv2; cross-modal mod needs CLAP); scheduler picks the right backbone per request
- Batching: when 8 grain-select requests arrive for the same frame, batch them into one DINOv2 forward pass

---

## 3. Worker process API

### 3.1 Request schema (over ZMQ to worker)

```python
@dataclass
class LBackboneRequest:
    request_id: str
    backbone: Literal['dinov2', 'clip-img', 'clip-text', 'clap-audio', 'clap-text']
    input: bytes | str  # image bytes, text, or audio buffer
    input_kind: Literal['image_jpeg', 'image_raw', 'text', 'audio_pcm']
    output_kind: Literal['embedding', 'similarity_to_target']
    target_embedding: list[float] | None  # if output_kind=similarity
    priority: int  # 0 = highest (render-critical), 9 = lowest (background)

@dataclass
class LBackboneResponse:
    request_id: str
    embedding: list[float] | None
    similarity: float | None
    latency_ms: float
    backbone_used: str
    error: str | None
```

### 3.2 Sparse encoding (the latency trick)

CLIP at ~200ms/frame on CPU is prohibitive at 60fps. Mitigations:

| Strategy | Use case |
|---|---|
| **Every N-th frame encode** | C5 latent-trajectory modulation: encode every 4th frame, interpolate latents between (linear or slerp) |
| **Async with last-known fallback** | Grain selection (B8): submit request, use last frame's embedding if not back yet |
| **Pre-compute on import** | Frame-Bank Oscillator slots (B6): encode all slots once at load time, cache forever |
| **Quantized model on Apple silicon** | Where MLX / CoreML quantization is available — 4-bit or 8-bit DINOv2 — drop latency 2-3× |

**Tier 5 entry condition (from vision):** Q7 benchmark must show <50ms interpolation jitter on target hardware. Sparse-encode + slerp interpolation is the path to that.

### 3.3 Public API on the sidecar side

```python
# backend/src/perception/l_backbone_client.py

class LBackboneClient:
    """High-level interface that the rest of the sidecar calls. Hides queue + worker mgmt."""

    async def encode_image(self, image: np.ndarray, backbone: str = 'dinov2') -> np.ndarray:
        """Returns the embedding vector. Async — caller awaits."""

    async def encode_text(self, text: str, backbone: str = 'clip-text') -> np.ndarray: ...

    async def encode_audio(self, audio_buffer: np.ndarray, backbone: str = 'clap-audio') -> np.ndarray: ...

    async def similarity(self, a: np.ndarray, b: np.ndarray) -> float: ...

    def encode_sparse(
        self, frames: list[np.ndarray], every_n: int = 4
    ) -> list[np.ndarray]:
        """Encodes every Nth frame, returns interpolated embeddings for the rest."""
```

---

## 4. SG-4 contract (audio-thread isolation)

### 4.1 Contract

1. **L-backbone worker is a separate process** (not a thread in the sidecar). OS-level isolation.
2. **Audio render thread in sidecar** keeps RT scheduling priority via:
   - macOS: `pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE)` or higher
   - CPU pinning where supported (M-series performance cores)
3. **Worker process runs at lower priority** — `QOS_CLASS_UTILITY` so the OS preempts it for audio
4. **No shared mutexes** between audio thread and worker — ZMQ async messaging only
5. **Bounded queue depth** — if worker falls behind, requests drop with explicit fallback (last-known embedding); audio NEVER stalls waiting on a backbone

### 4.2 Audio thread contract test

```python
def test_audio_thread_runs_at_rt_priority():
    """Verify audio thread has correct macOS QoS class."""

def test_backbone_busy_does_not_starve_audio():
    """
    Saturate backbone with 1000 requests. Measure audio render thread frame-time.
    Assert: 99th percentile frame-time stays under 5ms (well below 1024-sample buffer @ 44.1kHz = 23ms).
    """

def test_backbone_crash_does_not_kill_audio():
    """Kill worker process. Audio render thread continues."""

def test_queue_overflow_drops_with_fallback():
    """Submit more requests than queue depth. Excess requests return cached fallback, never block."""
```

---

## 5. Memory budget integration (SG-8 hook)

SG-8 (memory-pressure auto-disable) registers each backbone as a disable-able feature:

| Backbone | Priority (lowest disabled first) | Memory savings |
|---|---|---|
| **CLAP** | 5 (drop first) | ~300MB |
| **CLIP** | 6 | ~150MB |
| **DINOv2** | 9 (drop last — last-mile fallback) | ~22MB |

Disable behavior:
- When disabled: backbone unloaded from memory; any incoming requests get a fallback response (use cached embedding OR fail gracefully)
- When re-enabled (pressure drops): backbone lazy-loads on next request; ~1-2s warm-up latency
- Status overlay shows which backbones are loaded vs disabled

**Per CTO review:** SG-8 design lands WITH Q7 backbone spike, not late at E6. They share the runtime decision.

---

## 6. Model selection + loading

### 6.1 Models

| Backbone | Model | Size | Source | License |
|---|---|---|---|---|
| **DINOv2** | `dinov2_vits14` (small) | ~22MB | Meta AI via HF Hub | Apache 2.0 |
| **CLIP** | `openai/clip-vit-base-patch32` | ~150MB | OpenAI via HF Hub | MIT |
| **CLAP** | `laion/clap-htsat-fused` | ~300MB | LAION via HF Hub | CC0 |

All three are MIT/Apache/CC0 — clean for distribution.

### 6.2 First-launch UX

- Models NOT bundled with app (~470MB extra install footprint is too much)
- First time L-axis used, download with progress UI
- Cached to `~/.creatrix/models/` (per Creatrix rename)
- Re-use across projects + sessions

### 6.3 Model versioning + integrity

- Pin model versions in `models.toml` config
- SHA-256 checksum verified on download + on load
- Mismatch → re-download (handles partial cache corruption)
- Versions bumped only when model retraining changes embedding space (rare; never silent)

---

## 7. Inference acceleration

### 7.1 Apple silicon (primary)

- **MLX** for DINOv2 + CLIP if MLX-converted weights available
- Fallback: PyTorch with MPS backend
- Quantization: int8 quantized models cut latency ~2× with minimal quality loss for similarity-style queries

### 7.2 Intel Mac (fallback, Mac-first decision)

- PyTorch CPU only
- Will be slower; document as known constraint
- If Intel Mac users feedback strongly enough, ONNX runtime fallback

### 7.3 Backend abstraction

Single `InferenceBackend` interface:

```python
class InferenceBackend(Protocol):
    def encode(self, input_data: np.ndarray, backbone: str) -> np.ndarray: ...

# Implementations:
# - MLXInferenceBackend (Apple silicon, preferred)
# - PyTorchMPSBackend (Apple silicon fallback)
# - PyTorchCPUBackend (Intel)
# - ONNXBackend (future)
```

Hot-swappable: app detects best available at startup; can be overridden in settings for debugging.

---

## 8. Integration points for each L-touching PRD

| PRD | What it asks of L-backbone | Backbone | Latency requirement |
|---|---|---|---|
| **B6 Frame-Bank `interp='flow'`** | Per-slot embedding for optical-flow morph quality | DINOv2 | Offline-encoded; no realtime need |
| **B8 Granulator `selection='latentSimilarity'`** | Find frames in source semantically close to target latent | DINOv2 | Async with last-known fallback (per-frame OK to skip) |
| **B9 Tensor learned bindings** (research-tier, deferred) | Small MLP infers binding-rule output from inputs | trained per-edge | Realtime per-frame, very small model |
| **C5 Latent-Trajectory Modulation** | Encode reference clips' latents; user navigates simplex | DINOv2 + CLIP optionally | Reference encoded once at add-time; trajectory eval is interpolation in simplex (fast) |
| **C6 Frame-as-Self-Wavetable** | Re-encode rendered output as feedback source | DINOv2 | Sparse-encode every N frames; interpolation between |
| **C8 Feedback-Through-L** | Same as C6 but loops latent → next frame | DINOv2 | Same as C6 |
| **D4 Latent Granulator** | Each grain = "project rendered at latent (x,y,z)" — requires DECODE which we don't ship in v1 | (deferred) | — |
| **E1 Resynthesis-Latent Mode** | Per-project autoencoder trained on user content | new model per project | Training: offline, ~60-120s expected; inference: fast post-training |
| **A2 Genoscope** (Tier 6) | Multi-modal reference → fitness function | DINOv2 + CLIP + CLAP + optical-flow | Async during GA evaluation (offline) |
| **Cross-modal modulation B2 audio→video** | CLAP audio embedding → similarity to reference video → modulation value | CLAP | Sparse-encode audio per-window, interpolation between |

---

## 9. Q7 benchmark (the Tier 5 gate)

Per vision §11 next-moves: Q7 latency benchmark gates Tier 5 commit. SG-8 design lands here.

### 9.1 Benchmark setup

Target hardware: M1 Pro 16GB (the floor case) + M2 Max 32GB (typical) + M3 Max 64GB+ (high end).

### 9.2 Measurements

| Metric | Target | Critical-for |
|---|---|---|
| DINOv2-small encode latency | < 50ms on M1 Pro | C5/C6/C8 |
| CLIP-ViT-B/32 image encode | < 200ms on M1 Pro | C5 multi-target |
| CLAP audio encode (1s buffer) | < 100ms on M1 Pro | B2 cross-modal |
| All 3 backbones loaded resident | < 600MB | SG-8 budget |
| All 3 backbones queue-saturated, audio thread frame-time 99p | < 5ms | SG-4 |
| Sparse-encode (every 4th frame) + slerp interpolation jitter | < 50ms per 16ms frame budget | Tier 5 entry |
| First-launch download time, all 3 models | < 90s on 50Mbps connection | UX |
| Cold-load all 3 models (from disk cache) | < 8s | Startup UX |

### 9.3 Decision gate

If benchmark passes all critical thresholds: Tier 5 GO with multi-headed L.

If sparse-encode interpolation jitter > 100ms even with quantized models: defer L-axis features to v1.1; ship Tiers 0-4 without latent. Vision Round 1 acknowledged this fallback path.

---

## 10. File-by-file inventory

| File | Change | Lines |
|---|---|---|
| `backend/src/perception/__init__.py` (new) | Module init | ~5 |
| `backend/src/perception/l_backbone_client.py` (new) | Public API the sidecar uses | ~200 |
| `backend/src/perception/l_backbone_worker.py` (new) | Worker process entry, ZMQ server, scheduler | ~400 |
| `backend/src/perception/inference_backends/mlx_backend.py` | MLX-based inference | ~200 |
| `backend/src/perception/inference_backends/pytorch_mps_backend.py` | PyTorch MPS fallback | ~200 |
| `backend/src/perception/inference_backends/pytorch_cpu_backend.py` | Intel Mac fallback | ~150 |
| `backend/src/perception/model_registry.py` | Model metadata, version pinning, checksum verification | ~150 |
| `backend/src/perception/model_downloader.py` | First-run download + caching | ~150 |
| `backend/src/perception/memory_monitor.py` (also covered in SPEC-3 SG-8) | Pressure monitor + feature registry | ~250 |
| `backend/src/pipeline/render.py` (mod) | Async latent-encode request integration | ~50 |
| `frontend/src/renderer/components/perception/ModelDownloadDialog.tsx` | First-run download UI | ~120 |
| `frontend/src/renderer/components/statusbar/PerceptionStatus.tsx` | Shows which backbones loaded + memory pressure | ~100 |
| Tests | unit (encode/decode/cache); integration (queue saturation, SG-4 audio isolation); perf (benchmark suite); E2E (first-launch download, model load) | ~600 |

**Total: ~2700 lines + asset infrastructure for model downloads.**

---

## 11. Build sequence within SPEC-5

1. **Q7 benchmark first** — without code, just download models + measure. Decides whether to proceed.
2. If GO: build worker process + ZMQ shell + DINOv2 first (smallest, fastest, lowest risk)
3. Add CLIP, validate sparse-encode pattern works
4. Add CLAP, validate cross-modal queries work
5. SG-4 audio isolation tests
6. SG-8 memory monitor + feature registry
7. First-launch download UX
8. Integrate with B6/B8 grain selection (the first real consumer)
9. C5 latent-trajectory modulation (the first user-facing L-axis feature)

---

## 12. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Q7 benchmark fails (latency too high) | Vision Round 1 anticipated this; ship Tiers 0-4 without L, defer L-axis to v1.1 |
| Models hosted by HuggingFace become unavailable / rate-limited | Mirror to our own CDN; serve from `models.creatrix.app` as fallback |
| Model license terms change | Pin versions; vendor a tarball as last-resort backup |
| 500MB resident on 16GB Mac eats too much of user's budget | SG-8 auto-disables CLAP first; can run on DINOv2 alone with degraded cross-modal |
| Worker process crash | Auto-restart with backoff; surface to user only on repeated failure |
| Quantization quality loss for similarity queries | Validate empirically on a test set per model; allow user to opt into fp32 |
| MLX availability for some models | PyTorch MPS fallback always present |
| Intel Mac severely slow | Document; encourage Apple silicon; potentially ship without L-axis on Intel |

---

## 13. Coordination

- This session leads (Vision territory)
- Creatrix session: B8 / B9 / B10 integrate against `LBackboneClient` API — coordinate API surface before they start
- SG-4 + SG-8 contracts land here (not in SPEC-3) since they're tied to Q7 backbone-specific implementation

---

## 14. Next spec

**SPEC-6 — `.dna` patch format + no-regression CI lint.** Last of the six. Defines the portable patch format (effect graph + routing + lanes + params), forward + backward compat rules, versioned budget descriptor (SG-2), unknown-fields-preserve policy. Independent of other specs — ships anytime. ~3-4 pages.
