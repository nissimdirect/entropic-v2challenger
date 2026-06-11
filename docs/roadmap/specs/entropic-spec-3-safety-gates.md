# SPEC-3 — Safety Gate Contracts (SG-1, SG-3, SG-5, SG-8)
*Written 2026-06-03 · contract specs for the four hard-blocking safety gates*

> Each safety gate is a binary precondition: B6 / B7 / B8 / B9 / B10 cannot build until the gate's contract is implemented in code (not vocabulary). This spec defines API surface, CI test, enforcement point, and owner for each of the four gates that block the most downstream work. SG-2 covered in SPEC-6 (`.dna`). SG-4 covered in SPEC-5 (L-backbone). SG-6 deferred (Genoscope is research-tier). SG-7 (codec timeout) is lightweight and can ship anytime. SG-9 (plugin sandbox) deferred (Tier 7).

---

## 1. Why these four

Per the vision build sequence:

| Gate | Blocks |
|---|---|
| **SG-1 GPU resource lifetime** | Tier 2 (C2, C3, A4 shader-codegen path), B7 (RIFE), B8 (Granulator) |
| **SG-3 Latent NaN sentinel** | Tier 5 (C5, C6, C8, D4, E1), B8 latent grain selection, B9 learned bindings |
| **SG-5 Dynamic cycle detection** | Tier 3 (B4 full painted/learned), B9 tensor routing |
| **SG-8 Memory-pressure auto-disable** | Tier 5 E6 live mode; cross-cutting hygiene for Tier 3+ |

These four cover the highest-leverage blockers. Specs are tight; each ~1 page.

---

## 2. SG-1 — GPU Resource Lifetime Contract

### 2.1 Why

Apple silicon unifies CPU + GPU memory. A leaked Metal texture handle exhausts SYSTEM memory → kernel swap thrash → whole computer freezes. Codegen paths (per-pixel field shaders for C2/C3, custom shader graphs for A4 spectral effects, granulator passes for A1/B8) are exactly the kind of dynamic GPU work that leaks if discipline lapses. Patching per-effect won't catch the cascade.

### 2.2 Contract

Every Metal handle (texture, buffer, sampler, pipeline state, command queue, command buffer, render encoder) is owned by a RAII wrapper at allocation time. Wrapper exposes `destroy()` that frees deterministically. Wrapper's destructor (or equivalent in Swift / Python `__del__` / TypeScript finalization registry — depending on which language owns the handle) ALWAYS frees the underlying resource.

**Texture pool ceiling:** every effect that allocates textures registers with a per-effect pool. Pool has a hard ceiling (e.g., 32 textures × max-resolution). New allocation when pool full → reuse via LRU eviction OR fail with explicit error (caller handles).

**Forbidden patterns:**
- Raw `MTLDevice.makeTexture()` outside a wrapper
- Unowned handles passed as function arguments
- Static / module-level Metal objects (no clear ownership)

### 2.3 API surface

```ts
// (Illustrative — exact API depends on where Metal lives in stack;
//  may be Swift bridge, Python via PyObjC, or TypeScript via wgpu binding)

class GPUTextureHandle {
  constructor(device: MTLDevice, descriptor: TextureDescriptor)
  destroy(): void  // explicit free; idempotent
  get raw(): MTLTexture  // accessor — throws if destroyed
  // RAII: drop / __del__ / finalizer triggers destroy() if not already called
}

class GPUTexturePool {
  constructor(maxResidentTextures: number, evictionPolicy: 'lru' | 'fail')
  acquire(descriptor: TextureDescriptor): GPUTextureHandle
  // Pool tracks all live handles; on `destroy()` of handle, removes from pool
}
```

### 2.4 Enforcement point

- Every effect that uses GPU registers a `GPUTexturePool` instance keyed by effect-instance-id
- When effect unmounts (chain removal, project close, undo of add), pool is destroyed → all handles freed
- When ENTIRE app shuts down, top-level pool aggregator destroys all child pools

### 2.5 CI test

`backend/tests/gpu/test_resource_lifetime.py` (or equivalent — Swift XCTest or Vitest with WebGPU stub):

```python
def test_create_and_destroy_10k_handles_leaks_zero():
    """Allocate 10k textures, destroy each, verify Metal heap usage returns to baseline."""
    baseline = metal_heap_usage_bytes()
    pool = GPUTexturePool(max_resident_textures=100, eviction_policy='lru')
    for i in range(10_000):
        h = pool.acquire(TextureDescriptor(width=64, height=64, format='rgba8'))
        h.destroy()
    assert metal_heap_usage_bytes() <= baseline + ALLOCATION_TOLERANCE
```

