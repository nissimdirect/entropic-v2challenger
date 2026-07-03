# PRD — Signal Tap (expose existing effects' internal fields as modulation sources)

> **Immutable stakeholder input** (exact quotes):
> - "have you stumbled across anything since we last checked in… now is the time to surface if its a good idea" → (surfaced) "the 'signal tap' pattern… expose those as modulation sources… near-zero new field-computation code"
> - "all of these are worthy… do we have all the new sources documented and specced out?… how do these all work in practice… thick detailed documentation and implementation plans"
>
> _Type:_ framework · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1) source-registration + `reduce` · **companion:** `SOURCES-SPEC.md`
> _Skill owners:_ /cto + /mad-scientist (+ /cdo for the spectrum editor)

## 1. Problem / why
Creatrix's ~150 effects already compute rich internal signals every frame — and throw them away after rendering. `video_analyzer` computes **motion**; `strange_attractor` computes a **chaotic orbit**; `temporal_blend`/`feedback_phaser` hold **feedback buffers**; the FFT/DCT suite computes **spectral bands** (`band_isolation.py` works in `low_bin/high_bin` space); `entropy_map` computes **information density**; `datamosh` computes **real optical flow**. Exposing these as **modulation sources** delivers a large slice of the field-as-modulation thesis with **near-zero new field-computation code** — motion/spectral/flow/entropy-reactive everything, *today*, before any utility is built.

## 2. What it does (scope)
- A **tap registry**: an effect can *publish* one or more named signals (`effect.signal`) from what it already computes.
- Published signals appear as **modulation sources** in the operator/source list, routable via `ModEdge` like any operator.
- Each tap declares its **shape** (scalar/event/vector/spectrum/2D — per `SOURCES-SPEC.md`) so the right source-inspector + default binding rule attach automatically.
- **v1 taps (all from existing computes):** `video_analyzer.motion` (S/2D), `spectral.bands` (F), `chromagram` (F), `strange_attractor.orbit` (O), `temporal_blend.buffer` (2D), `entropy_map.field` (2D), `datamosh.flow` (V/2D).
- **Out of scope:** new field computation (that's the utilities); the AI/CLIP source; changing the host effects' render behavior.

## 3. Composable parts 🔒
- Reuses `field_source.py` cache: a tapped signal is cached once/frame, shared with the host effect's own use (no double-compute).
- Reuses `ModEdge`/`mappings` (source→dest) + `reduce` (field→scalar) + the existing modifier operators (`gate`, `envelope`, `smooth`).
- The host effect adds a tiny "publish(signal, shape, value)" call in its existing compute — no algorithm change.

## 4. Architecture
- **Publisher API [verified feasible]:** effects already return `(frame, state_out)` and the container already harvests `state_out` (`container.py:148`). A tap publishes via a reserved `state_out['_tap_<signal>'] = value` — **no change to the pure `(frame,params,state)->(result,state)` contract.** The container harvests `_tap_*` keys from `state_out` into the per-frame `FieldProvider` cache, keyed `effect_instance_id.signal`. (Optional sugar: a `tap.publish(...)` helper that writes the key.)
- **Source registration:** published taps enumerate into the source list (like operators) with their shape → correct inspector (`SOURCES-SPEC §5`).
- **Ordering:** a tap reads the value the host effect computed at *its slot* (consistent with ARCHITECTURE §7 tap-point rules); routing forward = same-frame, backward = 1-frame.
- **Determinism:** taps inherit the host effect's determinism (motion/spectral/entropy are deterministic; attractor is seeded). Mark per tap.

## 5. The interaction affordances (per `SOURCES-SPEC`)
Each tap gets the inspector its shape dictates — **this is the "different interactions" the stakeholder asked about**:
- `spectral.bands` → **mini-EQ** (band select, per-band fan-out, frequency-gated threshold). *The standout.*
- `video_analyzer.motion` / `datamosh.flow` → motion meter + magnitude threshold (+ direction for flow).
- `entropy_map.field` → threshold→mask ("busy regions only").
- `strange_attractor.orbit` → LFO-style editor + attractor-type + axis.
- `temporal_blend.buffer` → decay + tap-delay + reduce.

## 6. Acceptance criteria (oracle)
- [ ] A published tap appears as a source and routes to an effect param (round-trips save/load).
- [ ] `spectral.bands → param` with a selected band + threshold fires only above threshold (unit test on synthetic spectrum).
- [ ] Per-band fan-out: 3 bands → 3 different destinations, each independent (integration test).
- [ ] No double-compute: host effect + tap share one field/frame (assert single compute).
- [ ] Determinism: motion/spectral/entropy taps render byte-identical preview==export; attractor tap deterministic under fixed seed.
- [ ] Host effect render output is **unchanged** by adding a tap (regression: byte-identical to pre-tap).

## 7. Risks / open 🌱
- **Perf:** a tapped 2D field that the host would otherwise discard may add memory; gate behind "is anything routed from this tap?" (compute-on-demand).
- Tap lifetime tied to the host effect instance — if the effect is removed, its edges must resolve gracefully (fail-safe skip + warn).
- 🌱 Should taps be *always available* or *opt-in per effect* (avoid source-list clutter)? Lean opt-in: a "＋ expose signal" on effects that have one.
- 🌱 The spectrum editor is the one real UI build; everything else reuses existing editors.

## 8. Ancillary wins
Delivers motion/spectral/flow/entropy-reactive modulation **before any utility is built**; every future effect can publish a tap for free; the spectrum-EQ source doubles as an analyzer; strongly de-risks the whole field-mapping thesis by proving field-as-modulation cheaply.
