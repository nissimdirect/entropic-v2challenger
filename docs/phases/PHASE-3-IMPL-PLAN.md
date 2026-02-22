---
title: Phase 3 — Color Suite (Levels, Curves, HSL, Color Balance, Histogram)
status: draft
project: entropic-v2challenger
depends_on: Phase 2A (parameter UX — Knob component, curve scaling, fine-tune mode)
sessions: 4
created: 2026-02-22
---

# Phase 3: Color Suite — Implementation Plan

## Context

Phase 1 delivers 10 glitch/fx effects. Phase 2A delivers professional parameter knobs. Phase 3 adds the first `util.*` category effects — color correction tools that professionals expect: Levels, Curves, HSL Adjust, and Color Balance, plus a real-time histogram display. These are non-destructive, stack with effects in the chain, and follow the exact same `EffectContainer` pipeline.

**Goal:** A colorist can load a clip, apply Levels + Curves + HSL + Color Balance in a chain, see a live histogram, and export. Performance target: all 4 color tools chained < 50ms at 1080p.

**Why `util.*` namespace:** The v2 Challenger taxonomy (from `SPECS_EFFECTS_MODULATION.md`) separates `util.*` (tools/grading), `fx.*` (destructive/generative), and `mod.*` (modulators). Color tools are non-destructive utilities, not glitch effects.

---

## What Already Exists

### v1 Entropic Color Effects (port reference — NOT copy-paste)
The v1 codebase (`~/Development/entropic/effects/color.py`) has working implementations of all 4 color tools:

- **`levels()`** (line 455-499): LUT-based, 256-entry lookup table. Input black/white points, gamma, output range, per-channel mode. Uses `cv2.LUT()` for speed.
- **`curves()`** (line 502-551): Bezier spline via `scipy.interpolate.PchipInterpolator` for monotone cubic interpolation. Per-channel. Generates 256-entry LUT.
- **`hsl_adjust()`** (line 554-624): Converts to HSV via OpenCV. Per-hue-range targeting (8 ranges). Soft mask with feathered edges for smooth transitions between hue regions.
- **`color_balance()`** (line 627-683): Shadow/midtone/highlight range masks using luminance-based power curves. Per-channel RGB offsets weighted by masks. Optional luminosity preservation.
- **`compute_histogram()`** (line 686-704): Per-channel + luminance histograms using `cv2.calcHist()`. Returns 256-bin arrays.

**Key algorithms to port:**
1. LUT generation (levels + curves) — 256-entry lookup tables applied via `cv2.LUT()` or `np.take()` for O(1) per-pixel
2. PchipInterpolator for monotone cubic curves (prevents oscillation at control points)
3. Per-hue soft masks with angular distance and feathered falloff
4. Shadow/midtone/highlight luminance-based range masks with power curves
5. Luminosity preservation via pre/post luminance ratio scaling

