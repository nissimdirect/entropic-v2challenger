# PRD — Self-Steering Distortion

> **Immutable stakeholder input** (exact quotes):
> - "ok i like all of them lets build"
> - (A1, the mad-scientist swing the user greenlit) "self-steering distortion"
>
> _Type:_ effect · _Status:_ 🟢 drafted · _Depends on:_ Structure-Tensor Utility + Displace destination
> _Skill owners:_ /cto + /mad-scientist

## 1. Problem / why
The image's own structure tensor (free from Kuwahara) can drive its own warp — the frame flows *along its own grain* (liquid-metal, marbled). Genuinely novel (the distortion field IS the image) and nearly free once Tensor + Displace exist. Mocked and validated.

## 2. What it does (scope)
- Feedback effect: each frame, compute the tensor, advect the state along θ (magnitude ∝ coherence), re-inject a fraction of the source so it evolves rather than washes out.
- Params: speed, coherence weighting, re-inject amount, animate (speed LFO).
- **Out of scope:** it's really a *preset composition* of Tensor → Displace (feedback) — ship it both as a one-node effect AND a saved composition (transparency).

## 3. Composable parts 🔒
- = Structure-Tensor Utility (source) + Displace (destination) + feedback (backward edge, 1-frame) + source re-inject.
- Reuses `remap_frame`; stateful (the warped buffer).

## 4. Acceptance criteria (oracle)
- [ ] Warp direction follows θ (pixel-diff vs a random-field control).
- [ ] Re-inject keeps it stable over N frames (doesn't wash to grey — measured mean-variance floor).
- [ ] Determinism/parity (deterministic tensor + deterministic warp).
- [ ] Shipping as a composition == the one-node effect (same output — transparency check).

## 5. Risks / open 🌱
- Wash-out / runaway feedback — re-inject + clamp; tune defaults so it's alive at defaults.
- 🌱 Expose as pure composition vs packaged effect — do both; the packaged one is the discoverable front door, the composition is the editable version.

## 6. Ancillary wins
Free rider on Tensor+Displace; a striking standalone look and a demonstration of the whole field→displacement thesis; the tensor is already computed for Kuwahara.
