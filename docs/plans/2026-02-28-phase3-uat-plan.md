# Phase 3 Color Suite — UAT Plan

> **Date:** 2026-02-28
> **Author:** UAT Agent
> **Scope:** Phase 3 acceptance criteria verification, regression, integration, performance
> **Excludes:** Tests already in `test_qa_gauntlet.py`, `test_integration_color.py`, `test_all_effects.py`

---

## 1. Acceptance Criteria Coverage Matrix

| AC# | Criterion | Covered By Existing Tests? | UAT Gap? |
|-----|-----------|---------------------------|----------|
| AC1 | `util.levels` — 5-point control with per-channel mode | QA gauntlet has partial per-channel (blue only). Missing: red, green channels; shadow/midtone/highlight semantics via 5-point tuning | YES |
| AC2 | `util.curves` — Bezier per channel (RGBA + Master), min 16 points | QA gauntlet has alpha + green + blue channels; missing: red channel, 16-point stress test, cubic vs linear comparison | YES |
| AC3 | `util.hsl_adjust` — Per-hue sat/lightness (8 hue ranges) | QA gauntlet has reds (implicit), all, and unknown. Missing: all 8 named hue ranges verified individually | YES |
| AC4 | `util.color_balance` — Shadow/Midtone/Highlight wheels | QA gauntlet has shadows warm + preserve_luma. Missing: midtone-only and highlight-only isolation, all 3 zones simultaneously | YES |
| AC5 | Histogram display (luma + per-channel) | QA gauntlet has 1x1, gradient, luma accuracy. Missing: large frame histogram sum invariant, histogram after each individual effect | YES |
| AC6 | All tools non-destructive (`util.*`) and stack with effects | Integration test chains color effects. Missing: color + glitch effect stacking (fx.* + util.*) | YES |
| AC7 | Preview updates within 100ms at 1080p | Integration has chain < 100ms. Missing: individual effect timing, 720p baseline | YES |
| AC8 | Before/after toggle | Frontend-only feature. Cannot test programmatically. | MANUAL |
| AC9 | Auto-levels one-click (percentile clipping) | QA gauntlet has edge cases. Missing: visual correctness on known gradient, moderate clip values | YES |

---

## 2. UAT Test Scenarios

### 2.1 AC1: Levels — Full 5-Point Verification

**Not covered by QA gauntlet:** Per-channel R and G modes, combined 5-point parameter tuning, output range mapping accuracy.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-L1 | Levels channel='r': modify only red | Green and blue channels unchanged, red modified | `np.array_equal` on unchanged channels |
| UAT-L2 | Levels channel='g': modify only green | Red and blue channels unchanged | `np.array_equal` on unchanged channels |
| UAT-L3 | 5-point combined: input_black=20, input_white=230, gamma=1.5, output_black=10, output_white=240 | All pixels remapped within [10, 240] output range | `result[:,:,:3].min() >= 10` and `max() <= 240` |
| UAT-L4 | Gamma < 1.0 brightens midtones | Mean pixel value increases on mid-gray frame | `result.mean() > input.mean()` |
| UAT-L5 | Gamma > 1.0 darkens midtones | Mean pixel value decreases on mid-gray frame | `result.mean() < input.mean()` |

### 2.2 AC2: Curves — Multi-Point and Channel Completeness

**Not covered by QA gauntlet:** Red channel isolation, 16-point curve, cubic vs linear difference.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-C1 | Curves channel='r': invert red only | Green, blue, alpha unchanged; red inverted | `np.array_equal` on non-red channels |
| UAT-C2 | 16-point curve (acceptance minimum) | No crash, valid output | Shape/dtype check |
| UAT-C3 | 32-point curve (stress beyond minimum) | No crash, valid output | Shape/dtype check |
| UAT-C4 | Cubic vs linear interpolation produce different results | Same points, different interpolation, different output | `not np.array_equal(cubic, linear)` |
| UAT-C5 | S-curve (darken shadows, brighten highlights) | Dark pixels get darker, bright pixels get brighter | Compare mean of dark/bright regions |
| UAT-C6 | Inverse curve: [[0,255],[255,0]] inverts image | Result is a negative of the input | `result[px] == 255 - input[px]` on master channel |

