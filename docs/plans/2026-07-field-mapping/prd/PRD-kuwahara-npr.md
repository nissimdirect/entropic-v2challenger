# PRD — Kuwahara / NPR (motion-coherent + juiced)

> **Immutable stakeholder input** (exact quotes):
> - "if we implement kuwahara wed have to juice it or make it more interesting and make it compatible with motion"
> - "i like all of them lets build"
>
> _Type:_ effect · _Status:_ 🟢 drafted · _Depends on:_ Structure-Tensor Utility (shares the tensor); optical flow (for motion coherence)
> _Skill owners:_ /cto + /mad-scientist (technique) + /cdo (look)

## 1. Problem / why
There is no edge-preserving painterly / NPR class in the 155-effect library (cross-confirmed as a real gap by two verified research passes). A plain per-frame Kuwahara **flickers on video** — so the requirement is explicit: it must be **motion-compatible** and **juiced** beyond the vanilla filter, or it's not worth shipping.

## 2. What it does (scope)
- **Generalized (Papari) Kuwahara** — N gaussian-weighted oriented sectors; variance-weighted blend; edge-preserving oil-paint look. **Anisotropic** mode orients kernels to the structure tensor (flow-aligned brushwork).
- **Motion coherence (required):** advect the previous painted buffer by optical flow, blend with the current Kuwahara — stops the boil. Stateful (1-frame history).
- **Juice (required):** brush radius/sharpness mappable (audio-reactive); rotating stroke phase; ink edges (structure lines drawn back); optional saturation lift.
- **Out of scope:** the standalone structure-tensor output (its own Utility); learned/neural stylization.

## 3. Composable parts 🔒
- Reuses `structure_tensor()` (shared with the Tensor Utility — one compute).
- Motion coherence reuses **real optical flow already in `datamosh`** (Farneback) + `remap_frame` for advection.
- Ink edges reuse existing edge ops; all params are standard → mappable via K1.
- Effect contract `(frame,params,state)->(result,state)`; state = the painted buffer.

## 4. The three surfaces
- **Preset:** "Oil", "Impasto", "Living paint" (motion-coherent), "Paint-then-glitch" (composition).
- **Suggested:** radius/sharpness suggest `← audio.rms` (audio-reactive brush).
- **Full:** radius, sharpness q, sectors, anisotropy, coherence blend, ink amount.

## 5. Design / architecture
- N sector convolutions (cv2.filter2D) — GPU-able on the MLX/Metal path later.
- Determinism: base filter is deterministic; motion-coherence uses prior frame (stateful but deterministic given input sequence) → parity via replay path (like existing stateful effects).
- Regression + parity gates (per campaign convention for stateful effects).

## 6. Acceptance criteria (oracle)
- [ ] Static: same frame → identical output (hash); preview==export.
- [ ] Motion: on a moving sequence, temporal variance of the coherent output < naive per-frame by a set margin (measured — the anti-flicker oracle).
- [ ] Juice: `audio.rms → radius` visibly modulates brush (A/B).
- [ ] Anisotropic mode orients strokes to θ (pixel-diff vs isotropic).
- [ ] Stateful parity: replay path matches live (the campaign's stateful-effect gate).

## 7. Risks / open 🌱
- Motion coherence adds a flow compute + buffer — perf; reuse datamosh's flow, don't double-compute.
- Enum/param defaults must not ship "invisible at defaults" (past campaign lesson) — verify visible out of the box.
- 🌱 v2: true anisotropic (per-pixel oriented kernels) is a quality bump, not required for v1.

## 8. Ancillary wins
Reuses the tensor (Tensor Utility) and the flow (datamosh) — two existing computes; the painted buffer becomes the base coat for the paint-then-glitch composition; a real-time non-AI style-transfer, deterministic (clears parity by construction).
