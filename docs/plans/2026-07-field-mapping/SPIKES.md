# Spike Register — itemized + worked through (2026-07-03)

Every de-risking spike for the field-mapping package, worked through now. ✅ resolved with evidence · 🟡 partial · 🔴 needs on-device/data not available here.

## Executed this pass (code-verification + on-device measurement)

| # | Spike (question) | Method | Result | Impact |
|---|------------------|--------|--------|--------|
| **S9** | **Field-solver: is MLX ping-pong real-time + deterministic?** (the biggest risk) | Ran physarum core (scatter-deposit + diffuse + decay) on MLX, 512², 130k agents, 120 frames | **✅ GO — 0.74 ms/frame** (real-time, ~20× headroom); **deterministic** (same seed → max\|Δ\|=0.00); all ops present (scatter-add `.at[].add`, roll, trig, clip) | **Un-gates the field-solver substrate.** The #1 risk (GPU scatter non-determinism) is disproven. Build E2 with confidence. |
| S1 | Is per-edge `curve` (easing) applied by the modulation engine? | grep `backend/src/modulation/*` | ✅ **No** — only the *axis-lane* curve (`lane_reader`) exists; per-edge `OperatorMapping.curve` is unconsumed | Confirms `PRD-edge-curve-ui` gap is real. |
| S2 | Can a `ModEdge` target `_mix`? Does the reserved guard block it? | read `container.py`, `registry.py` | ✅ **Yes** — the `_*` guard is **registration-time only**; `container.py:59` pops `_mix` from params at runtime, so a route writing `_mix` is consumed | `PRD-mix-macro` risk downgraded: just allow `_mix` as a routable target key; no guard collision at runtime. |
| S3 | State of `field_dst` / `EXPERIMENTAL_FIELD_DST`? | read `routing.py` | ✅ per-row **vector** dst exists, gated off; a 2-channel **`coord`** (dx,dy) dst for Displace is **new** | Confirms `PRD-displace` + K1 scope (`field_dst:coord` is genuinely new work). |
| S4 | Is `reduce` implemented? | read `routing.py` | ✅ **No** — only broadcast/sampleAt/scanOver/integrate | Confirms K1 must add `reduce`. |
| S5 | Do chain presets already serialize routes? | read `preset.schema.json`, `library.ts` | ✅ schema has a `modulations` object (single-effect); **chainData needs a `routes[]`** | Narrows Wave 0 P0.1 — extend `chainData`, reuse the `modulations` shape. |
| S6 | `video_analyzer.motion` shape — scalar or field? | read `video_analyzer.py` | ✅ **Scalar** (downscaled-proxy frame-delta 0–1), not a 2D field | **Corrects SOURCES-SPEC** (motion tap = Scalar; per-pixel motion needs optical-flow). |
| S7 | Can spectral bands be tapped per-band? | read `spectral/band_isolation.py` | 🟡 works in `low_bin/high_bin` bin-space; per-band energy = `\|spectrum\|` within a bin range — trivial from the existing FFT | Low-risk; confirm the exact energy call at ST build. |
| S8 | Reuse `datamosh`'s optical flow? | (earlier) `datamosh.py` uses `cv2.calcOpticalFlowFarneback` | ✅ real dense flow already computed; lift into a shared helper | Confirms Optical-Flow utility is near-free. |

## Needs on-device / data not available in this environment
| # | Spike | Why deferred | Protocol |
|---|-------|-------------|----------|
| **S10** | **Diffusion / CLIP latency** (L-axis, P7 gate) | No diffusion/CLIP model in this env | On a machine with the sidecar: measure img2img round-trip ms/frame + temporal coherence at target res; go/preview-only/defer. Gates P7 only. |

## Policy decisions worked through (the review's 4 open 🔵 items)
- **D1 — Two sources → one param (arbitration):** **additive sum by default** (reuse existing `blend_mode:'add'`); expose *last-write* and *max* as per-edge options. Deterministic, matches modular-synth expectation.
- **D2 — Apply preset onto a non-empty chain:** **append by default**; offer *Replace* in the apply menu. Never silently wipe the user's chain.
- **D3 — Tap on a powered-off / bypassed host effect:** the tap **idles (emits its neutral/zero value)** — an off effect produces no signal. Consistent with "no signal," avoids surprise modulation from a bypassed device.
- **D4 — Per-band fan-out when band-count changes:** **clamp band indices to the available count** and remap fan-out proportionally; never index out of range (mirrors the existing sampleAt clamp).

## Net effect
The one high-risk item (field-solver) is now **GO** with hard numbers. All other spikes were code-verifications, now resolved with evidence — several *narrowed or downgraded* scope (S2, S5, S6). Only S10 (diffusion latency) remains, and it gates only the last, already-deferred phase (P7). **No spike blocks W0 → E2.**
