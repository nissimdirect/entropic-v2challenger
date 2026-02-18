# Entropic v2 Challenger — Effects Inventory

> Complete catalog of all effects: 126 existing (from v1) + 45 new (from R&D).
> Every effect follows the Effect Contract (`apply()` pure function).
> Sources: entropic-2/FEATURE-SET.md, RD-EFFECTS-RESEARCH-2026-02-18.md, v2 spec.

---

## Existing Effects (126, from v1 codebase)

### By Category

| Category | Count | Effects |
|----------|-------|---------|
| **physics** | 21 | pixel_liquify, pixel_gravity, pixel_vortex, pixel_explode, pixel_elastic, pixel_melt, pixel_blackhole, pixel_antigravity, pixel_magnetic, pixel_timewarp, pixel_dimensionfold, pixel_wormhole, pixel_quantum, pixel_darkenergy, pixel_superfluid, pixel_bubbles, pixel_inkdrop, pixel_haunt, pixel_xerox, pixel_fax, pixel_risograph |
| **destruction** | 18 | datamosh, byte_corrupt, block_corrupt, row_shift, jpeg_artifacts, invert_bands, data_bend, flow_distort, film_grain, glitch_repeat, xor_glitch, frame_smash, channel_destroy, pixel_decay, pixel_dynamics, pixel_cosmos, pixel_organic, real_datamosh |
| **temporal** | 14 | stutter, feedback, frame_drop, time_stretch, tape_stop, tremolo, delay, decimator, sample_and_hold, granulator, beat_repeat, strobe, lfo, visual_reverb |
| **modulation** | 13 | ring_mod, gate, wavefold, video_flanger, video_phaser, spatial_flanger, channel_phaser, brightness_phaser, hue_flanger, resonant_filter, comb_filter, feedback_phaser, freq_flanger |
| **texture** | 11 | vhs, noise, blur, sharpen, edge_detect, posterize, tv_static, contour_lines, scanlines, ascii_art, braille_art |
| **tools** | 9 | levels, curves, hsl_adjust, color_balance, chroma_key, luma_key, auto_levels, histogram_eq, clahe |
| **whimsy** | 8 | kaleidoscope, soft_bloom, shape_overlay, lens_flare, watercolor, rainbow_shift, sparkle, film_grain_warm |
| **color** | 8 | hue_shift, contrast_crush, saturation_warp, brightness_exposure, color_invert, color_temperature, tape_saturation, color_filter |
| **sidechain** | 7 | sidechain_duck, sidechain_pump, sidechain_gate, sidechain_cross, sidechain_crossfeed, sidechain_interference, sidechain_operator |
| **enhance** | 6 | solarize, duotone, emboss, false_color, median_filter, parallel_compression |
| **distortion** | 6 | wave_distort, displacement, mirror, chromatic_aberration, pencil_sketch, cumulative_smear |
| **glitch** | 4 | pixelsort, channelshift, bitcrush, displacement |

### Type Taxonomy

| Type | Namespace | Purpose | UI Treatment |
|------|-----------|---------|-------------|
| **Effect** | `fx.*` | Destructive/generative pixel processing | Effect chain (ordered list) |
| **Tool** | `util.*` | Non-destructive adjustment | Adjustment panel |
| **Operator** | `mod.*` / `op.*` | Control signal generation | Operator panel with mapping |

### Stateful Effects (require `state_in`/`state_out`)

| Category | Effects Requiring State |
|----------|----------------------|
| temporal | ALL 14 (stutter, feedback, delay, granulator, etc.) |
| physics | ALL 21 (velocity fields, particle positions) |
| modulation | ALL 13 (flanger phase, phaser state, reverb buffer, etc.) |
| sidechain | ALL 7 (cross-frame analysis) |
| destruction | datamosh, real_datamosh, frame_smash (3 of 18) |
| **Total** | **58 of 126** use `state_in`/`state_out` |

---

## New Effects from R&D (45 post-consolidation)

> Source: RD-EFFECTS-RESEARCH-2026-02-18.md. See `RD-EFFECTS-RESEARCH.md` for full algorithms.

### Emergent Systems (3 effects)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| Reaction Diffusion | `fx.reaction_diffusion` | 122ms | ~30 | YES (A/B concentrations) |
| Cellular Automata | `fx.cellular_automata` | 59ms | ~20 | YES (cell grid) |
| Crystal Growth | `fx.crystal_growth` | ~400ms | ~60 | YES (growth state) |

