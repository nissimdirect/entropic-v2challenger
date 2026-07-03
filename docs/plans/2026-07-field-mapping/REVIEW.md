# Review — coherence, UX routing, lifecycle, edge cases (tech-spec readiness)

**Scope:** whole `2026-07-field-mapping/` set (21 PRDs/specs + build plan + catalogs). Doc review per `/review`: refinement + CTO + red-team + one-shot confidence. Looped through every feature — the three cross-cutting gaps (UX/IA map, lifecycle, edge-cases) that the per-feature PRDs individually lacked are filled here.

## 1. Coherence findings (fixed this pass)
| # | Finding | Status |
|---|---------|--------|
| C1 | `BUILD-PLAN.md` was stale — no Wave 0 / signal-tap / `_mix` / curve / spike; P4 said "commit substrate" (contradicting the spike gate). | ✅ rewritten — W0-first order, E2s spike gate before E2. |
| C2 | Terminology split: "Routing Preset" (ARCHITECTURE) vs "composition" (CATALOG). | ✅ unified: composition = routing-preset = pre-routed chained preset. |
| C3 | Substrate PRD referenced "spike first" but not the spike PRD. | ✅ added explicit "Gated on PRD-field-solver-spike." |
| C4 | Registry ↔ prd/ files — verified 19/19 match, no dangling refs. | ✅ clean. |

**Condense recommendation (not blocking):** the preset ideation is spread over 4 files (`PRESET-CATALOG` 44, `PRESET-TOP50` gated-50, `PRESET-ARTDIRECTOR-20`, `CTO-BUILDABLE-IDEAS`). Keep `PRESET-TOP50` as the **roster** and mark the other three explicitly "bench — not the shipping set" (TOP50 already says this). No merge needed; just ensure tech-spec reads TOP50 as canonical. `CATALOG.md` (utilities/effects) vs `PRESET-CATALOG.md` (recipes) have confusingly similar names — consider renaming `CATALOG.md` → `INVENTORY.md` in a later pass.

---

## 2. UX / IA routing map (all features, incl. the fringe)
The IA is the **three surfaces**; every feature has a defined home. Entry = how you reach it.

| Feature | Entry point | Surface | Connects to |
|---------|------------|---------|-------------|
| **Presets Library** | top-level **Presets folder** (major nav) | 1 | click/drag → device chain + Matrix |
| Apply pre-routed preset | preset card → apply/drag-to-chain | 1 | materializes devices+edges+macros |
| Related-preset suggestions | peripheral **"◇ related (n)"** chip on chain/folder header | 1 (ambient) | one-tap → applies preset |
| Route-out | **"Route out ▸"** on a source device | 2 | → destination + Matrix edge |
| Map-from | **"map ▸"** on any param | 2 | → source picker |
| Field Mixer | add as a device **or** inline "combine ▸" when ≥2 fields present | 2 | → downstream edges |
| Composition + morph | bracket around a chain run + **morph handle**; `t` mappable/MIDI | 1 | → device group |
| Displace | add as a destination device; field arrives via edge | 2/3 | ← field source |
| Utility field output | the utility device tile; **output-style switch** + **use-as: output/mask/source** | 2 | → all three consumers |
| Signal-tap source | **"＋ expose signal"** on effects that compute one | 2 | → source list |
| **Spectrum-EQ source** | expand a spectral source → **mini-EQ** (band handles + threshold + **per-band fan-out**) | 3 | N band-outputs → N destinations |
| Depth source | inspector: **focal band + near/far range** | 3 | → blur/displace/mask |
| Motion/flow source | inspector: **magnitude threshold + direction** | 3 | → params/coord |
| Per-edge modifiers | edge strip (gate·envelope·reduce·**curve**·depth/min/max) | 3 | in Matrix/layers-routing |
| Full routing | **"Open in Modulation Matrix"** / topology graph | 3 | every edge/rule/curve |
| Cross-modal route-out | "route out ▸ **audio**" on a field source + seed presets | 1/2 | → audio params |

**Routing-order visibility** (ARCHITECTURE §7): forward edges solid, backward (feedback) dashed "1f" — drawn on the rack so timing is legible.
**Constraint (error prevention):** the picker only offers **shape-compatible** destinations (a scalar source can't target a coord field without `reduce`; a coord field can't target a scalar without `reduce`). This is the Norman "constraints" that prevents nonsense routings.

**Gap closed:** previously no single doc said where each fringe feature *lives*; this table is the IA contract for the tech spec.

---