Plus:
- `test_pool_lru_evicts_oldest()`
- `test_destroyed_handle_throws_on_use()`
- `test_pool_destroy_frees_all_held_handles()`
- `test_effect_unmount_clears_its_pool()`

### 2.6 Owner

**Either session.** Whoever ships Tier 2 first (codegen path for C2/C3 or A4 spectral warper) ships SG-1 as its precondition.

**Estimated effort:** Medium. ~2 weeks for the wrapper layer + tests + retrofit of any existing Metal code. Not heavy because the codebase doesn't yet have heavy Metal usage.

---

## 3. SG-3 — Latent NaN/Inf Sentinel

### 3.1 Why

CLIP / DINOv2 / CLAP latents have no natural bounds. Modulation paths that ADD to latents drift unboundedly. Decoding out-of-distribution latents (especially via E1 project-fit autoencoders) yields NaN tensors. NaN propagates silently through downstream effects → blank frames + invisible failure mode. User blames the app.

### 3.2 Contract

Every feedback-capable modulation path that touches the L-axis MUST pass through a sentinel:

1. **Normalize:** on every WRITE to a latent that participates in feedback (C6, C8, D4), apply L2-clamp OR project-onto-manifold:
   - L2-clamp: if `||latent||₂ > MAX_L2_NORM`, scale to `MAX_L2_NORM`
   - Project-onto-manifold: snap to nearest valid latent (Tier 5+ — requires backbone-specific impl)
2. **Detect:** every render pipeline output is checked for NaN/Inf BEFORE compositing. If detected:
   - Abort the offending modulation lane
   - Surface a toast to user: "Modulation lane {name} produced NaN — disabled"
   - Set lane to mute state automatically (user can re-enable after fix)
3. **Never silent-pass:** NaN frames are NEVER rendered downstream. Pipeline output gates on a finite-check.

### 3.3 API surface

```python
# backend/src/pipeline/latent_sentinel.py

MAX_L2_NORM = 32.0  # tuned per backbone; per-backbone overrides in config

def normalize_latent(latent: np.ndarray, backbone: str) -> np.ndarray:
    """L2-clamp the latent if its norm exceeds the per-backbone ceiling."""
    norm = np.linalg.norm(latent)
    cap = MAX_L2_NORM_PER_BACKBONE.get(backbone, MAX_L2_NORM)
    if norm > cap:
        return latent * (cap / norm)
    return latent

def detect_nan_in_frame(frame: np.ndarray) -> bool:
    """Returns True if frame contains NaN or Inf."""
    return not np.all(np.isfinite(frame))

class ModulationLaneAbortedError(Exception):
    def __init__(self, lane_id: str, reason: str):
        self.lane_id = lane_id
        self.reason = reason
```

### 3.4 Enforcement point

- Latent writes: every modulation-edge that targets a latent destination calls `normalize_latent()` before persisting the new value
- Pipeline output gate: `backend/src/pipeline/render.py` after compositor, before encode → `detect_nan_in_frame()`. If True → emit `lane_aborted` event back to frontend, render the LAST KNOWN GOOD frame (or a blank), set lane to muted state
- Toast: frontend listens for `lane_aborted` events, displays toast with lane name + "muted automatically"

### 3.5 CI test

```python
def test_l2_clamp_below_ceiling_passthrough():
    latent = np.array([1.0, 2.0, 3.0])
    assert np.allclose(normalize_latent(latent, 'dinov2'), latent)

def test_l2_clamp_above_ceiling_scales_down():
    latent = np.array([100.0] * 384)
    out = normalize_latent(latent, 'dinov2')
    assert np.linalg.norm(out) == pytest.approx(MAX_L2_NORM_PER_BACKBONE['dinov2'])

def test_nan_detection_in_frame():
    frame = np.zeros((100, 100, 3), dtype=np.float32)
    assert detect_nan_in_frame(frame) is False
    frame[50, 50, 1] = np.nan
    assert detect_nan_in_frame(frame) is True

def test_inf_detection():
    frame = np.zeros((100, 100, 3), dtype=np.float32)
    frame[0, 0, 0] = np.inf
    assert detect_nan_in_frame(frame) is True

def test_feedback_with_runaway_normalizes():
    """Simulate C6: route output back to input with depth=1.0, run 10 frames, latent stays bounded."""
    latent = np.array([1.0] * 384)
    for _ in range(10):
        latent = latent + latent  # runaway
        latent = normalize_latent(latent, 'dinov2')
    assert np.linalg.norm(latent) <= MAX_L2_NORM_PER_BACKBONE['dinov2']

def test_pipeline_emits_lane_aborted_on_nan_output():
    """Render with a synthetic NaN-producing lane, verify lane_aborted event emitted, frame skipped."""
    # ...
```

