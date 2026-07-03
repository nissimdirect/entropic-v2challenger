# PRD — Field Mixer

> **Immutable stakeholder input** (exact quotes):
> - "field mixer worth it"
> - (context) "field arithmetic — combine fields (Depth × Flow, Tensor − Entropy) before routing"
>
> _Type:_ utility · _Status:_ 🟢 drafted (greenlit) · _Depends on:_ Mapping Framework (K1); ≥2 field utilities

## 1. Problem / why
A single field is powerful, but the interesting control comes from **combining** fields before routing: "displace by motion *only where it's deep*" = `Flow × Depth`; "paint where structured but not busy" = `Tensor − Entropy`. Without a mixer, users would need many chained edges; the mixer makes composite fields a first-class, reusable source.

## 2. What it does (scope)
- Takes 2+ field inputs, outputs one field via a chosen op: **× (mask/gate), + (sum), − (difference), min, max, lerp(a,b,t), blend**, each with per-input gain + normalize.
- The output is itself a Utility (triple-use: output viz / mod source / mask) — so mixers chain.
- Small, readable node: input slots + op dropdown + gain sliders + output viz.
- **Out of scope:** arbitrary expression language (🌱 later); >4 inputs.

## 3. Composable parts 🔒
- Pure numpy elementwise on cached fields (from `field_source.py`). No new engine.
- Registers as a field-source Utility; consumes other utilities' cached fields (compute-once still holds).

## 4. The three surfaces
- **Preset:** shipped mixer recipes — "Deep-motion" (`Flow × Depth`), "Clean structure" (`Tensor − Entropy`).
- **Suggested:** when two field utilities are present, suggest "combine ▸".
- **Full:** op + per-input gain + normalize + output style.

## 5. Acceptance criteria (oracle)
- [ ] `Flow × Depth` output equals elementwise product (unit test, exact).
- [ ] Deterministic when inputs are deterministic; parity preview==export.
- [ ] Mixer output routes as a source (round-trips save/load).
- [ ] Chained mixer (mixer feeding mixer) resolves without cycle error.

## 6. Risks / open 🌱
- Normalization policy (per-frame min-max vs fixed) changes feel — expose as a param, default per-frame.
- Cost: each input is a cached field; mixing is cheap, but N inputs × field ops needs a budget line.
- 🌱 Expression node (`a*b - 0.5*c`) is the power-user endgame — park.

## 7. Ancillary wins
Turns N fields into an unbounded space of composite fields with one small node; every mixer output is also a viewable effect and a mask.
