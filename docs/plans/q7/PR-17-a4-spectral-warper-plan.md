# PR #17 — A4 Spectral Frame Warper PRD + scaffold

Per SPEC-7 §A4. Six spectral primitives operating on frame DCT (default; FFT/wavelet opt-in): shift, comb, smear, formant, parity, inversion. Ships as Vision Tier 2 effect; uses SG-1 GPUResourcePool when Metal lands.

## Six primitives

| Primitive | DSP analog | Vision effect |
|---|---|---|
| **shift** | freq-translation | colors slide across spectral bands |
| **comb** | comb filter (peak/notch every Nth bin) | rhythmic frequency dropouts |
| **smear** | spectral smoothing | low-pass-like blur in frequency |
| **formant** | spectral envelope warp | preserves pitch, changes "color" of an image |
| **parity** | flip every other bin | alternating-band emphasis |
| **inversion** | freq-reverse | high frequencies swap with low (psychedelic) |

## Scope (PR #17 — scaffold tier)

- Pure-Python NumPy reference implementations (CPU fallback)
- DCT-based default; FFT opt-in via `transform='fft'` param
- Test vectors verify each primitive against synthetic input
- NO Metal/MLX integration yet (lands when GPU codegen does)

## Files

- `backend/src/effects/spectral/__init__.py` — package
- `backend/src/effects/spectral/dct_warper.py` — DCT-based primitives
- `backend/src/effects/spectral/fft_warper.py` — FFT-based primitives (opt-in)
- `backend/src/effects/spectral/primitives.py` — public API: warp_frame(frame, primitive, params, transform='dct')
- `backend/tests/test_q7_benchmark/test_spectral_warper.py` — per-primitive tests

## Acceptance criteria

- Each primitive produces non-zero L1 distance from input on a non-flat frame
- DCT and FFT paths produce SIMILAR (not identical) results on the same input — both reduce spatial-frequency content according to the primitive
- `transform='auto'` picks DCT for performance
- All ops preserve frame shape (HxWx3) and dtype (uint8)

## Effort

~90 min — NumPy DSP + tests.
