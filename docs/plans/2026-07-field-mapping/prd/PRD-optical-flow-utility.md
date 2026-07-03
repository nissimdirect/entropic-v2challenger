# PRD — Optical-Flow Utility

> **Immutable stakeholder input** (exact quotes):
> - "i like the depth as a modulation source… things like that are cool" (motion-as-modulation is the same family)
> - (context) "expose the field already inside datamosh"
>
> _Type:_ utility (field producer) · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1)
> _Skill owners:_ /cto + /mad-scientist

## 1. Problem / why
Creatrix **already computes dense optical flow** (real `cv2.calcOpticalFlowFarneback`) — but it's buried inside `datamosh`. Exposing that field as a Utility unlocks **motion-as-modulation across the whole DAW** at near-zero cost: the footage's own movement drives any parameter.

## 2. What it does (scope)
- Outputs the per-pixel motion vector field (magnitude + direction).
- **Output:** vector-hue viz. **Source:** presets — Displace (motion smear), any param (motion-reactive), physarum steering. **Mask:** moving-vs-static gate.
- **Out of scope:** re-implementing flow (reuse datamosh's); ML optical flow (RAFT) — Farneback v1.

## 3. Composable parts 🔒
- Lift the exact Farneback call out of `datamosh.py` into a shared helper both consume (no double-compute when both are active).
- Registers as a field-source Utility; `reduce` gives motion-magnitude scalar for scalar destinations.

## 4. Acceptance criteria (oracle)
- [ ] Utility outputs a flow field on a moving clip (smoke); static clip → ~zero field.
- [ ] `Flow → Displace` smears along motion (pixel-diff).
- [ ] Shared helper: datamosh + Utility both use it, flow computed once per frame (assert single call).
- [ ] `reduce`→magnitude drives a scalar param (round-trip).

## 5. Risks / open 🌱
- Flow is frame-pair stateful (needs prev frame) — mark accordingly; first frame = zero field.
- 🌱 RAFT/ML flow later for smoother fields — Farneback is the cheap real v1.

## 6. Ancillary wins
Zero new algorithm; motion-as-modulation everywhere; steers physarum (foraging on motion); improves datamosh by sharing the field.
