# PRD — `_mix` as a mappable Wet/Dry macro

> **Immutable stakeholder input** (exact quotes):
> - "_mix as a mappable wet/dry macro (every effect gets modulatable dry/wet and it's what powers composition-morph)… tiny… upgrade the whole system"
> - "thick detailed documentation and implementation plans"
>
> _Type:_ primitive · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1) — mostly exposes existing
> _Skill owners:_ /cto + /cdo

## 1. Problem / why
Every effect already has a per-effect dry/wet — `container.py` pops **`_mix`** (clamped 0–1) and does "step 5. Mix dry/wet." But it's not a first-class, visible, **mappable** control. Expose it and (a) every effect gains a modulatable wet/dry ("audio → wetness"), and (b) composition-morph gets its add/remove ramp for free (ramp `_mix` 0↔1).

## 2. Scope
- Surface `_mix` as a **visible knob** on every device (a standard wet/dry).
- Make `_mix` a **valid `ModEdge` destination** (`target_param_key: "_mix"`) so any source can drive it.
- Wire it as the **morph add/remove ramp** (composition-morph Mode 1).
- **Out of scope:** changing the mix math (it exists); per-region mix (that's masking).

## 3. Composable parts 🔒
- `backend/src/engine/container.py` — `_mix` pop + clamp + "Mix dry/wet" already implemented. No backend algorithm change.
- Add `_mix` to each device's exposed params (UI) + allow it in the routing destination registry (it's currently a synthetic key popped before the effect; ensure the router can target it without colliding with the `_*` reserved-namespace guard in `registry.py`).

## 4. Acceptance criteria (oracle)
- [ ] Every device shows a wet/dry knob bound to `_mix`; default 1.0 == current behavior (regression: byte-identical at 1.0).
- [ ] `[audio.rms → effect._mix]` modulates wet/dry (A/B).
- [ ] Morph: an A-only effect at `t=1` via `_mix→0` == bypassed byte-identical (ties PRD-composition-morph).
- [ ] `_mix` as a target does not trip the `_*` reserved-namespace registration guard (it's plumbing, not a user param — validate the router special-cases it).

## 5. Risks / open 🌱
- **[Spike S2, resolved]** The `_*` guard is **registration-time only**; at runtime `container.py:59` pops `_mix` from params, so a route that *writes* `_mix` is consumed. Risk downgraded: just allow `_mix` as a routable `target_param_key` (no registration-guard collision). Small.
- 🌱 Should `_mix` sit in the device title bar (always visible) or the body? Lean title bar — it's the master wet/dry.

## 6. Ancillary wins
Near-free (backend already mixes); powers composition-morph; "audio → wetness" is one of the most-loved reactive moves; consistent wet/dry across all 150 effects.
