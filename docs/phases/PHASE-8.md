# Phase 8: Physics + R&D Effects

> Emergent systems, codec archaeology, optics — the experimental arsenal.
> **Goal:** All 171 effects operational. Entropic becomes uniquely powerful.
> **Sessions:** 5-7
> **Depends on:** Phase 1 (effect pipeline), Phase 6 (operators for modulation targets)
> **Architecture ref:** EFFECT-CONTRACT.md (apply signature), EFFECTS-INVENTORY.md (full catalog), RD-EFFECTS-RESEARCH.md (algorithms)

---

## Acceptance Criteria

1. All 45 R&D effects implemented following Effect Contract (pure function, seeded, state_in/state_out)
2. Each effect has PARAMS dict with curve, unit, and description
3. Each effect: 4 mandatory tests (unit, determinism, boundary, state)
4. Codec Archaeology effects: 7 control axes (frequency selection, quantization, grid alignment, chroma, generation count, cross-codec, block size)
5. Physics effects: proper state management for temporal/emergent behavior
6. All effects register in effect browser under correct taxonomy category
7. Performance: any single R&D effect < 100ms at 1080p (some tolerance — these are complex)
8. Interaction with existing 126 effects: chain freely without crashes
9. Art-tested: at least 3 effects reviewed for "does this produce something an artist would actually want"

---

## Build Waves

### Wave 1: High-Impact (Sessions 1-2)
| ID | Effect | Category | Why First |
|----|--------|----------|-----------|
| 1 | `fx.reaction_diffusion` | Emergent Systems | Most requested, strong visual identity |
| 2 | `fx.jpeg_fossil` | Codec Archaeology | Core codec engine, others build on it |
| 3 | `fx.mpeg2_ghost` | Codec Archaeology | Iconic artifact type |
| 4 | `fx.chromatic_aberration` | Optics | Essential lens effect |
| 5 | `fx.lens_distortion` | Optics | Complementary to chromatic |

### Wave 2: Codec Archaeology Deep (Sessions 3-4)
| ID | Effect | Category |
|----|--------|----------|
| 6 | `fx.h261_videophone` | Codec Archaeology |
| 7 | `fx.mpeg4_lowbit` | Codec Archaeology |
| 8 | `fx.av1_partition` | Codec Archaeology |
| 9 | `fx.vp8_golden` | Codec Archaeology |
| 10 | `fx.theora_quant` | Codec Archaeology |
| 11 | `fx.dv_shuffle` | Codec Archaeology |
| 12 | `fx.cinepak_palette` | Codec Archaeology |
| 13 | `fx.indeo_wavelet` | Codec Archaeology |

### Wave 3: Emergent + Optics (Sessions 4-5)
| ID | Effect | Category |
|----|--------|----------|
| 14 | `fx.game_of_life` | Emergent Systems |
| 15 | `fx.flocking` | Emergent Systems |
| 16 | `fx.crystal_growth` | Emergent Systems |
| 17 | `fx.erosion_sim` | Emergent Systems |
| 18 | `fx.neural_ca` | Emergent Systems |
| 19 | `fx.bokeh` | Optics |
| 20 | `fx.anamorphic_streak` | Optics |
| 21 | `fx.diffraction` | Optics |
| 22 | `fx.tilt_shift` | Optics |
| 23 | `fx.light_leak` | Optics |

### Wave 4: Experimental (Sessions 5-7)
| ID | Effect | Category |
|----|--------|----------|
| 24 | `fx.entropy_map` | Information Theory |
| 25 | `fx.compression_ratio_viz` | Information Theory |
| 26 | `fx.bit_plane_slice` | Information Theory |
| 27 | `fx.dct_sculpture` | Information Theory |
| 28-30 | Surveillance effects (3) | Surveillance Aesthetic |
| 31-36 | Medical effects (6) | Medical Imaging |
| 37-45 | Remaining warping + emergent | Various |

---

## Deliverables

### Effect Files
```
backend/src/effects/
├── emergent/
│   ├── reaction_diffusion.py   # Gray-Scott model
│   ├── game_of_life.py         # Conway's with decay
│   ├── flocking.py             # Boids → pixel displacement
│   ├── crystal_growth.py       # DLA aggregation
│   ├── erosion_sim.py          # Hydraulic erosion
│   └── neural_ca.py            # Neural cellular automata
├── codec/
│   ├── jpeg_fossil.py          # DCT manipulation
│   ├── mpeg2_ghost.py          # Motion compensation artifacts
│   ├── h261_videophone.py      # Extreme quantization
│   ├── mpeg4_lowbit.py         # Low-bitrate simulation
│   ├── av1_partition.py        # Partition boundary viz
│   ├── vp8_golden.py           # Golden frame reference
│   ├── theora_quant.py         # Theora-style quantization
│   ├── dv_shuffle.py           # DV tape shuffle artifacts
│   ├── cinepak_palette.py      # 256-color palette reduction
│   └── indeo_wavelet.py        # Wavelet ringing artifacts
├── optics/
│   ├── chromatic_aberration.py # RGB channel displacement
│   ├── lens_distortion.py      # Barrel/pincushion
│   ├── bokeh.py                # Circle-of-confusion blur
│   ├── anamorphic_streak.py    # Horizontal light streaks
│   ├── diffraction.py          # Spectral fringing
│   ├── tilt_shift.py           # Selective focus plane
│   └── light_leak.py           # Film light leak overlay
├── information/
│   ├── entropy_map.py          # Shannon entropy per block
│   ├── compression_ratio_viz.py
│   ├── bit_plane_slice.py      # Extract bit planes
│   └── dct_sculpture.py        # DCT coefficient viz
├── surveillance/
│   ├── cctv_degradation.py
│   ├── night_vision.py
│   └── body_cam.py
└── medical/
    ├── xray.py
    ├── ultrasound.py
    ├── thermal.py
    ├── mri_artifact.py
    ├── ct_windowing.py
    └── retinal_scan.py
```

### Shared Utilities
```
backend/src/effects/shared/
├── dct_utils.py           # DCT/IDCT helpers (used by codec effects)
├── block_processing.py    # Block-based frame iteration
├── noise_generators.py    # Perlin, simplex, white, pink
└── color_space.py         # RGB↔HSV↔YCbCr↔Lab conversions
```

### Testing
- Per effect: unit test, determinism test, boundary test (0% and 100% params)
- Codec: jpeg_fossil at Q=1 produces visible blockiness
- Emergent: reaction_diffusion evolves over 30 frames (state progresses)
- Optics: chromatic_aberration at 0 displacement = identity
- Chain: reaction_diffusion → vhs → pixelsort chain doesn't crash
- Performance: time each effect at 1080p, log results

---

## NOT in Phase 8

- No GPU acceleration for effects (post-launch optimization)
- No user-authored effects / plugin SDK (post-launch)
- No preset packs for R&D effects (Phase 10 library)