### Information Theory (3 effects)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| Compression Oracle | `fx.compression_oracle` | 68ms | ~20 | NO |
| Logistic Cascade | `fx.logistic_cascade` | 13ms | ~15 | NO |
| Entropy Map | `fx.entropy_map` | 387ms* | ~25 | NO |

*Optimizable to ~100ms via half-resolution compute + bilinear upscale.

### Warping (2 effects)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| Domain Warp | `fx.domain_warp` | 78ms | ~30 | NO |
| Strange Attractor | `fx.strange_attractor` | ~300ms | ~50 | YES (particles) |

### Codec Archaeology (13 effects, consolidated from 20)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| DCT Sculpt | `fx.dct_sculpt` | 55ms | ~45 | NO |
| DCT Swap | `fx.dct_swap` | 60ms | ~40 | NO |
| DCT Phase Destroy | `fx.dct_phase_destroy` | 45ms | ~30 | NO |
| Quant Amplify | `fx.quant_amplify` | 40ms | ~30 | NO |
| Quant Morph | `fx.quant_morph` | 80ms | ~45 | NO |
| Quant Table Lerp | `fx.quant_table_lerp` | 50ms | ~35 | NO |
| Grid Moire | `fx.grid_moire` | 120ms | ~50 | NO |
| Grid Scale Mix | `fx.grid_scale_mix` | 100ms | ~45 | NO |
| Chroma Control | `fx.chroma_control` | 60ms | ~40 | NO |
| Generation Loss | `fx.generation_loss` | 20ms*N | ~30 | NO |
| Cross Codec | `fx.cross_codec` | 30ms*N | ~35 | NO |
| Mosquito Amplify | `fx.mosquito_amplify` | 70ms | ~35 | NO |
| Block Crystallize | `fx.block_crystallize` | 30ms | ~25 | NO |

All codec archaeology effects share a `block_size` param (2-128, default 8) and get dry/wet mix from Effect Container.

### Optics (7 effects, consolidated from 8)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| Fisheye | `fx.fisheye` | ~40ms | ~35 | NO |
| Anamorphic | `fx.anamorphic` | ~35ms | ~40 | NO |
| Tilt-Shift | `fx.tilt_shift` | ~30ms | ~30 | NO |
| Chromatic Aberration (isolated) | `fx.chromatic_aberration_pro` | ~25ms | ~25 | NO |
| Bokeh Shaper | `fx.bokeh_shaper` | ~80ms | ~45 | NO |
| Lo-Fi Lens | `fx.lo_fi_lens` | ~45ms | ~40 | NO |
| Coma | `fx.coma` | ~60ms | ~35 | NO |

### Surveillance (3 effects, consolidated from 6)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| Surveillance Cam | `fx.surveillance_cam` | ~35ms | ~50 | NO |
| Night Vision | `fx.night_vision` | ~25ms | ~35 | NO |
| Infrared/Thermal | `fx.infrared_thermal` | ~20ms | ~30 | NO |

### Medical Imaging (6 effects)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| X-Ray | `fx.xray` | ~30ms | ~35 | NO |
| Ultrasound | `fx.ultrasound` | ~35ms | ~40 | NO |
| MRI | `fx.mri` | ~45ms | ~40 | NO |
| CT Windowing | `fx.ct_windowing` | ~20ms | ~30 | NO |
| PET Scan | `fx.pet_scan` | ~25ms | ~30 | NO |
| Microscope/Histology | `fx.microscope` | ~35ms | ~40 | NO |

### Misc (from backlog — Priority C)

| Effect | ID | Time (1080p) | LOC | State? |
|--------|----|-------------|-----|--------|
| Erosion Sim | `fx.erosion_sim` | ~350ms | ~50 | YES |
| Afterimage | `fx.afterimage` | 17ms | ~15 | YES (prev frame) |
| Moire | `fx.moire` | ~20ms | ~20 | NO |
| Temporal Crystal | `fx.temporal_crystal` | ~50ms | ~25 | YES |
| Spectral Paint | `fx.spectral_paint` | 88ms | ~30 | NO |
| Sonification Feedback | `fx.sonification_feedback` | ~80ms | ~40 | NO |
| Harmonic Percussive | `fx.harmonic_percussive` | ~100ms | ~40 | NO |
| Wavelet Split | `fx.wavelet_split` | ~120ms | ~35 | NO |