### 2.3 AC3: HSL — All 8 Hue Ranges

**Not covered by QA gauntlet:** Individual verification of all 8 named hue ranges.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-H1 | target_hue='reds', hue_shift=60 on red frame | Red pixels shift toward yellow | Hue of output in expected range |
| UAT-H2 | target_hue='greens', saturation=-100 on green frame | Green desaturates, other colors unaffected | Green pixels become gray |
| UAT-H3 | target_hue='blues', lightness=50 on blue frame | Blue brightens | Value increases |
| UAT-H4 | All 8 hue ranges individually: no crash on colored frame | Valid output for each | Shape/dtype for all 8 |
| UAT-H5 | Hue shift wraps around 360 correctly | hue_shift=350 on hue=20 wraps to 10 | Output hue near expected |
| UAT-H6 | Lightness +100 on dark frame produces brighter output | Pixel values increase | Mean increases |
| UAT-H7 | Lightness -100 on bright frame produces darker output | Pixel values decrease | Mean decreases |

### 2.4 AC4: Color Balance — Zone Isolation

**Not covered by QA gauntlet:** Midtone-only and highlight-only adjustments, simultaneous 3-zone adjustments.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-CB1 | Midtones-only adjustment on mid-gray frame | Visible color shift | Frame changes |
| UAT-CB2 | Highlights-only adjustment on bright frame | Visible color shift on highlights | Frame changes |
| UAT-CB3 | Shadows adjustment has minimal effect on bright pixels | Bright areas largely unchanged | Max pixel diff in bright region < threshold |
| UAT-CB4 | Highlights adjustment has minimal effect on dark pixels | Dark areas largely unchanged | Max pixel diff in dark region < threshold |
| UAT-CB5 | All 3 zones simultaneously | Valid output, all channels affected | Frame changes, dtype ok |
| UAT-CB6 | preserve_luma=True vs False produce different results | Luminance is closer to original with preserve_luma=True | Compare luma diff |

### 2.5 AC5: Histogram Correctness

**Not covered by QA gauntlet:** Histogram total invariant on larger frames, histogram channel consistency after effects.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-HI1 | Histogram pixel count equals H*W for each channel | Sum of all bins == pixel count | `sum(hist['r']) == H*W` |
| UAT-HI2 | Histogram after levels shows shifted distribution | Black-crushed input has bins concentrated lower | Histogram peak position changes |
| UAT-HI3 | Histogram of all-same-value frame has single spike | One bin == pixel_count, rest == 0 | Exactly 1 nonzero bin per channel |

### 2.6 AC6: Non-Destructive Stacking with Glitch Effects

**Not covered by any existing test:** Color effects chained with `fx.*` glitch effects.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-S1 | levels -> pixelsort: color correction then glitch | Valid output, different from either alone | Shape/dtype, not equal to input |
| UAT-S2 | pixelsort -> curves: glitch then color correction | Valid output | Shape/dtype |
| UAT-S3 | hsl_adjust -> blur -> color_balance: mixed chain | Valid output | Shape/dtype |
| UAT-S4 | All 5 color effects + 2 glitch effects (7-effect chain) | No crash, valid output | Shape/dtype check |
| UAT-S5 | Order matters: A->B != B->A for color+glitch | Different results for reversed order | `not np.array_equal` |

### 2.7 AC7: Performance Benchmarks

**Not covered by QA gauntlet:** Individual effect timing, 720p baseline.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-P1 | Each color effect individually at 720p (1280x720) < 50ms | Under 50ms each | `time.perf_counter()` |
| UAT-P2 | Each color effect individually at 1080p (1920x1080) < 100ms | Under 100ms each | `time.perf_counter()` |
| UAT-P3 | All 5 color effects chained at 1080p < 100ms | Chain under acceptance limit | Timing |
| UAT-P4 | Histogram computation at 1080p < 20ms | Histogram is fast utility | Timing |