## 3. Lifecycle spec (how it all fits)
### Clip lifecycle
- **Add clip** → empty device chain (the clip is the given input; no dropzone).
- **Add device** → part of that clip's chain; edges live in the clip's chain.
- **Remove clip** → its chain + edges + taps GC'd cleanly (edges are clip-local). A cross-track reference (e.g., sidechain from another track's audio) that loses its target → **fail-safe skip + warn**.
- **Split clip** → both halves inherit a copy of the chain + edges (decision: copy, not share). Stateful effects reset state at the cut.
- **Move/reorder clip** → chain travels with it; edges unchanged.
- **Copy/paste clip** → chain + edges duplicate (a preset-like clone).

### Project lifecycle
- **Save** → serialize chains + `routes` + macros + preset refs; write `presetSchemaVersion`.
- **Load** → restore; **unknown-field-preserve** (forward-compat); **missing effect/model → skip + warn**, don't crash.
- **Autosave** unaffected (routes are in the same store).

### Render / preview lifecycle
- **Preview** = live, best-effort; seeded sims may vary frame-to-frame.
- **Export** = deterministic: fixed seed for seeded sources; **field-recorder bake** for expensive fields (depth); **LOD** for sims.
- **Field cache** (`FieldProvider`): each source computed once/frame, shared by output/mod/mask.
- **Perf:** `change_gate` skips heavy devices under a delta threshold; **cost meter** shows a preset's PERF-MODEL class.
- **Parity gate:** deterministic chains render preview==export byte-identical (the "Render-Safe" badge).

### Preset lifecycle
save (capture chain+routes+macros+thumbnail) → **version** → apply (materialize, transparent) → edit (normal editable edges) → **export/import** (JSON) → **migrate** (schema version) → **missing-dep degrade** (skip+warn / classical fallback).

### Source lifecycle
- Utility/tap computes per frame → cached → consumed. Tap is tied to its **host effect instance** — host removed → its edges resolve gracefully (skip+warn).
- Depth model: lazy-load; unavailable → classical fallback + toast.
- Tap follows host **power state**: a bypassed/off effect → its tap emits its last value or idles (decision: **idle/zero when host is off**, to match "no signal").

---

## 4. Edge-case register (looped through every feature)
🟢 = handling already exists in code · 🔵 = must be specced in the tech spec.

**Framework / routing**
- Dangling edge (source device removed) → skip + warn 🟢 (fail-safe-skip pattern exists).
- Feedback (backward edge) → 1-frame delay auto (cycle guard) 🟢.
- Two sources → one param → arbitrate: sum via `blend_mode:'add'` default, or last-write 🟢/🔵 (pick + document).
- `field_dst:coord` with flag off → reject, no silent partial render 🟢 (`routing.py`).
- `reduce` on empty/degenerate field → finite-guard → 0 🟢.
- Edge depth NaN/∞ → clamp finite 🟢.
- Shape-incompatible route attempted → not offered / rejected 🔵 (the UX constraint).

**Presets**
- Preset refs missing effect id → skip + warn 🔵.
- Preset from newer schema → unknown-field-preserve + "made in newer version" note 🔵.
- Apply onto a non-empty chain → append vs replace → offer a choice (default append) 🔵.
- Preset uses a not-yet-built source (tensor before P1) → degrade/skip + note 🔵.
- Transparency: apply→remove-all must == baseline byte-identical 🔵 (hard test).

**Sources / signal-tap**
- Spectral source, no audio on track → zero spectrum, edges idle (not error) 🔵.
- Per-band fan-out when band-count changes → clamp/remap band indices 🔵.
- Depth, no ONNX model → classical fallback + toast 🔵.
- Motion/flow first frame (no prev) → zero field 🔵.
- Tap host effect off/bypassed → tap idles/zero (decision above) 🔵.
- Attractor/seeded source determinism across export → fixed seed 🔵.

**Field-solver (gated E2s)**
- Non-deterministic GPU scatter → fixed reduction order for render-mode 🔵.
- GPU OOM → memory-pressure guard + agent-count cap (MAX_AGENTS) 🔵.
- GPU resource orphan → release contract (SG-1 precedent) 🔵.

**Morph**
- Incompatible chain order → output-dissolve fallback (Mode 2) 🔵.
- Enum param mid-morph → snap at t=0.5 🔵.
- `t` driven by audio + hand-dragged → last-write 🔵.

**Cross-modal**
- Frame-rate → audio-rate zipper → smoothing/interp (required) 🔵.
- Audio→visual→audio loop → cycle guard 🟢.

**UX**
- Related-suggestion dismissed → never reappears (persisted) 🔵.
- Spectrum editor when no spectral device in chain → source greyed/unavailable 🔵.
- Route-order backward edge must render as dashed "1f" so users aren't confused by delay 🔵.

---

