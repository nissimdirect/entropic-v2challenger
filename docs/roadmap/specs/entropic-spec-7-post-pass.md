# SPEC-7 — Post-Pass Items (A4/C4/A5 spectral PRDs + SG-7 codec timeout)
*Written 2026-06-03 · cleanup pass · ships the 4 items SPEC-1 §11 flagged as post-pass*

> SPEC-1 §11 enumerated 4 items that fell outside the main 6-spec pass: A4 Spectral Frame Warper, C4 Spectral-Band-Isolated Effects, A5 Spectral Granulator, and SG-7 Codec Timeout. None are in the Creatrix BUILD plan. This doc closes them as standalone PRDs.

---

## 1. Why these are in a separate spec

| Item | Why not in main pass |
|---|---|
| **A4 Spectral Frame Warper** | Vision Tier 2 deliverable; Creatrix has no equivalent; needs its own PRD before any Tier 2 shader work |
| **C4 Spectral-Band-Isolated Effects** | Universal wrapper applicable to many effects; depends on A4's DCT infrastructure; not in Creatrix B6-B10 |
| **A5 Spectral Granulator** | Variant of A1 Granulator (B8 in Creatrix) but with spectral-band grains instead of pixel-region grains |
| **SG-7 Codec Timeout** | Acknowledged in SPEC-3 §6 as "lightweight, ship anytime" — never got its own contract |

---

## 2. A4 — Spectral Frame Warper

### 2.1 Problem

No effect today manipulates a frame's spatial-frequency content parametrically. Blur and sharpen are end-cases; the entire middle space (per-band manipulation, recursive F-modulation, formant-style envelope detach) is unexplored. Vital's spectral oscillator is unmatched in video.

### 2.2 Scope

Effect family with 6 primitives, each running on post-decode DCT (default) or FFT/wavelet (per-effect opt-in per Round-1 Q1):

| Primitive | What it does | Math |
|---|---|---|
| **shift** | Translate F-coefficients along the freq axis | `F'(u,v) = F(u-Δu, v-Δv)` |
| **comb** | Periodic spectral notches at modulatable spacing | `F'(u,v) = F(u,v) · cos²(2π · u / period)` |
| **smear** | Phase-scramble within a frequency band | `F'(u,v) = |F(u,v)| · e^(iφ_random)` for `u,v ∈ band` |
| **formant** | Separate low-freq "envelope" from high-freq "texture"; manipulate independently | Split-band; lift envelope by 2 octaves; recombine |
| **parity** | Boost only even or odd F-coefficients | `F'(u,v) = F(u,v) · (1 + α · parity(u+v))` |
| **inversion** | Swap high/low band weights | `F'(u,v) = F(u_max-u, v_max-v) · scale` |

All params automatable on any axis including F itself (recursive — F-modulating-F). Per Round-1 decision: per-effect basis selection (DCT default; FFT for global; wavelet when SPEC-3 SG-1 ships + multi-scale needed).

### 2.3 Architecture fit

- New effect category `spectral/` in `backend/src/effects/`
- 6 effects under it: `spectral_shift`, `spectral_comb`, `spectral_smear`, `spectral_formant`, `spectral_parity`, `spectral_inversion`
- Reuses existing pure-function effect contract `(frame, params, state_in) → (result, state_out)`
- DCT via `cv2.dct` (OpenCV native); FFT via `cv2.dft`; wavelet via PyWavelets (new dep, only loaded if wavelet basis chosen)
- GPU acceleration via SG-1 codegen path (Tier 2 dependency)

### 2.4 Cost

**M** (2–4 sprints). 6 effects × ~80 LoC each + shared DCT helper + tests. Most cost is in the multi-band variant (C4) which builds on A4.

### 2.5 Dependencies

- Q1 (F basis) — decided per-effect, DCT default
- SG-1 (GPU resource lifetime) — for GPU-accelerated paths
- New oracle templates for each spectral primitive

### 2.6 Acceptance criteria

- [ ] Six effects registered + appear in browser
- [ ] Each shows visibly distinct transformation of mid-detail content
- [ ] DCT path verified against analytical reference (round-trip identity test)
- [ ] FFT and wavelet paths opt-in via per-effect param
- [ ] Recursive F-modulation works (F output → F input on next frame, bounded by feedback clamp)
- [ ] Oracle suite covers each effect
- [ ] Perf: <100ms per effect at 1080p on M1 Pro CPU; <30ms with SG-1 GPU path