### 3.6 Owner

**This session.** Sentinel design is tied to L-backbone (SPEC-5). Coordinates with multi-headed L spec.

**Estimated effort:** Medium. ~2 weeks for sentinel + clamps + frontend toast wiring + tests.

---

## 4. SG-5 — Dynamic Cycle Detection

### 4.1 Why

Creatrix PR-B upgrades `_topological_sort` to raise `ModulationCycleError` on static cycles (per PR-INJECTIONS.md INJ-2). Good for static routing graphs. BUT: B4 painted bindings + learned bindings (Tier 3+) create cycles whose existence depends on RUNTIME values. PR-B's static toposort can't catch them. Intermittent freezes that don't reproduce on dev machine.

SG-5 extends to runtime detection AND adds deterministic cycle-break ordering so two replays of the same project produce byte-identical output (export determinism gate).

### 4.2 Contract

**Two parts:**

**Part A — Per-frame cycle detection.** Each render tick: routing graph is snapshotted; if topology depends on runtime values (painted masks, learned bindings, conditional sources), evaluate the conditional values FIRST, then build the snapshot, then toposort. If toposort detects cycle: emit error, fall back to deterministic break order (Part B).

**Part B — Deterministic cycle-break ordering.** When a cycle is detected, the cycle is broken at ONE edge. The choice MUST be deterministic across replays. Rule:

1. Sort cycle edges by `(edge_id, sequence_within_creation_history)` — stable
2. Break the edge with the lexicographically smallest `edge_id`
3. Emit a one-time warning toast: "Cycle detected in {edges}; broken at {chosen}"
4. Snapshot this decision into the render pipeline for the current export job — same break for all frames of that job

### 4.3 API surface

```python
# backend/src/modulation/engine.py — extension of existing toposort

def topological_sort_with_runtime(
    operators: list[dict],
    runtime_context: RuntimeContext,
) -> list[dict]:
    """
    Sort operators in dependency order. Resolves runtime-dependent edges by
    evaluating painted masks / learned MLPs against runtime_context first.
    On cycle: break deterministically, return remaining sort, raise warning event.
    """

class RuntimeContext:
    frame_index: int
    current_y: int | None  # for axis-bound sources
    audio_buffer: np.ndarray | None
    # ... fields that runtime-dependent edges need

class CycleBreakDecision:
    cycle_edges: list[str]    # edge ids forming the cycle
    broken_at: str            # the chosen edge
    reason: 'lex-smallest'    # extensible for future rules
```

### 4.4 Enforcement point

- `backend/src/pipeline/render.py` calls `topological_sort_with_runtime()` per frame for projects with axis-bound or learned edges
- For projects with only static edges (no painted/learned/axis-bound), falls back to existing PR-B static `_topological_sort()` — faster path
- Cycle-break decisions cached per-export-job (same break for all frames of one export) — ensures determinism across the export's frame range

### 4.5 CI test

```python
def test_static_cycle_caught_by_existing_toposort():
    # Sanity: PR-B's fix still works (regression guard)
    pass

def test_runtime_cycle_detected_per_frame():
    """Painted-mask routing creates cycle only when mask non-zero in certain region."""
    # Mask all-zero → no cycle
    # Mask non-zero in region → cycle detected
    pass

def test_cycle_break_deterministic_across_replays():
    """Same project, same render → identical cycle-break decision."""
    project = load_test_project('runtime_cycle_painted.entropic')
    decision_a = topological_sort_with_runtime(project.operators, RuntimeContext(frame_index=0))
    decision_b = topological_sort_with_runtime(project.operators, RuntimeContext(frame_index=0))
    assert decision_a.broken_at == decision_b.broken_at

def test_cycle_break_consistent_across_frames_within_export():
    """For one export job, the cycle break is the same for frames 0, 100, 200."""
    pass

def test_warning_emitted_once_per_export():
    """User sees toast 1× per export, not per frame."""
    pass

def test_conditional_cycle_detected_within_16ms():
    """Performance gate: per-frame cycle detection must complete in <16ms (one 60fps frame budget)."""
    pass
```

