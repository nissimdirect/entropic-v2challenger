# Entropic v2 Challenger — R&D Effects Research

> Ported from ~/Development/entropic/docs/RD-EFFECTS-RESEARCH-2026-02-18.md
> Framed for Challenger architecture (pure function effects, Effect Container, mmap transport).
> Full source with algorithms: see original file above.
> All effects follow the Effect Contract (EFFECT-CONTRACT.md).

---

## Challenger Context

Every R&D effect plugs into the Challenger via:
- **Effect Contract:** `apply(frame, params, state_in, *, frame_index, seed, resolution) -> (output, state_out)`
- **Effect Container:** Masking → Processing → Mix/Blend (free dry/wet + masking for every effect)
- **Signal Architecture:** Analytical effects (entropy_map, compression_oracle) can output control signals routed to any param via `ModulationRoute`
- **Build phase:** Phase 8 (Physics + remaining effects), built in 4 waves
- **Performance budget:** 33ms per frame at 30fps. Effects over 33ms trigger dynamic resolution scaling.
- **Transport:** Processed frames written to mmap ring buffer as MJPEG Q95.

---

## Top 5 Effects (Priority A — Build First)

### 1. compression_oracle — Intentional Codec Feedback
**Category:** `fx.compression_oracle` | **Time:** 68ms | **LOC:** ~20 | **State:** None

JPEG-compress frame at quality Q, diff against original, amplify diff, add back. The codec's lossy decisions become visible — block boundaries glow, mosquito noise becomes texture. Feed output back for iterative amplification.

```python
def apply(frame, params, state_in, *, frame_index, seed, resolution):
    quality = params['quality']
    amplification = params['amplification']
    iterations = params['iterations']
    result = frame[:, :, :3].copy()  # Work in RGB
    for _ in range(iterations):
        img = Image.fromarray(result)
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=quality)
        buf.seek(0)
        compressed = np.array(Image.open(buf))
        diff = np.abs(result.astype(np.int16) - compressed.astype(np.int16))
        result = np.clip(result.astype(np.float32) + diff * amplification, 0, 255).astype(np.uint8)
    output = frame.copy()
    output[:, :, :3] = result
    return output, None
```

**Params:** `quality` (1-100, default 5), `iterations` (1-10, default 1), `amplification` (0.5-10.0, default 3.0), `codec` (jpeg/webp, default jpeg)

**Why novel:** Everyone hides compression artifacts. This celebrates them. The codec's math becomes visible. Brand thesis as code — the tool is called *Entropic*.

---

### 2. logistic_cascade — Deterministic Chaos Threshold
**Category:** `fx.logistic_cascade` | **Time:** 13ms | **LOC:** ~15 | **State:** None

Logistic map x_{n+1} = r*x_n*(1-x_n) generates threshold values per-pixel. At r < 3.57: stable posterization. At r = 3.57-4.0: chaotic bifurcation. Animate r from stable to chaos = video falls apart in a mathematically inevitable way.

**Params:** `r_value` (2.0-4.0, default 3.9), `iterations` (1-50, default 20), `color_mode` (threshold/gradient/bifurcation)

---

### 3. reaction_diffusion — Turing Pattern Generator
**Category:** `fx.reaction_diffusion` | **Time:** 122ms (10 iter) | **LOC:** ~30 | **State:** YES (A/B concentrations)

Gray-Scott reaction-diffusion using pixel brightness as initial chemical concentration. Video grows organic spots, stripes, and labyrinthine patterns that emerge FROM the content.

**Params:** `feed_rate` (0.01-0.1), `kill_rate` (0.01-0.1), `diffusion_speed` (0.1-2.0), `iterations` (1-50)
**Note:** Already built in Chaos Visualizer (~/Development/cymatics/modes/reaction.py) — can port.

---

### 4. domain_warp — Recursive Noise Displacement
**Category:** `fx.domain_warp` | **Time:** 78ms | **LOC:** ~30 | **State:** None

Perlin noise field displaces coordinates. Feed displaced coords back through noise function. Each recursion adds organic fluid distortion. Animate noise seed for flowing liquid motion.

**Params:** `octaves` (1-8), `recursion_depth` (1-5), `warp_strength` (0-100), `animation_speed` (0-5), `scale` (10-200)

---

### 5. entropy_map — Shannon Entropy as Visual Parameter
**Category:** `fx.entropy_map` | **Time:** 387ms* | **LOC:** ~25 | **State:** None

Local Shannon entropy in sliding NxN windows. High entropy = complex texture. Low entropy = flat color. Universal mask generator for every other effect.

**Params:** `window_size` (4-64), `mode` (visualize/mask/modulate), `invert` (bool), `color_map` (heat/cool/grayscale)
**Signal output:** In `mask` mode, output can be routed via Signal Architecture to modulate any other effect's params.