---

## 3. C4 — Spectral-Band-Isolated Effects

### 3.1 Problem

Every effect today acts on the whole frame. No way to apply blur, displacement, color shift, or anything else to ONLY a specific spatial-frequency band. "Touch only the mids" / "blur only high detail" / "shift only low-freq texture" — all unreachable as primitives.

### 3.2 Scope

Universal effect wrapper: takes any existing effect + a band selector + applies the effect ONLY to that band's contribution, mixed back with unaffected bands.

```ts
interface BandIsolatedEffect {
  type: 'band_isolated'
  inner_effect: EffectInstance        // any registered effect
  band_low: number                    // [0..1] of Nyquist
  band_high: number                   // [band_low..1] of Nyquist
  basis: 'dct' | 'fft' | 'wavelet'    // per-effect choice
  mix_back: 'replace' | 'add' | 'subtract'  // how to recombine
}
```

Multi-band variant: 5 parallel band-isolated instances of the same effect, each with own band + own params, summed. Means you can drive different bands with different modulation streams.

### 3.3 Architecture fit

- Chain-transform wrapper pattern (PR #36 lineage in Creatrix)
- Available on any effect via right-click "Isolate to band…"
- Multi-band variant ships as its own effect type `band_isolated_multi`

### 3.4 Cost

**L** (1–3 mo). Wrapper infrastructure + UI for band picker + multi-band variant + perceptual band labeling ("rough / mid-detail / edges / smooth") + tests across 20+ effects to verify the wrapper composes.

### 3.5 Dependencies

- A4 (DCT/FFT/wavelet infrastructure must exist first)
- SG-1 (GPU codegen for performance-critical bands)
- Q1 (basis selection convention)

### 3.6 Acceptance criteria

- [ ] Blur applied to F ∈ [0.2, 0.4] keeps edges + gradients intact; blurs only mid-detail
- [ ] Multi-band variant: 5 parallel band-blurs at different bands produce 5 visibly distinct contributions
- [ ] Multi-band variant: changing one band's param doesn't bleed into others
- [ ] Band selector UI shows perceptual labels (rough/mid/edge/smooth) alongside numeric F values
- [ ] Wrapper composes with at least 20 existing effects without bugs
- [ ] Perf: wrapped effect ≤ 1.5× cost of unwrapped (DCT/iDCT overhead amortized)

---

## 4. A5 — Spectral Granulator

### 4.1 Problem

Granulators today slice in pixel space (T, Y, X). Spatial-frequency slicing produces fundamentally different texture; not exposed anywhere. Identity-preservation curve over grain density is the unique signature.

### 4.2 Scope

Specialization of A1 Granulator (Creatrix B8). Grains are spectral-band SLICES of frames, not pixel-region slices.

- Each grain = `{frame_t, band_low, band_high, envelope, position_in_output}`
- Reassembled spatially as overlapping textured patches
- Identity preserved at low density (~10 grains/frame): viewer recognizes source
- Dissolves into pure spectral texture at high density (~100+ grains/frame)
- Smooth perceptual transition across the density range

### 4.3 Architecture fit

- Lives in `backend/src/instruments/granular_spectral.py` (variant of `granular_video.py` from Creatrix B8)
- Shares UI with A1/B8 (mode flag switches grain-domain)
- Multi-basis support (wavelet preferred for multi-scale grain quality)

### 4.4 Cost

**M** (2–4 sprints). Mostly reuses A1's grain rendering + adds spectral band selector. Wavelet integration adds dep weight.

### 4.5 Dependencies

- A1 (Granulator-for-Video; Creatrix B8)
- A4 (Spectral primitives infrastructure)
- Q1 (basis selection)

### 4.6 Acceptance criteria

- [ ] Spectral-grain render of a face video retains identity at density 10/frame
- [ ] Loses identity at density 100/frame
- [ ] Smooth perceptual transition between
- [ ] Wavelet basis produces visibly different grain texture than DCT
- [ ] Render budget: same as A1 (200 grains/frame on GPU)

---

## 5. SG-7 — Codec / Decode Timeout

### 5.1 Why

PyAV decode can hang on malformed input — bad header, corrupted frame index, truncated stream. Existing Entropic has sidecar respawn to recover but UI freezes during. Untrusted `.dna` patches referencing corrupt source files = guaranteed reproducible freeze. Lightweight gate; trivial to ship.

### 5.2 Contract

Every PyAV `av.open(...)` + `to_ndarray(...)` + container probe wrapped with timeout:

```python
# backend/src/video/codec_timeout.py (new)

DEFAULT_DECODE_TIMEOUT_SECONDS = 5.0

class CodecTimeoutError(Exception):
    """Raised when a decode operation exceeds the timeout."""
    def __init__(self, asset_path: str, operation: str, elapsed_s: float):
        self.asset_path = asset_path
        self.operation = operation
        self.elapsed_s = elapsed_s
        super().__init__(f"Decode timeout: {operation} on {asset_path} exceeded {elapsed_s:.1f}s")

@contextmanager
def codec_timeout(operation: str, asset_path: str, seconds: float = DEFAULT_DECODE_TIMEOUT_SECONDS):
    """
    Wrap a PyAV operation with a timeout. Uses threading + signal.SIGALRM for hard interrupt.
    Caller catches CodecTimeoutError + emits user-facing toast + skips the corrupt asset.
    """
    timer = threading.Timer(seconds, _interrupt_decode_thread)
    timer.start()
    start = time.monotonic()
    try:
        yield
    finally:
        elapsed = time.monotonic() - start
        timer.cancel()
        if elapsed > seconds:
            raise CodecTimeoutError(asset_path, operation, elapsed)
```

### 5.3 Apply at

- `backend/src/video/reader.py` — `av.open` calls in `_probe`, `_decode_with_seek`, `_decode_sequential`
- `backend/src/engine/export.py` — encoding `mux.write` calls
- `backend/src/effects/` — any per-effect direct codec access (rare; should be none)

### 5.4 CI test

```python
def test_decode_timeout_on_truncated_file(tmp_path):
    truncated = tmp_path / "truncated.mp4"
    truncated.write_bytes(b"\x00\x00\x00\x18ftypmp42")  # valid header, no body
    with pytest.raises(CodecTimeoutError):
        with codec_timeout("probe", str(truncated), seconds=1.0):
            av.open(str(truncated))  # hangs without timeout

def test_decode_timeout_does_not_affect_healthy_files():
    healthy = "test_assets/healthy_clip.mp4"
    with codec_timeout("probe", healthy, seconds=5.0):
        container = av.open(healthy)
        container.close()
    # No exception
```

### 5.5 Owner

**Either session.** Lightweight enough to ship as a single small PR (~150 lines + tests). Vision session can take it without coordinating since it's a backend-only hardening with no Creatrix conflicts.

### 5.6 Cost

**XS** (≤ 1 day). Single new file + ~5 call-site wraps + tests.

---

## 6. Build sequencing for these 4 items

| When | Ship |
|---|---|
| Anytime (independent) | SG-7 — pure backend hardening, no Creatrix conflict |
| After SG-1 lands (Tier 2 unblocked) | A4 Spectral Frame Warper |
| After A4 lands | C4 Spectral-Band-Isolated Effects |
| After A1 (Creatrix B8) + A4 land | A5 Spectral Granulator |

---

## 7. Updated SPEC-1 status (post-pass)

Replaces the stale "pending" table in SPEC-1 §11:

| Spec | Status |
|---|---|
| SPEC-1 Crosswalk | ✅ Done |
| SPEC-2 B4-lite schema (INJ-5) | ✅ Done (filed in Creatrix PR-INJECTIONS.md) |
| SPEC-3 Safety gates (SG-1/3/5/8) | ✅ Done |
| SPEC-4 Demo trilogy | ✅ Done (+ stubs at `~/.claude/plans/demo-trilogy-stubs/`) |
| SPEC-5 Multi-headed L backbone | ✅ Done |
| SPEC-6 `.dna` format + lint | ✅ Done |
| SPEC-7 Post-pass items (A4/C4/A5/SG-7) | ✅ Done (this doc) |
| History buffer validation | ✅ Done (`entropic-history-buffer-validation.md`) |

All structural specs accounted for. Next: implementation pass starting with whichever non-blocking item the user picks.