### 4.6 Owner

**Either session.** Extends Creatrix's PR-B work directly. Likely Vision session ships it as a follow-up to PR-B (sits at the boundary).

**Estimated effort:** Heavy. ~3 weeks. The actual cycle-detection algorithm is standard; the integration with axis-bound + painted + learned bindings is the tricky part. Coordinate with B9 design.

---

## 5. SG-8 — Memory-Pressure Auto-Disable

### 5.1 Why

16GB Apple silicon is the floor. Loading multi-headed L (CLIP ~150MB + DINOv2 ~22MB + CLAP ~300MB = ~500MB) + Frame Bank cache (256 4K slots = ~8GB at full residency) + Granulator grain buffers (200 grains × max-size) + Demucs (~4GB) + render cache + Electron + Python sidecar → trivially > 16GB. macOS swaps to SSD → thrash → whole computer locks.

SG-8 prevents this by monitoring unified-memory pressure and AUTO-DISABLING the lowest-priority features when pressure breaches a threshold tied to detected RAM.

### 5.2 Contract

**Three parts:**

**Part A — Detected RAM tiers.** App at startup detects total unified memory: 16GB / 24GB / 32GB / 64GB / 96GB / 128GB (M-series Mac options). Sets per-feature memory budget table.

**Part B — Pressure monitor.** Background thread polls memory pressure every 1s. Pressure = (resident_memory / total) for the app process + child sidecar. Crossings:
- 60% → warn in status bar
- 75% → start auto-disabling lowest-priority features (with toast)
- 90% → emergency: pause render, dump caches, force user action

**Part C — Disable order.** When auto-disabling, iterate this list until below threshold:

| Priority (lowest disabled first) | Feature | Memory savings |
|---|---|---|
| 1 | D4 Latent Granulator (drop latent grain pool) | ~500MB |
| 2 | A5 Spectral Granulator (drop spectral grain buffers) | ~300MB |
| 3 | A1 Granulator grain density (halve, then quarter) | ~200MB+ |
| 4 | E1 project-fit VAE (unload model) | ~100MB-1GB depending on model |
| 5 | Frame Bank slot count (LRU evict to half cap) | ~1-4GB |
| 6 | Per-effect texture pool ceiling (halve, then quarter) | varies |
| 7 | Q7 backbone secondary heads (drop CLAP, then CLIP, keep DINOv2 as fallback) | ~450MB |

Status overlay always-visible when any feature auto-disabled.

### 5.3 API surface

```python
# backend/src/perception/memory_monitor.py

class MemoryBudget:
    total_ram_gb: int           # detected
    app_ceiling_gb: float       # app's share (e.g., 70% of total)
    feature_budgets: dict[str, int]  # per-feature limits

    @classmethod
    def detect(cls) -> 'MemoryBudget': ...

class MemoryPressureMonitor:
    def __init__(self, budget: MemoryBudget, callback: Callable[[PressureEvent], None]): ...
    def start(self) -> None: ...
    def stop(self) -> None: ...

class PressureEvent:
    level: 'warn' | 'auto_disable' | 'emergency'
    current_pct: float
    features_disabled: list[str]  # which ones were auto-disabled this tick

class FeatureRegistry:
    """Features register handlers for auto-disable callbacks."""
    def register(self, feature_id: str, priority: int, disable_fn: Callable[[], int]) -> None: ...
    # disable_fn returns the bytes freed, allowing the monitor to decide if more disabling needed
```

### 5.4 Enforcement point

- App startup: `MemoryBudget.detect()` + `MemoryPressureMonitor.start()` in sidecar
- Each gated feature (D4, A5, A1, E1, Frame Bank, GPU pools, Q7 backbones) registers with `FeatureRegistry` at instantiation
- Status overlay: `frontend/src/renderer/components/statusbar/MemoryStatus.tsx` subscribes to PressureEvent stream

### 5.5 CI test