*Optimizable to ~100ms via half-resolution compute + bilinear upscale.

---

## Codec Archaeology (13 effects, consolidated from 20)

> A complete new category built on the physics of lossy compression.
> Discovery: A friend's re-compressed image showed different geometric patterns per 8x8 block — quantized moire from 3 layered phenomena: DCT basis visibility, multi-grid interference, and generation loss accumulation.

### The 7 Control Axes

| Axis | What It Controls | Range |
|------|-----------------|-------|
| A. Frequency Selection | Which DCT basis functions survive | N² coefficients per block |
| B. Quantization Intensity | How coarsely coefficients are rounded | Quality 1 (brutal) to 100 (transparent) |
| C. Grid Alignment | Where the block grid starts | (0,0) to (N-1,N-1) offsets |
| D. Chroma Treatment | How color is subsampled | 4:4:4 / 4:2:2 / 4:2:0 / kill entirely |
| E. Generation Count | How many re-compression rounds | 1 to N |
| F. Cross-Codec | Which codec does the compression | JPEG / WebP / HEIF |
| G. Block Size | DCT processing cell size | 2×2 (micro) to 128×128 (architectural) |

### Effects List

| ID | Effect | Axes | Time | Key Insight |
|----|--------|------|------|-------------|
| `fx.dct_sculpt` | 64-band graphic EQ for spatial frequency | A | 55ms | Animate gains = patterns breathe inside the image |
| `fx.dct_swap` | Block coefficient transplant | A | 60ms | Sort blocks by frequency = X-ray of information density |
| `fx.dct_phase_destroy` | Phase scramble, keep magnitude | A | 45ms | Same texture, wrong positions = frosted glass |
| `fx.quant_amplify` | Exaggerated quantization table | B | 40ms | Posterize following codec's frequency-weighted importance |
| `fx.quant_morph` | Spatial quality gradient | B | 80ms | Face pristine at eyes, disintegrates at edges |
| `fx.quant_table_lerp` | Interpolate quantization tables | B | 50ms | Morphs between codec personalities |
| `fx.grid_moire` | Multi-grid interference stack | C | 120ms | 3-8 compression passes at different grid offsets |
| `fx.grid_scale_mix` | Block size interference | C, G | 100ms | Multiple block sizes interfere like overlapping screens |
| `fx.chroma_control` | Unified luma/chroma processing | D | 60ms | Consolidates chroma_separate + bleed + destroy |
| `fx.generation_loss` | Controlled re-compression cascade | E | 20ms*N | Animate through generations = watch image find its attractor |
| `fx.cross_codec` | Codec translation chain | F | 30ms*N | "Conversation between algorithms" — each codec has a personality |
| `fx.mosquito_amplify` | Gibbs phenomenon exaggeration | meta | 70ms | Neon edge outlines from compression ringing |
| `fx.block_crystallize` | Block averaging to grid | meta | 30ms | Stained glass at grid_visible=true |

### Meta-Effect: codec_archaeology

One super-effect exposing all 7 axes as parameters:
```
codec_archaeology(freq_band, quality, grid_offset, chroma_subsample, generations, codec, block_size, amplify_artifacts, animate_axis)
```

---

## Optics (7 effects)

| ID | Effect | Time | Key Feature |
|----|--------|------|-------------|
| `fx.fisheye` | Barrel distortion + chromatic aberration | ~40ms | Per-channel radial offset |
| `fx.anamorphic` | Horizontal squeeze + oval bokeh + flare | ~35ms | Cinema look |
| `fx.tilt_shift` | Tilted focus plane + saturation boost | ~30ms | Miniature-world effect |
| `fx.chromatic_aberration_pro` | Isolated color fringing | ~25ms | Radial per-channel scale |
| `fx.bokeh_shaper` | Custom out-of-focus shapes | ~80ms | Circle/hexagon/cat-eye/donut/heart kernels |
| `fx.lo_fi_lens` | Plastic lens presets | ~45ms | Presets: pinhole, holga, lomo, diana |
| `fx.coma` | Off-axis comet tail blur | ~60ms | Radial directional blur |

---

## Surveillance (3 effects)

| ID | Effect | Time | Presets |
|----|--------|------|---------|
| `fx.surveillance_cam` | Complete camera simulation | ~35ms | cctv, body_cam, dash_cam, atm |
| `fx.night_vision` | Gen 3 phosphor + intensifier | ~25ms | Green, white-hot |
| `fx.infrared_thermal` | False-color heat mapping | ~20ms | white_hot, black_hot, iron, rainbow, arctic |

---

## Medical Imaging (6 effects)