---

## Totals

| Category | Existing | New | Total |
|----------|----------|-----|-------|
| physics | 21 | 0 | 21 |
| destruction | 18 | 0 | 18 |
| temporal | 14 | 0 | 14 |
| modulation | 13 | 0 | 13 |
| texture | 11 | 0 | 11 |
| tools | 9 | 0 | 9 |
| whimsy | 8 | 0 | 8 |
| color | 8 | 0 | 8 |
| sidechain | 7 | 0 | 7 |
| enhance | 6 | 0 | 6 |
| distortion | 6 | 0 | 6 |
| glitch | 4 | 0 | 4 |
| **emergent** | 0 | 3 | **3** |
| **info_theory** | 0 | 3 | **3** |
| **warping** | 0 | 2 | **2** |
| **codec_archaeology** | 0 | 13 | **13** |
| **optics** | 0 | 7 | **7** |
| **surveillance** | 0 | 3 | **3** |
| **medical** | 0 | 6 | **6** |
| **misc_backlog** | 0 | 8 | **8** |
| **TOTAL** | **126** | **45** | **171** |

---

## Build Phases (When Effects Get Built)

| Phase | What | Effects |
|-------|------|---------|
| 0B | First effect (validation) | `fx.invert` (simplest possible) |
| 1 | Core pipeline proof | 5-10 fast effects (pixelsort, hue_shift, blur, posterize, noise) |
| 3 | Color Suite | levels, curves, hsl_adjust, color_balance + histogram |
| 8 | Physics + remaining effects | All 126 existing + new R&D effects (4 waves) |
| Post-launch | Future backlog | 278 additional effects from ENTROPIC-MASTER-EFFECTS-LIST.md |

### R&D Build Waves (within Phase 8)

**Wave 1 — Foundation (5 effects, ~4h):** compression_oracle, logistic_cascade, entropy_map, generation_loss, grid_moire
**Wave 2 — Visual Showstoppers (5 effects, ~3h):** reaction_diffusion, night_vision, xray, domain_warp, cross_codec
**Wave 3 — Aesthetic Packs (5 effects, ~3h):** ultrasound, dct_sculpt, anamorphic, infrared_thermal, mosquito_amplify
**Wave 4 — Polish (5 effects, ~3h):** dct_phase_destroy, quant_morph, fisheye, surveillance_cam, mri

---

## Cross-Pollination Principles

These principles from R&D research inform how effects should chain:

1. **Output-as-Seed:** Generative effects (RD patterns, CA cells, crystals) seed simulation effects (erosion, CA, RD). The output of one becomes the initial state of another.

2. **Decompose-Process-Recombine:** Splitting effects (spectral_paint, wavelet_split, harmonic_percussive) create layers. Any effect applies per-layer. Separation multiplies creative space.

3. **Measurement-to-Modulation:** Analytical effects (entropy_map, compression_oracle) generate control signals. Wire these as operator inputs via Signal Architecture. The video becomes self-reactive.

4. **Time-Space Swap:** Audio DSP techniques applied to pixel rows. Spatial techniques applied to temporal axis. Every spatial effect has a temporal twin.

5. **Chaos Boundary:** Effects with order-to-chaos transitions (logistic r-value, RD feed/kill rates, domain_warp recursion) have a maximally interesting bifurcation point. The edge of chaos is where the art lives.

---

## Shared Utilities (Build First)

These utility functions serve multiple R&D effects:

```python
# codec_utils.py
def jpeg_roundtrip(frame, quality, subsample='4:2:0'): ...
def dct_block_process(frame, func, block_size=8): ...
def grid_offset_compress(frame, dx, dy, quality): ...
def ycbcr_split(frame): ...
def ycbcr_merge(y, cb, cr): ...

# lens_utils.py
def barrel_distort(frame, k1, k2=0): ...
def radial_remap(frame, scale_per_channel): ...
def circular_vignette(frame, radius, falloff): ...

# noise_utils.py
def perlin_2d(h, w, scale, seed): ...
def poisson_noise(frame, scale): ...
def rayleigh_speckle(frame, scale): ...
```