```python
def test_memory_budget_detected_for_16gb_mac():
    budget = MemoryBudget.detect_for_total_gb(16)
    assert budget.app_ceiling_gb == 11.2  # 70%
    assert budget.feature_budgets['frame_bank_resident'] < 8 * GB

def test_pressure_warn_at_60pct():
    """Mock memory at 60% pressure → callback fires with level='warn'."""
    pass

def test_auto_disable_at_75pct_in_priority_order():
    """Force pressure to 75% → D4 disabled first, then A5, etc."""
    pass

def test_emergency_pauses_render():
    """At 90% → render pause flag set, frontend receives event, toast shown."""
    pass

def test_recovery_re_enables_features():
    """When pressure drops below 65% → re-enable in reverse priority order."""
    pass

def test_disable_order_deterministic():
    """Same pressure scenario → same disable sequence across runs."""
    pass
```

### 5.6 Owner

**Either session.** Likely Vision since SG-8 design coordinates with multi-headed L (SPEC-5) and granular instruments (Creatrix B6/B8) — Vision sits at the intersection.

**Per CTO review pass:** SG-8 design MUST land WITH Q7 backbone spike (SPEC-5), not later at E6 live mode. They're properties of the same runtime decision.

**Estimated effort:** Medium. ~2 weeks for monitor + registry + per-feature disable hooks + status overlay + tests.

---

## 6. Sub-gates not covered here

| Gate | Disposition |
|---|---|
| **SG-2 `.dna` resource budget** | Covered in **SPEC-6** (`.dna` format) |
| **SG-4 Audio-thread isolation from L-backbone** | Covered in **SPEC-5** (multi-headed L) |
| **SG-6 Genoscope cooperative cancellation** | Deferred — Genoscope is Tier 6 research; spec when Genoscope starts |
| **SG-7 Codec/decode timeout on untrusted sources** | Lightweight (~5h impl); ship anytime. Wrap PyAV `av.open` + `to_ndarray` with 5s/frame timeout; corrupt files rejected with toast. No separate spec doc — just an issue. |
| **SG-9 Plugin resource quota + signing** | Deferred — Tier 7 plugin SDK is out of immediate scope. Spec when plugin SDK starts. |

---

## 7. Cross-cutting hygiene (already in vision doc §10)

These don't get their own specs but should be tracked alongside:

| Hygiene | Status |
|---|---|
| SG-H1 Disk LRU on `~/.entropic/{models,cache,thumbnails,renders}` + probe recordings | Owner: this session; ~1 week |
| SG-H2 FD management: raise ulimit at startup; LRU-close idle handles | Owner: either; ~2 days |
| SG-H3 Hardware MIDI/OSC echo-timestamp suppression | Ships with E5 Hardware Bridge (B10 in Creatrix) |

---

## 8. Build order for SG implementations

Recommended sequence respects vision build sequence:

| Sequence | Item | Why |
|---|---|---|
| 1 | SG-7 (codec timeout) | Lightweight; unblocks any untrusted source import |
| 2 | SG-1 (GPU lifetime) | Blocks Tier 2 (C2, C3, A4) — next-most-valuable surface after Tier 1 |
| 3 | SG-5 (cycle detection) | Blocks Tier 3 (B4 full / B9) |
| 4 | SG-3 (latent NaN) + SG-8 (memory) | Both land WITH Q7 spike at Tier 5 start per CTO finding |
| 5 | SG-2 (`.dna` budget) | With SPEC-6; ships before any `.dna` export surface |
| 6 | SG-6 (Genoscope cancel) | When Tier 6 (A2 Genoscope) starts |
| 7 | SG-9 (plugin quotas) | When Tier 7 (E7 SDK) starts |

---

## 9. Coordination protocol

- SG-1 spike — Vision session leads since Tier 2 (C2/C3) is Vision territory; Creatrix session reviews
- SG-5 builds on Creatrix INJ-2 (PR-B toposort upgrade); Vision session extends it after PR-B ships
- SG-3 + SG-8 — Vision session leads (tied to Q7 multi-headed L); Creatrix session integrates into B6/B8/B10
- SG-7 — either session can pick up as a one-shot PR

Each SG should ship as its OWN PR (small, well-bounded, reviewable independently). Bundling gates with feature work increases blast radius.

---

## 10. Next spec

**SPEC-5 — Multi-headed L backbone integration plan.** Defines how DINOv2 + CLIP + CLAP load, run, isolate from audio thread (SG-4), share inference queue, fit in memory budget (SG-8 integration). Required before Tier 5 starts. ~4-5 pages.