| ID | Effect | Time | Key Physics |
|----|--------|------|-------------|
| `fx.xray` | Inverted luminance + edge emphasis | ~30ms | Poisson noise (physically accurate) |
| `fx.ultrasound` | Fan mask + speckle noise | ~35ms | Rayleigh distribution (physically accurate) |
| `fx.mri` | T1/T2 contrast + Gibbs ringing | ~45ms | Contrast weighting + edge oscillation |
| `fx.ct_windowing` | Hounsfield unit window/level | ~20ms | Presets: bone, lung, soft_tissue, brain |
| `fx.pet_scan` | False-color activity overlay | ~25ms | Hot LUT over grayscale anatomy |
| `fx.microscope` | Circular aperture + stain remap | ~35ms | Presets: h_and_e, trichrome, pas, immunofluorescence |

---

## Interaction Matrix (New x New)

| A | B | What Happens |
|---|---|-------------|
| entropy_map | logistic_cascade | Entropy drives r-value: high-info regions go chaotic, low-info stays stable |
| entropy_map | reaction_diffusion | RD runs only in low-entropy regions, preserves detail in complex areas |
| entropy_map | domain_warp | Warp strength modulated by entropy: flat areas flow, textured areas stay sharp |
| compression_oracle | logistic_cascade | Codec artifacts become initial state for chaos thresholding |
| compression_oracle | reaction_diffusion | JPEG block boundaries seed RD growth patterns |
| logistic_cascade | domain_warp | Chaos map displaces coordinates — chaotic regions warp, stable don't |
| reaction_diffusion | domain_warp | RD patterns displaced by recursive noise — organic patterns that flow |

## Interaction Matrix (New x Existing 126)

| New Effect | + Existing | Result |
|-----------|-----------|--------|
| reaction_diffusion | + sidechain_duck | RD intensity ducks to audio. Beat = freeze. Silence = growth. |
| reaction_diffusion | + datamosh | RD patterns in P-frames. Chemistry meets codec corruption. |
| logistic_cascade | + posterize | Double threshold: chaos + color reduction = unpredictable posterization |
| domain_warp | + pixelsort | Sort warped pixels — sorting boundaries follow organic flow lines |
| entropy_map (mask) | + any effect | Apply ANY of 126 effects selectively by information density |
| compression_oracle | + scanlines | Codec block grid + CRT lines = double interference pattern |
| night_vision | + pixel_gravity | Phosphor particles falling through surveillance feed |
| thermal | + reaction_diffusion | Heat patterns evolve via Turing patterns — living thermal signature |
| ultrasound | + domain_warp | Speckled fan view warps like fluid |
| cctv | + generation_loss | Surveillance footage degrading over time — found footage horror |

---

## Recombinant Concepts (10 logic-level combinations)

These create new mental models, not just parameter presets:

1. **Entropy-Gated Optics** — Information density controls lens fidelity
2. **Diagnostic Codec** — CT windowing applied to DCT frequency domain
3. **Surveillance Decay** — Recording degrades like hardware does over years
4. **Chaos Lens** — Lens quality governed by logistic map bifurcation
5. **Thermal Diffusion** — Temperature drives reaction-diffusion rate
6. **Compression Microscope** — Zoom into 8x8 block = histology of compression
7. **Spectral Archaeology** — FFT of codec artifacts reveals hidden periodicity
8. **Entropic Self-Reference** — Entropy map of entropy map = information about information
9. **Generative Surveillance** — Night vision where the noise IS cellular automata
10. **Cross-Modal Codec** — Treat pixel rows as audio, compress with audio codecs

---

## Art References

- **Thomas Ruff, "Jpegs" (2004-2007):** Large-format prints of JPEG artifacts as fine art
- **Rosa Menkman, "A Vernacular of File Formats" (2010):** Systematic documentation of codec artifact aesthetics
- **Takeshi Murata, "Monster Movie" (2005):** Datamoshing as art film
- **Chen & Hsu (2011), Amerini et al (2017):** Image forensics research on double JPEG detection — we reverse-engineer their detection into creation

**What we build that they didn't have:** Parametric, real-time, controllable, chainable, animatable codec manipulation. The difference between finding an artifact and *composing* with it.

---

## Dependencies

All R&D effects use numpy/scipy/PIL/opencv only. No new dependencies beyond what Challenger already requires.

| Library | Used By |
|---------|---------|
| numpy | ALL effects |
| scipy.fft (dctn/idctn) | All codec archaeology effects |
| scipy.ndimage | entropy_map (uniform_filter) |
| PIL/Pillow | jpeg_roundtrip, codec chains |
| cv2 (opencv) | Optics (remap, resize), surveillance, medical |