### 2.8 AC9: Auto-Levels Visual Correctness

**Not covered by QA gauntlet:** Moderate clip values, gradient correctness.

| Test | What | Expected | Verify |
|------|------|----------|--------|
| UAT-AL1 | Auto-levels with clip_percent=5.0 on narrow-range frame | Output range wider than input range | `max - min` comparison |
| UAT-AL2 | Auto-levels on already-full-range frame with clip=0 | No change (identity) | `np.array_equal` |
| UAT-AL3 | Auto-levels preserves alpha channel | Alpha unchanged | `np.array_equal(result[:,:,3], input[:,:,3])` |

---

## 3. Regression Scenarios

### 3.1 Phase 1 Regression (Core Pipeline)

| Test | What | Verify |
|------|------|--------|
| UAT-R1 | All fx.* effects still pass with default params | `test_all_effects.py` passes |
| UAT-R2 | Effect registry has all expected effects registered | Count matches expected |

### 3.2 Phase 2B Regression (Audio)

Audio is frontend/native — cannot verify programmatically from backend tests. Mark as MANUAL.

### 3.3 Bug Fix Regression (F-2, M-1, M-2)

| Test | What | Verify |
|------|------|--------|
| UAT-R3 | Export thread safety (F-2) | Run `test_qa_gauntlet.py::TestExportJobThreadSafety` |
| UAT-R4 | Error sanitization (M-2) | Run `test_qa_gauntlet.py::TestErrorSanitization` |

---

## 4. Effect Contract Compliance

| Test | What | Verify |
|------|------|--------|
| UAT-EC1 | All 6 color modules have EFFECT_ID, EFFECT_NAME, EFFECT_CATEGORY, PARAMS | Attribute existence check |
| UAT-EC2 | All apply() functions follow the contract signature | Callable with (frame, params, state_in, *, frame_index, seed, resolution) |
| UAT-EC3 | All effects are stateless (return None as state_out) | `state_out is None` for all |
| UAT-EC4 | No effect mutates the input frame | `input_copy == input_after_call` |
| UAT-EC5 | All effects handle empty frame (0-size) gracefully | No crash on `np.zeros((0,0,4))` |

---

## 5. Items Requiring Manual UAT

| Item | Why |
|------|-----|
| AC8: Before/after toggle | Frontend-only (hold key to see original) |
| Real-time histogram overlay | Frontend rendering |
| Phase 2B audio regression | Native PortAudio / Electron IPC |
| Preview update responsiveness feel | Subjective latency perception |

---

## 6. Review Notes

**Self-Review (2026-02-28):**

1. **Gap found:** QA gauntlet tests levels per-channel for blue only. UAT adds red and green to complete coverage.
2. **Gap found:** No test verifies all 8 HSL hue ranges. UAT-H4 covers all 8 individually.
3. **Gap found:** No test chains color effects with glitch effects. UAT-S1 through S5 address this.
4. **Gap found:** Individual effect performance timing is missing. Only chain timing exists.
5. **Gap found:** Effect contract compliance is not explicitly tested for color effects. UAT-EC1 through EC5 address this.
6. **Coverage adequate:** NaN/Inf/boundary already well-covered by QA gauntlet. No duplication needed.
7. **Coverage adequate:** Identity params already covered in `test_integration_color.py`. No duplication.
8. **Added:** Input frame mutation check (UAT-EC4) — important contract rule not tested anywhere.
9. **Added:** Hue wrapping (UAT-H5) — edge case at 360-degree boundary.
10. **Decision:** Mark performance tests as `@pytest.mark.perf` to allow skipping in fast CI runs.

**Total new UAT tests: ~45 (excludes duplicates with existing suites)**
