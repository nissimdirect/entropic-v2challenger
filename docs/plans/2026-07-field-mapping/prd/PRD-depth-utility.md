# PRD — Depth Utility

> **Immutable stakeholder input** (exact quotes):
> - "i like the depth as a modulation source"
> - "the depth map and structure tensor are very cool on their own make sure that we can actually have that as an output independently"
> - "things like that are cool"
>
> _Type:_ utility (field producer, vision) · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1); ONNX sidecar
> _Skill owners:_ /cto + /mad-scientist (vision/AI) + /cdo (viz output)

## 1. Problem / why
A monocular depth map turns a flat frame spatially aware — and it's a **striking output on its own** (the inferno map) *and* the modulation source the user singled out. Expose it as a first-class Utility: viewable output, modulation source, and mask.

## 2. What it does (scope)
- Estimates per-pixel depth from the frame (DepthAnything v2 via ONNX→sidecar; **classical defocus/luminance depth as a v0** to unblock while the model lands).
- **Output:** depth map (inferno / grayscale / banded) as a viewable effect. *(Satisfies "have it as an output independently.")*
- **Source (the headline):** preset routings — **Blur (rack focus / DoF)**, **Displace (parallax)**, **Saturation (aerial)**, and combos. Focal plane is itself mappable (`focal ← audio.rms` = focus on the beat).
- **Mask:** foreground/background gate (paint FG / mosh BG).
- **Out of scope:** point-cloud 3D lift (separate); ControlNet conditioning (L-axis phase); multi-view/true 3D.

## 3. Composable parts
- Inference reuses the **RVM ONNX sidecar path** (proven) — same plumbing, new model. 🔒
- Registers as a field-source Utility (K1); field cache in `field_source.py`.
- Rack-focus = `Depth → blur.radius` via the existing blur effect param + `remap(curve)`; no new effect.

## 4. The three surfaces
- **Preset:** "Rack focus", "Parallax wiggle", "Aerial fade" compositions.
- **Suggested:** on the Depth node — "route out ▸ Blur (DoF) · Displace (parallax) · Saturation (aerial) · Mask (FG/BG)".
- **Full:** model size, near/far clip, focal + range params; per-edge curve/depth in the matrix.

## 5. Design / architecture
- Sidecar returns a float depth (H,W)∈[0,1]; cached, triple-use. Determinism: model output is deterministic per-frame → parity holds; flag as model-dependent for render-mode.
- v0 classical depth (defocus/luma) is deterministic + dependency-free; ship behind the same Utility, model as a param ("estimator: classical | DepthAnything").

## 6. Acceptance criteria (oracle)
- [ ] `fx.depth` (v0 classical) registers + renders a depth output (smoke).
- [ ] Rack-focus preset: `Depth → blur.radius` materializes a valid `ModEdge`, round-trips save/load.
- [ ] Focal-plane mappable: `audio.rms → focal` drives focus (A/B).
- [ ] Sidecar path: DepthAnything loads, returns depth, no crash on missing model (falls back to classical + toast).
- [ ] Depth-as-mask gates an effect (FG/BG) — mask multiply test.

## 7. Risks / open 🌱
- ONNX sidecar cost/latency — measure; classical v0 de-risks the schedule.
- Depth flicker frame-to-frame (temporal) — may need EMA smoothing (reuse the coherence trick from Kuwahara motion).
- 🌱 Should near/far be auto-normalized per-frame or held? Per-frame default, "lock range" toggle for stable rack focus.

## 8. Ancillary wins
The depth map is PopChaos promo/album-art material on its own; one model unlocks DoF + parallax + gating + (later) 3D lift + ControlNet; RVM plumbing reused.