**What changes for v2:**
- v1 uses RGB (H,W,3). v2 uses RGBA (H,W,4). Must preserve alpha channel.
- v1 functions are standalone. v2 must follow `apply(frame, params, state_in, *, frame_index, seed, resolution)` contract.
- v1 takes individual args. v2 takes `params` dict.
- v2 adds `curve`/`unit` fields in PARAMS (from Phase 2A).
- v2 adds seeded determinism (not relevant for color tools — they're deterministic by nature, no RNG).

### v2 Codebase
- `backend/src/effects/fx/` — 10 effects following the `apply()` contract
- `backend/src/effects/registry.py` — `register()` function, `list_all()`
- `backend/src/engine/container.py` — `EffectContainer.process()` (mask → process → mix)
- `backend/src/engine/pipeline.py` — `apply_chain()` with SEC-7 depth limit
- `docs/EFFECT-CONTRACT.md` — the pure function contract all effects follow
- `frontend/src/renderer/components/effects/ParamPanel.tsx` — renders Knob/Slider per param
- `frontend/src/shared/types.ts` — `ParamDef`, `EffectInfo`, `EffectInstance`

### Key Constraint
- **No OpenCV dependency assumed** — v1 uses `cv2` for color conversions and LUT. v2's backend already has `numpy` as a dependency. We should check if OpenCV (`opencv-python-headless`) is in `pyproject.toml`. If not, implement LUT via `np.take()` and color conversions via pure numpy (avoiding a heavy dependency for 4 utility functions). If OpenCV is already present, use `cv2.LUT()` for speed.

---

## Plan (4 Sessions)

### Session 1: Levels + Curves Backend Effects
> Implement the two LUT-based color effects. No frontend custom UI yet (generic Knob panel works).

- [ ] **1.1** Create `backend/src/effects/util/` directory with `__init__.py`

- [ ] **1.2** Create `backend/src/effects/util/levels.py`
  ```python
  EFFECT_ID = "util.levels"
  EFFECT_NAME = "Levels"
  EFFECT_CATEGORY = "util"

  PARAMS = {
      "input_black":  {"type": "int",   "min": 0,   "max": 255, "default": 0,     "label": "Input Black",  "unit": "", "curve": "linear", "description": "Black point input level"},
      "input_white":  {"type": "int",   "min": 0,   "max": 255, "default": 255,   "label": "Input White",  "unit": "", "curve": "linear", "description": "White point input level"},
      "gamma":        {"type": "float", "min": 0.1, "max": 10.0, "default": 1.0,  "label": "Gamma",        "unit": "", "curve": "logarithmic", "description": "Midtone gamma correction"},
      "output_black": {"type": "int",   "min": 0,   "max": 255, "default": 0,     "label": "Output Black", "unit": "", "curve": "linear", "description": "Black point output level"},
      "output_white": {"type": "int",   "min": 0,   "max": 255, "default": 255,   "label": "Output White", "unit": "", "curve": "linear", "description": "White point output level"},
      "channel":      {"type": "choice","options": ["master","r","g","b","a"], "default": "master", "label": "Channel", "description": "Which channel(s) to affect"},
  }

  def apply(frame, params, state_in, *, frame_index, seed, resolution):
      # 1. Build 256-entry LUT from input range → gamma → output range
      # 2. Apply LUT to RGB channels (preserve alpha)
      # 3. Per-channel mode: apply LUT to single channel only
      # Identity check: input_black=0, input_white=255, gamma=1.0,
      #                 output_black=0, output_white=255 → no-op (skip processing)
      ...
      return output, None  # Stateless
  ```
  - **Algorithm:** (ported from v1 line 484-499)
    1. `lut = np.arange(256, dtype=np.float32)`
    2. `lut = np.clip(lut, input_black, input_white)`
    3. `lut = (lut - input_black) / (input_white - input_black)`
    4. `lut = np.power(lut, 1.0 / gamma)`
    5. `lut = lut * (output_white - output_black) + output_black`
    6. `lut = np.clip(lut, 0, 255).astype(np.uint8)`
    7. Apply via `np.take(lut, frame[:, :, channel])` or `cv2.LUT()` if available

- [ ] **1.3** Create `backend/src/effects/util/curves.py`
  ```python
  EFFECT_ID = "util.curves"
  EFFECT_NAME = "Curves"
  EFFECT_CATEGORY = "util"

  PARAMS = {
      "points": {"type": "float", "min": 0, "max": 255, "default": 0, "label": "Control Points",
                 "description": "Bezier control points as JSON [[x,y],...] — overridden by custom UI"},
      "channel": {"type": "choice", "options": ["master","r","g","b","a"], "default": "master",
                  "label": "Channel", "description": "Which channel to apply curve to"},
      "interpolation": {"type": "choice", "options": ["cubic","linear"], "default": "cubic",
                        "label": "Interpolation", "description": "Curve interpolation method"},
  }
  ```
  - **Note on `points` param:** The generic Knob panel can't render a curve editor. The `points` param will be serialized as a JSON string in the params dict. Phase 3 Session 3 builds a custom `CurvesEditor.tsx` that sends the points array. Until that custom UI exists, a default identity curve `[[0,0],[64,64],[128,128],[192,192],[255,255]]` is used.
  - **Algorithm:** (ported from v1 line 530-551)
    1. Parse points from params (JSON string → list of [x,y])
    2. Sort by x, ensure endpoints at 0 and 255
    3. If cubic and >= 3 points: use `scipy.interpolate.PchipInterpolator` (monotone, no overshoot)
    4. Else: `np.interp()` for linear
    5. Build 256-entry LUT, apply via `np.take()`

- [ ] **1.4** Create `backend/src/effects/util/histogram.py` (utility, NOT an effect)
  ```python
  def compute_histogram(frame: np.ndarray) -> dict:
      """
      Compute per-channel and luminance histograms.
      Args: frame — (H, W, 4) uint8 RGBA
      Returns: {"r": [256 ints], "g": [...], "b": [...], "a": [...], "luma": [...]}
      """
  ```
  - Luminance formula: `0.299*R + 0.587*G + 0.114*B` (BT.601)
  - Use `np.bincount()` for speed (faster than cv2.calcHist for single-channel)

- [ ] **1.5** Add ZMQ command in `backend/src/zmq_server.py`:
  - `compute_histogram` — `{cmd: "compute_histogram", id, path, time, chain}` → render frame with chain → compute histogram → return histogram data
  - This allows the frontend to request a histogram for any frame with any effect chain applied

- [ ] **1.6** Register both effects in `backend/src/effects/registry.py`:
  - Import and register `util.levels` and `util.curves`

- [ ] **1.7** Tests (backend pytest):
  - `backend/tests/test_effects/test_util/test_levels.py`
    - Identity defaults → frame unchanged
    - Inverted output (black=255, white=0) → frame inverted
    - Gamma < 1 changes midtones
    - Per-channel mode: only target channel changes, others preserved
    - Alpha channel preserved in all modes
    - Extreme params (all min, all max) → no crash
    - Determinism: same input → same output
  - `backend/tests/test_effects/test_util/test_curves.py`
    - Identity diagonal → frame unchanged (within ±1 due to interpolation)
    - Inverted curve → frame inverted
    - Per-channel mode → only target channel changes
    - Linear interpolation → exact mapping
    - S-curve increases contrast (std increases)
    - Single control point → no crash
    - 16 control points → no crash (max spec)
    - Alpha channel preserved
    - Determinism test
  - `backend/tests/test_effects/test_util/test_histogram.py`
    - Returns dict with r, g, b, a, luma keys
    - Each key has exactly 256 elements
    - Sum of bins == pixel count (H * W)
    - All-black frame → weight in bin 0
    - All-white frame → weight in bin 255

### Session 2: HSL Adjust + Color Balance Backend Effects
> Implement the two tonal-range effects.

- [ ] **2.1** Create `backend/src/effects/util/hsl_adjust.py`
  ```python
  EFFECT_ID = "util.hsl_adjust"
  EFFECT_NAME = "HSL Adjust"
  EFFECT_CATEGORY = "util"

  PARAMS = {
      "target_hue": {"type": "choice", "options": ["all","reds","oranges","yellows","greens","cyans","blues","purples","magentas"],
                     "default": "all", "label": "Target Hue", "description": "Which hue range to affect"},
      "hue_shift":  {"type": "float", "min": -180.0, "max": 180.0, "default": 0.0,
                     "label": "Hue",        "unit": "°", "curve": "linear", "description": "Rotate hue"},
      "saturation": {"type": "float", "min": -100.0, "max": 100.0, "default": 0.0,
                     "label": "Saturation", "unit": "%", "curve": "linear", "description": "Adjust saturation"},
      "lightness":  {"type": "float", "min": -100.0, "max": 100.0, "default": 0.0,
                     "label": "Lightness",  "unit": "%", "curve": "linear", "description": "Adjust lightness/value"},
  }
  ```
  - **Algorithm:** (ported from v1 line 554-624)
    1. Convert RGB → HSV (pure numpy, no cv2 dependency):
       - Normalize to [0,1]
       - V = max(R,G,B), S = (V - min(R,G,B)) / V, H = standard 6-sector formula
       - H range: 0-360 degrees
    2. If target_hue == "all": apply shifts uniformly
    3. Else: compute angular distance from hue center, create soft mask with feather
    4. Apply hue_shift, saturation (multiplicative), lightness (additive to V)
    5. Convert HSV → RGB, preserve alpha channel
  - **Hue ranges (center, half_width in degrees):**
    - reds: (0, 30), oranges: (30, 15), yellows: (60, 15), greens: (120, 30)
    - cyans: (180, 30), blues: (240, 30), purples: (270, 15), magentas: (300, 30)
  - **Performance:** HSV conversion is O(H*W) — at 1080p (~2M pixels) this is ~5ms with numpy vectorization

- [ ] **2.2** Create `backend/src/effects/util/color_balance.py`
  ```python
  EFFECT_ID = "util.color_balance"
  EFFECT_NAME = "Color Balance"
  EFFECT_CATEGORY = "util"

  PARAMS = {
      "shadows_r":     {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Shadows Red",     "unit": "", "curve": "linear"},
      "shadows_g":     {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Shadows Green",   "unit": "", "curve": "linear"},
      "shadows_b":     {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Shadows Blue",    "unit": "", "curve": "linear"},
      "midtones_r":    {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Midtones Red",    "unit": "", "curve": "linear"},
      "midtones_g":    {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Midtones Green",  "unit": "", "curve": "linear"},
      "midtones_b":    {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Midtones Blue",   "unit": "", "curve": "linear"},
      "highlights_r":  {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Highlights Red",  "unit": "", "curve": "linear"},
      "highlights_g":  {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Highlights Green","unit": "", "curve": "linear"},
      "highlights_b":  {"type": "float", "min": -100, "max": 100, "default": 0, "label": "Highlights Blue", "unit": "", "curve": "linear"},
      "preserve_luma": {"type": "bool",  "default": true, "label": "Preserve Luminosity", "description": "Restore original brightness after color shift"},
  }
  ```
  - **Algorithm:** (ported from v1 line 627-683)
    1. Compute luminance: `luma = 0.299*R + 0.587*G + 0.114*B`
    2. Build smooth tonal masks:
       - `shadow_mask = clip((170 - luma) / 170, 0, 1) ^ 1.5`
       - `highlight_mask = clip((luma - 85) / 170, 0, 1) ^ 1.5`
       - `midtone_mask = clip(1 - shadow_mask - highlight_mask, 0, 1)`
    3. For each RGB channel: `offset = shadows * shadow_mask + midtones * midtone_mask + highlights * highlight_mask`
    4. Apply offset, clip to 0-255
    5. If preserve_luma: compute new luminance, scale to match original
    6. Preserve alpha channel

- [ ] **2.3** Create `backend/src/effects/util/auto_levels.py`
  ```python
  EFFECT_ID = "util.auto_levels"
  EFFECT_NAME = "Auto Levels"
  EFFECT_CATEGORY = "util"

  PARAMS = {
      "clip_percent": {"type": "float", "min": 0.0, "max": 25.0, "default": 1.0,
                       "label": "Clip %", "unit": "%", "curve": "exponential",
                       "description": "Percentage of extreme pixels to clip before stretching"},
  }
  ```
  - **Algorithm:**
    1. For each RGB channel: find the `clip_percent` and `100 - clip_percent` percentile values
    2. Build LUT that maps [low_percentile, high_percentile] → [0, 255]
    3. Apply LUT
    4. Preserve alpha

- [ ] **2.4** Register all new effects in `backend/src/effects/registry.py`

- [ ] **2.5** Tests:
  - `backend/tests/test_effects/test_util/test_hsl_adjust.py`
    - Default params (all zeros) → near-identity (HSV roundtrip ±5 tolerance)
    - Target 'reds' on red frame → changes frame
    - Target 'blues' on red frame → minimal change
    - Hue shift +120° on red → shifts toward green
    - Lightness +50 → brighter mean pixel value
    - Lightness -50 → darker mean pixel value
    - Alpha channel preserved
    - Determinism test
  - `backend/tests/test_effects/test_util/test_color_balance.py`
    - Default params (all zeros) → identity (exact match)
    - shadows_r +80 on dark frame → red channel increases
    - highlights_b +80 on bright frame → blue channel increases
    - Preserve luminosity → mean brightness stays within ±15
    - All params at max → no crash
    - All params at min → no crash
    - Alpha channel preserved
    - Determinism test
  - `backend/tests/test_effects/test_util/test_auto_levels.py`
    - Low-contrast frame → output has wider dynamic range
    - All-same-value frame → output unchanged (can't stretch)
    - clip_percent=0 → maps min/max pixel to 0/255
    - Alpha preserved

### Session 3: Custom Color UI Components (Frontend)
> Build the specialized editors for Levels, Curves, HSL, and Color Balance.

- [ ] **3.1** Create `frontend/src/renderer/components/effects/color/Histogram.tsx`
  - Canvas-based histogram display
  - Props: `data: {r: number[], g: number[], b: number[], luma: number[]}`, `channel: 'luma' | 'r' | 'g' | 'b' | 'all'`, `width: number`, `height: number`
  - Renders: filled area chart, semi-transparent layers when showing all channels
  - Colors: R=#ef4444, G=#22c55e, B=#3b82f6, Luma=#e5e5e5
  - Auto-scales Y axis to max bin count
  - Click to toggle between luma, all-channels, and individual channels

- [ ] **3.2** Create `frontend/src/renderer/components/effects/color/LevelsEditor.tsx`
  - Histogram backdrop (using Histogram component)
  - 5 draggable triangular handles along the bottom:
    - Input Black (left), Input Gamma (center, logarithmic position), Input White (right)
    - Output Black (left, below), Output White (right, below)
  - Channel selector tabs: Master | R | G | B
  - Drag handles → update params → live preview
  - Auto Levels button → applies `util.auto_levels` (one-click)
  - Layout: histogram (200px tall) + handles below + output range strip below that

- [ ] **3.3** Create `frontend/src/renderer/components/effects/color/CurvesEditor.tsx`
  - Canvas-based Bezier curve editor (256x256 logical space)
  - Diagonal grid lines (identity reference)
  - Histogram backdrop at low opacity
  - Channel selector tabs: Master | R | G | B | A
  - Click on curve line → add control point (up to 16 max)
  - Drag control point → move it
  - Right-click control point → delete it
  - Double-click control point → type exact x,y values
  - Curve renders as smooth Bezier (using Canvas quadraticCurveTo or custom cubic draw)
  - On change: serialize points as `[[x,y],...]` → update `points` param → live preview

- [ ] **3.4** Create `frontend/src/renderer/components/effects/color/HSLEditor.tsx`
  - 8 hue-range rows (Reds, Oranges, Yellows, Greens, Cyans, Blues, Purples, Magentas)
  - Each row: colored label + Saturation Knob (-100 to +100) + Lightness Knob (-100 to +100)
  - "All" toggle at top for global adjustment
  - Hue shift: single Knob at top (-180° to +180°)
  - Compact layout — all 8 ranges visible without scrolling

- [ ] **3.5** Create `frontend/src/renderer/components/effects/color/ColorBalanceEditor.tsx`
  - 3 sections: Shadows | Midtones | Highlights (tabs or stacked)
  - Each section: 2D color wheel OR 3 sliders (R, G, B offset -100 to +100)
  - Implementation choice: **3 Knobs per section** (simpler, matches existing Knob component)
    - Shadows: R knob, G knob, B knob
    - Midtones: R knob, G knob, B knob
    - Highlights: R knob, G knob, B knob
  - Preserve Luminosity toggle (bool)

- [ ] **3.6** Create `frontend/src/renderer/components/effects/color/BeforeAfter.tsx`
  - Hold a key (e.g., Backslash `\`) → show original frame (bypass all effects)
  - Release → show processed frame
  - Visual: brief flash transition (opacity fade, 100ms)
  - Implementation: send `render_frame` with empty chain when key held, restore on release

- [ ] **3.7** Update `frontend/src/renderer/components/effects/ParamPanel.tsx`
  - Detect `util.levels` → render `LevelsEditor` instead of generic Knobs
  - Detect `util.curves` → render `CurvesEditor` instead of generic Knobs
  - Detect `util.hsl_adjust` → render `HSLEditor` instead of generic Knobs
  - Detect `util.color_balance` → render `ColorBalanceEditor` instead of generic Knobs
  - All other effects → generic Knob/Slider panel (unchanged)
  - Fallback: if custom component fails to load, fall back to generic Knobs

- [ ] **3.8** CSS: `frontend/src/renderer/styles/color-suite.css`
  - Histogram canvas: semi-transparent overlays
  - Levels handles: triangular markers, drag affordance
  - Curves canvas: grid lines, control point circles, hover state
  - HSL rows: compact grid layout, hue-colored labels
  - Color balance sections: tabbed or stacked layout

- [ ] **3.9** Tests (frontend vitest):
  - `frontend/src/__tests__/components/effects/color/histogram.test.ts`
    - Renders canvas element
    - Channel toggle cycles through modes
    - Empty data doesn't crash
  - `frontend/src/__tests__/components/effects/color/levelsEditor.test.ts`
    - Renders 5 handles
    - Drag handle updates param value
    - Channel tab switches
  - `frontend/src/__tests__/components/effects/color/curvesEditor.test.ts`
    - Renders canvas with diagonal grid
    - Click adds control point
    - Right-click deletes control point
    - Max 16 points enforced
  - `frontend/src/__tests__/components/effects/color/hslEditor.test.ts`
    - Renders 8 hue rows
    - Knob change updates store

### Session 4: Histogram Wiring + Performance + Integration
> Wire histogram to live updates. Performance optimization. Full integration test.

- [ ] **4.1** Wire live histogram updates:
  - After every `render_frame` response, frontend sends `compute_histogram` command
  - Histogram data flows into a Zustand store slice: `useHistogramStore`
  - Histogram component reads from store, re-renders on update
  - **Throttle:** Max 10 histogram requests/second (100ms debounce) to avoid flooding

- [ ] **4.2** Create `frontend/src/renderer/stores/histogram.ts`
  ```typescript
  interface HistogramState {
    data: { r: number[]; g: number[]; b: number[]; a: number[]; luma: number[] } | null;
    isLoading: boolean;
    fetchHistogram: (path: string, time: number, chain: EffectInstance[]) => void;
  }
  ```

- [ ] **4.3** Performance optimization pass (backend):
  - Benchmark each color effect at 1080p (1920x1080x4 RGBA):
    - Target: levels < 5ms, curves < 10ms, hsl_adjust < 15ms, color_balance < 15ms
    - Total chain of all 4: < 50ms
  - Optimization strategies if too slow:
    - LUT-based effects (levels, curves): use `np.take()` — O(1) per pixel, already fast
    - HSV conversion: vectorized numpy, avoid Python loops
    - color_balance: masks computed once, applied with broadcasting
  - If `opencv-python-headless` is available: use `cv2.LUT()` (slightly faster C implementation)
  - If `scipy` is not available: fall back to `np.interp()` for curves (linear only)

- [ ] **4.4** Add dependency check in `backend/src/effects/util/__init__.py`:
  ```python
  # Optional fast paths
  try:
      import cv2
      HAS_CV2 = True
  except ImportError:
      HAS_CV2 = False

  try:
      from scipy.interpolate import PchipInterpolator
      HAS_SCIPY = True
  except ImportError:
      HAS_SCIPY = False
  ```

- [ ] **4.5** Integration test (backend):
  - `backend/tests/test_integration_color.py`
    - Load synthetic video frame
    - Apply levels → curves → hsl_adjust → color_balance chain
    - Verify output is different from input
    - Verify output is deterministic
    - Verify total processing time < 100ms at 1080p (generous margin)
    - Verify identity params produce identity output for each effect

- [ ] **4.6** Performance benchmark script:
  - `backend/src/effects/util/_benchmark.py`
  - Run each color effect 100 times at 1080p
  - Report: mean, p50, p95, p99 execution time
  - Flag any effect exceeding 20ms

- [ ] **4.7** End-to-end manual verification checklist:
  - Load a video
  - Add `util.levels` → histogram shows in Levels editor → drag black point → preview darkens
  - Add `util.curves` → S-curve control points → contrast increases → histogram reflects
  - Add `util.hsl_adjust` → target reds → desaturate → reds become gray, other colors unaffected
  - Add `util.color_balance` → boost shadows blue → dark areas get blue tint
  - Hold Backslash → see original → release → see processed
  - Export → MP4 has color corrections applied
  - All 4 effects chained → preview updates within 100ms

---

## Test Plan

### What to test
- [ ] Levels: identity params → no change; inverted output → inverts frame
- [ ] Curves: identity diagonal → no change; S-curve → more contrast
- [ ] HSL: target reds on red frame → changes; target blues on red frame → no change
- [ ] Color Balance: all zeros → identity; shadows_r on dark → red increases
- [ ] Histogram: total bins == pixel count; all-black → bin 0; all-white → bin 255
- [ ] Auto Levels: low-contrast input → expanded dynamic range
- [ ] Before/After: hold key → original; release → processed
- [ ] All 4 chained < 50ms at 1080p

### Edge cases
- [ ] Levels: input_black > input_white → handled gracefully (swap or clamp)
- [ ] Curves: 0 control points → identity (default curve)
- [ ] Curves: 16 control points → no performance degradation
- [ ] Curves: points with same X coordinate → no division by zero
- [ ] HSL: hue shift wraps around 360° → correct circular math
- [ ] HSL: all 8 ranges with max shifts simultaneously → no crash
- [ ] Color Balance: all params at ±100 → no crash, output in valid range
- [ ] Color Balance: preserve_luminosity on extreme shifts → doesn't overflow
- [ ] Histogram on 4K frame → computes within 50ms
- [ ] RGBA frame with varying alpha → alpha channel preserved by all effects
- [ ] Empty frame (0x0) → no crash (early return)
- [ ] 1x1 frame → no crash

### How to verify
- Backend: `cd backend && python -m pytest tests/test_effects/test_util/ -x --tb=short`
- Frontend: `cd frontend && npx vitest run`
- Performance: `cd backend && python -m effects.util._benchmark`
- Manual: `cd frontend && npx electron-vite dev` → load video → add color effects → verify histogram
- Expected new test count: ~60 (32 backend effect tests + 8 histogram + 5 integration + 15 frontend component)

---

## Files to Create

### Backend
```
backend/src/effects/util/__init__.py
backend/src/effects/util/levels.py
backend/src/effects/util/curves.py
backend/src/effects/util/hsl_adjust.py
backend/src/effects/util/color_balance.py
backend/src/effects/util/auto_levels.py
backend/src/effects/util/histogram.py
backend/src/effects/util/_benchmark.py
backend/tests/test_effects/test_util/__init__.py
backend/tests/test_effects/test_util/test_levels.py
backend/tests/test_effects/test_util/test_curves.py
backend/tests/test_effects/test_util/test_hsl_adjust.py
backend/tests/test_effects/test_util/test_color_balance.py
backend/tests/test_effects/test_util/test_auto_levels.py
backend/tests/test_effects/test_util/test_histogram.py
backend/tests/test_integration_color.py
```

### Frontend
```
frontend/src/renderer/components/effects/color/Histogram.tsx
frontend/src/renderer/components/effects/color/LevelsEditor.tsx
frontend/src/renderer/components/effects/color/CurvesEditor.tsx
frontend/src/renderer/components/effects/color/HSLEditor.tsx
frontend/src/renderer/components/effects/color/ColorBalanceEditor.tsx
frontend/src/renderer/components/effects/color/BeforeAfter.tsx
frontend/src/renderer/stores/histogram.ts
frontend/src/renderer/styles/color-suite.css
frontend/src/__tests__/components/effects/color/histogram.test.ts
frontend/src/__tests__/components/effects/color/levelsEditor.test.ts
frontend/src/__tests__/components/effects/color/curvesEditor.test.ts
frontend/src/__tests__/components/effects/color/hslEditor.test.ts
```

## Files to Modify

```
backend/src/effects/registry.py                         — Register util.levels, util.curves, util.hsl_adjust, util.color_balance, util.auto_levels
backend/src/zmq_server.py                               — Add compute_histogram command
frontend/src/renderer/components/effects/ParamPanel.tsx  — Route util.* effects to custom editors
frontend/src/shared/ipc-types.ts                         — Add compute_histogram command + response types
```

---

## NOT in Scope (Explicitly Excluded)

- No scopes (vectorscope, waveform monitor) — post-launch
- No color grading LUTs (.cube file import) — post-launch
- No color picker / eyedropper — Phase 11 polish
- No color wheels (2D radial picker) — using Knobs instead for simplicity
- No GPU acceleration for color tools — numpy is fast enough at 1080p
- No batch color grading across clips — single clip scope

---

## Codebase Context

### Effect Module Pattern (follow exactly)
```python
# backend/src/effects/util/levels.py

EFFECT_ID = "util.levels"
EFFECT_NAME = "Levels"
EFFECT_CATEGORY = "util"

PARAMS = {
    "input_black": {"type": "int", "min": 0, "max": 255, "default": 0, "label": "Input Black",
                    "unit": "", "curve": "linear", "description": "..."},
    ...
}

def apply(frame, params, state_in, *, frame_index, seed, resolution):
    output = frame.copy()
    # ... process RGB, preserve alpha ...
    return output, None  # All color tools are stateless
```

### Registration Pattern
```python
# backend/src/effects/registry.py
from effects.util.levels import (
    EFFECT_CATEGORY as levels_category,
    EFFECT_ID as levels_id,
    EFFECT_NAME as levels_name,
    PARAMS as levels_params,
    apply as levels_apply,
)
register(levels_id, levels_apply, levels_params, levels_name, levels_category)
```

### Custom UI Routing Pattern (new for Phase 3)
```typescript
// frontend/src/renderer/components/effects/ParamPanel.tsx
const CUSTOM_EDITORS: Record<string, React.ComponentType<{effectId: string}>> = {
  'util.levels': LevelsEditor,
  'util.curves': CurvesEditor,
  'util.hsl_adjust': HSLEditor,
  'util.color_balance': ColorBalanceEditor,
};

// In render:
const CustomEditor = CUSTOM_EDITORS[selectedEffect.effectId];
if (CustomEditor) return <CustomEditor effectId={selectedEffect.id} />;
// else: render generic Knob panel
```

### v1 → v2 Porting Checklist
For each color effect ported from v1:
1. Change function signature to match `apply()` contract
2. Change input from `(H,W,3)` RGB to `(H,W,4)` RGBA — preserve alpha
3. Extract params from `params` dict instead of individual args
4. Add `EFFECT_ID`, `EFFECT_NAME`, `EFFECT_CATEGORY`, `PARAMS` module-level constants
5. Return `(output, None)` tuple (all color tools are stateless)
6. Add `curve` and `unit` fields to every param
7. Remove `cv2` hard dependency — use numpy fallback, cv2 as optional speedup
