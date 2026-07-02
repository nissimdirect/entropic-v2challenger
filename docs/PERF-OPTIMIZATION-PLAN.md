# Effect Performance Optimization Plan

> **Status:** Planned (post-Phase 8)
> **Goal:** All 189 effects under 100ms at 1080p for real-time 30fps preview.
> **Current:** 147/189 (78%) under 100ms. 42 effects exceed target.
> **Full plan:** `~/.claude/plans/effect-perf-optimization.md`

---

## Slow Effects (42, sorted by time)

| Effect | Time (ms) | Category | Bottleneck |
|--------|----------|----------|------------|
| fx.median_filter | 1406 | enhance | cv2.medianBlur large kernel |
| fx.dct_swap | 858 | codec | Per-block DCT Python loop |
| fx.pixel_bubbles | 497 | physics | Force computation loop |
| fx.quant_amplify | 488 | codec | Per-block DCT Python loop |
| fx.quant_table_lerp | 421 | codec | Per-block DCT Python loop |
| fx.quant_morph | 410 | codec | Per-block DCT Python loop |
| fx.reaction_diffusion | 405 | emergent | scipy convolve2d iterations |
| fx.lens_flare | 401 | whimsy | Per-ray Python loop |
| fx.quant_transform | 385 | codec | Per-block DCT Python loop |
| fx.freq_flanger | 382 | modulation | Per-row FFT loop |
| fx.channel_phaser | 310 | modulation | Per-channel FFT loop |
| fx.dct_phase_destroy | 308 | codec | Per-block DCT Python loop |
| fx.pixel_quantum | 289 | physics | Force computation |
| fx.feedback_phaser | 285 | modulation | 2D FFT + feedback loop |
| fx.dct_transform | 281 | codec | Per-block DCT Python loop |
| fx.dct_sculpt | 271 | codec | Per-block DCT Python loop |
| fx.pixel_magnetic | 261 | physics | Multi-source force loop |
| fx.hue_shift | 238 | color | RGB-HSV conversion |
| fx.pixel_superfluid | 237 | physics | Curl computation |
| fx.pixel_wormhole | 210 | physics | Dual-center displacement |
| fx.pixel_timewarp | 203 | physics | Time-varying displacement |
| fx.entropy_map | 200 | info_theory | Per-block histogram loop |
| fx.harmonic_percussive | 196 | misc | Median filter on spectrogram |
| fx.pixel_antigravity | 193 | physics | Multi-source forces |
| fx.resonant_filter | 181 | modulation | IIR per-pixel loop |
| fx.pixel_vortex | 166 | physics | Rotational forces |
| fx.grid_scale_mix | 164 | codec | Dual-scale resize + blend |
| fx.pixel_gravity | 158 | physics | Multi-source forces |
| fx.pixel_force_field | 154 | physics | Multi-source forces |
| fx.pencil_sketch | 137 | distortion | Edge detection + blend |
| fx.generation_loss | 136 | codec | Pillow JPEG roundtrip |
| fx.pixel_darkenergy | 136 | physics | Expansion field |
| fx.pixel_flow_field | 125 | physics | Flow computation |
| fx.pixel_haunt | 123 | physics | Ghost overlay |
| fx.erosion_sim | 116 | misc | Hydraulic erosion sim |
| fx.pixel_dimension_warp | 115 | physics | Fold computation |
| fx.block_crystallize | 109 | codec | Per-block mean loop |
| fx.pixel_dimensionfold | 108 | physics | Fold computation |
| fx.pixel_xerox | 107 | physics | Copy artifacts |
| fx.pixel_inkdrop | 106 | physics | Ring displacement |
| fx.pixel_print_emulation | 104 | physics | Print artifacts |
| fx.brightness_phaser | 102 | modulation | Brightness band sweep |

---

## Optimization Tiers

### Tier 1: Vectorized Batch DCT (9 effects)

**Problem:** `apply_per_block()` calls `scipy.fft.dctn()` ~8,100 times per channel in a Python loop at 1080p.

**Fix:** Reshape channel to `(N, 8, 8)` tensor, single `dctn()` call with `axes=(2,3)`.

**Expected:** 1000ms → <50ms (20-50x improvement)

**Files:** `effects/shared/dct_utils.py` + 9 effect files (dct_transform, quant_transform, block_crystallize + 6 variants)

### Tier 2: Physics Force Vectorization (18 effects)

**Problem:** Some physics effects still have Python loops in force computation over source points.

**Fix:** All force fields as numpy broadcast ops. Only loop over sources (1-8), inner ops fully vectorized.

**Expected:** 100-500ms → 50-100ms (2-5x improvement). `cv2.remap` itself (~30ms) is the floor.

**Files:** 11 physics effect files

### Tier 3: FFT/DSP Vectorization (6 effects)

**Problem:** Per-row FFT or per-channel loops for notch/band placement.

**Fix:** 2D FFT masks via element-wise multiplication, pre-allocated.

**Expected:** 100-380ms → <100ms

**Files:** 6 DSP effect files

### Tier 4: Misc Fixes (10 effects)

| Effect | Fix |
|--------|-----|
| median_filter | Cap kernel size at high res; or approximate median |
| hue_shift | Profile for redundant copies; ensure cv2.cvtColor path |
| reaction_diffusion | Separable 3×3 convolution; reduce iterations at high res |
| lens_flare | Vectorize ray mask as numpy array |
| pencil_sketch | Eliminate redundant copies |
| generation_loss | cv2.imencode/imdecode (faster than Pillow) |
| grid_scale_mix | Reduce redundant allocations |
| erosion_sim | Vectorize erosion kernel |
| entropy_map | Vectorize histogram per-block via reshape |
| block_crystallize | Reshape + mean over axes (covered by Tier 1) |

### Tier 5: GPU Acceleration (post-launch)

- CuPy drop-in for numpy (GPU arrays, same API)
- OpenCV CUDA for remap, medianBlur, cvtColor
- cuFFT via CuPy for FFT effects
- Optional dependency, CPU fallback when no GPU

---

## Build Order

1. Tier 1 (batch DCT) — highest ROI, single shared utility change
2. Tier 4 median_filter — worst single offender, likely 1-line fix
3. Tier 2 (physics audit) — profile first, may already be near-optimal
4. Tier 3 (FFT/DSP) — profile, targeted fixes
5. Tier 4 remaining — diminishing returns
6. Tier 5 (GPU) — post-launch

## Success Criteria

- All 189 effects under 100ms at 1080p
- No visual quality regression (10,435 tests stay green)
- No new dependencies