## 5. Verdict

**Neglect test:** without this, Creatrix stays a fixed effect library; the pre-routed-preset differentiator and field-as-modulation never ship. Cost of inaction is high; window is open (no competitor does inspectable pre-routed presets).

**CTO:** **GO, conditional.** Architecture is sound and reuse-first (verified against real code). Simpler-first ordering (W0 → K1 → ST) is correct. Conditions: the 🔵 edge cases above must be in each tech spec; the field-solver stays spike-gated.

**Red team:** **MEDIUM.** Real tigers: (1) `curve` silent-behavior-change on existing presets (mitigation: default==linear==identity — MUST test); (2) `_mix` reserved-namespace guard collision (MUST whitelist); (3) field-solver determinism (spike-gated); (4) preset versioning debt if not baked in from W0 (MUST ship `presetSchemaVersion` in W0). Rollback: presets are additive + versioned; W0 has no engine change to roll back.

**One-shot confidence:** **YES across the board now.** The 4 open policy decisions are resolved (`SPIKES.md` D1–D4); the field-solver risk is disproven by measurement (spike GO); `_mix`/`curve`/`field_dst`/`reduce`/preset-routes states are verified. No unvalidated assumptions remain for W0→E2.

**Combined verdict: APPROVE for tech-spec handoff.** W0/U0 fully ready; K1→E2 ready (decisions made, spike passed); P7 (L-axis) still gated on the S10 diffusion-latency spike (on-device).

### Resolved since first pass (via `SPIKES.md`)
- Red-team tiger #3 (field-solver determinism) → **cleared** (deterministic, measured).
- The 4 policy decisions → **decided** (D1 additive-default · D2 append-default · D3 tap-idles-when-off · D4 clamp-band-index).
- Tiger #1 (curve silent-change) + #2 (`_mix` guard) → mitigations confirmed against code (defaults=identity; guard is registration-time). MUST-tests carried in the PRDs.

### Approved as-is
Wave 0, the sources spec (shape→interaction is the right model), the signal-tap force-multiplier, the three-surface IA, and the lifecycle spec above.

---

## 6. One-shot assessment — ALL PRDs (2026-07-03, evidence-verified)
Each PRD's load-bearing integration assumption, verified against code. Risk = likelihood of mid-build rework.

| PRD | Key assumption | Verified? | Obstacle | Risk |
|-----|----------------|-----------|----------|------|
| **Wave 0** | apply path handles effect_chain | ✅ App.tsx:3769 appends effects | **id-remap**: apply reassigns UUIDs → routes must remap old→new (specced) | LOW |
| U0 `_mix` | `_mix` routable at runtime | ✅ container pops `_mix`; guard is registration-only | allow `_mix` as target key | LOW |
| U0 curve | edge `curve` unapplied | ✅ only axis-lane curve exists; `util/curves.py` reusable | wire into `resolve` + editor | LOW |
| K1 framework | `field_dst:coord`+`reduce`+FieldProvider new | ✅ field_dst=per-row only; reduce absent; `field_source.py` exists | standard extension; the keystone | LOW-MED |
| **Signal-tap** | effect can publish a signal | ✅ **via `state_out['_tap_*']`** — no contract change | container must harvest taps→FieldProvider; spectral-EQ UI is the real new work | MED |
| Utilities (tensor/depth/displace/flow) | registry pattern; RVM sidecar for depth | ✅ registry verified; RVM path exists | displace needs K1's coord-dst | LOW |
| Kuwahara | reuse datamosh Farneback flow | ✅ flow exists in datamosh | lift into shared helper | LOW |
| Field-solver + physarum | GPU ping-pong real-time+deterministic | ✅ **spike GO: 0.74ms, deterministic** | new engine surface, de-risked | MED |
| Field-mixer / morph | numpy on cached fields; `_mix`+`ModEdge.depth` | ✅ all exist | depends on FieldProvider | LOW |
| **Cross-modal (P6)** | field → **audio** param via ModEdge | ⚠️ **NO** — audio lives in separate `automation.ts`; modulation engine resolves against *effect* params only | **bridge two systems, not wiring** — re-scoped; correctly late + preset-gated | **MED-HIGH** |
| L-axis (P7) | diffusion latency acceptable | 🔴 unmeasured (S10, no model here) | gated on the on-device latency spike | (gated) |

**Net:** **W0 → E2 are one-shottable** — every assumption verified, the one obstacle (Wave-0 id-remap) is specced. **The only re-scope is cross-modal (P6): field→audio is a two-system bridge, not small wiring** — already the latest, preset-gated phase, so it doesn't threaten the critical path. P7 stays spike-gated. No obstacle blocks the build order.
