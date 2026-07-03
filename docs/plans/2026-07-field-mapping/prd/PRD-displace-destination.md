# PRD — Displace (the coord-field destination)

> **Immutable stakeholder input** (exact quotes):
> - "displacement and hue shift are striking as is the actual heat map"
> - "is displacement and hue covered in their own utilities too? where are those exposed to be mapped?"
>
> _Type:_ destination · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1) `field_dst: coord`
> _Skill owners:_ /cto + /cdo (interaction/viz)

## 1. Problem / why
Hue, blur, saturation — the striking destinations from the "one field, many destinations" mock — are **already mappable effect params** (`hue_shift.angle` etc.). **Displacement is the exception:** it's a per-pixel coordinate warp, not a scalar param, so it needs a first-class destination. `Displace` is that node — a field drives where each pixel samples from.

## 2. What it does (scope)
- A device that takes a **field input** (from any Utility / mixer) and warps the frame: `out(x) = frame(x + amount · field_vector(x))`.
- Field can be a vector field (tensor θ+coherence, optical flow) or a scalar field (warp along a fixed/normal direction).
- Params: amount, direction mode (field-vector | along-normal | radial), boundary (clamp/wrap/mirror), quality.
- **Out of scope:** the universal "every effect gets a coord input" generalization (🌱 v2); multi-field blending (that's the Field Mixer's job upstream).

## 3. Composable parts 🔒
- Warp uses the existing **`remap_frame`** shared atom (cv2.remap, clamp/wrap/mirror already implemented in `effects/shared/displacement.py`). No new warp code.
- Consumes `field_dst: coord` from K1 (the field arrives as a (dx,dy) destination).
- Registers as an effect; the field input is a modulation edge, not a param.

## 4. The three surfaces
- **Preset:** "Self-steering" (Tensor→Displace), "Parallax" (Depth→Displace), "Motion smear" (Flow→Displace).
- **Suggested:** any field source suggests "→ Displace".
- **Full:** amount / direction-mode / boundary + the source field's binding rule + depth.

## 5. Design / architecture
- Vector source → (dx,dy) directly. Scalar source → magnitude along a chosen direction (θ from a paired field, or a fixed angle param).
- Deterministic given a deterministic field; parity holds.
- Feedback-safe: `Depth → Source.warp` (backward edge) uses the 1-frame rule (ARCHITECTURE §7).

## 6. Acceptance criteria (oracle)
- [ ] `Tensor → Displace` warps along θ (pixel-diff vs reference render).
- [ ] `field_dst` OFF → the edge is rejected with a clear error (no silent partial render).
- [ ] Boundary modes match `remap_frame` behavior (clamp/wrap/mirror unit tests).
- [ ] Determinism/parity: same field → identical warp preview==export.
- [ ] Backward-edge (feedback) uses prior-frame field (1-frame), no cycle error.

## 7. Risks / open 🌱
- Amount scaling units (px vs normalized) — normalize to frame size for resolution independence.
- 🌱 One `Displace` node vs universal coord-input on every effect — v1 = one node (clean, discoverable); revisit universal in v2.
- Cost: per-pixel remap at 1080p — cheap (cv2), but confirm against budget with field edges.

## 8. Ancillary wins
Unlocks the entire "field → displacement" column of the modulation matrix; reuses the most-used physics atom; makes self-steering / parallax / motion-smear all one node fed different fields.
