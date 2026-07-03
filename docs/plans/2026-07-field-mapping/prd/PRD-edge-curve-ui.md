# PRD — Editable per-edge Curve (easing on every routing)

> **Immutable stakeholder input** (exact quotes):
> - "an editable per-edge curve UI (the curve field already exists in the data — expose it and every routing gets easing)… tiny… upgrade the whole system"
> - "thick detailed documentation and implementation plans"
>
> _Type:_ primitive · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1)
> _Skill owners:_ /cto + /cdo

## 1. Problem / why
A modulation edge maps a source value → destination **linearly** today. But `OperatorMapping` already **serializes a `curve` field** (`operators.ts`: `curve: m.curve`). Two gaps: (a) the routing engine doesn't appear to *apply* the curve (no curve handling found in `routing.py`/`processor.py`), and (b) there's no editor. Close both → every routing gets easing/S-curve/expo/**EQ-shaping**, which makes every preset feel intentional instead of robotic.

## 2. Scope
- **Engine:** apply the per-edge `curve` in the resolve path (a LUT/shaping function on the normalized source value before `depth`/`min`/`max`). Reuse `util/curves.py` (the existing points→cubic/linear LUT) so the same curve model powers effect-curves and edge-curves.
- **UI:** a small curve editor on each edge (in the ModulationMatrix / edge inspector) — presets (linear, smoothstep, expo-in/out, S) + draggable points.
- Doubles as the **EQ-curve** for spectral sources (per `SOURCES-SPEC §4a`).
- **Out of scope:** per-sample audio-rate curves; new curve math (reuse `util/curves.py`).

## 3. Composable parts 🔒
- `frontend/.../operators.ts` — `curve` already on the mapping + serialized.
- `backend/src/effects/util/curves.py` — points→LUT (cubic/linear) already exists; reuse for the edge shaping fn.
- `backend/src/modulation/routing.py` `resolve_axis_binding` / `_blend_contributions` — insert the curve step (currently linear).

## 4. Acceptance criteria (oracle)
- [ ] Engine applies `curve`: a smoothstep edge produces the smoothstep-shaped output (unit test vs linear).
- [ ] `curve: linear` (default) is **byte-identical** to today (regression — no silent change to existing presets).
- [ ] Editor round-trips: draw a curve → save → reload → same curve.
- [ ] Spectral EQ-curve: a band-energy source shaped by a curve behaves per the curve (integration).
- [ ] Determinism/parity preserved (curve is a deterministic LUT).

## 5. Risks / open 🌱
- **Silent behavior change risk:** existing presets have `curve` serialized but (apparently) unapplied — turning application on could change their output. Mitigate: default/absent `curve` == linear == identity; only non-linear curves change anything. Add a migration note.
- 🌱 Curve editor shared component with the effect-curves UI (contrast_crush etc. already have curves) — reuse, don't fork.

## 6. Ancillary wins
Every routing + every preset feels hand-tuned; unifies effect-curves and edge-curves on one model; provides the EQ-curve for spectral sources; near-free (data + curve-math already exist — mostly wiring + a shared editor).
