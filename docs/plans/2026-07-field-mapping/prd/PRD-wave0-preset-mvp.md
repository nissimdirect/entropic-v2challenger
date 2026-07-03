# PRD — Wave 0: Pre-Routed Preset MVP (buildable now)

> **Immutable stakeholder input** (exact quotes):
> - "'Wave 0' — the pre-routed preset MVP, buildable now, before any utility… extend chain presets to bundle the modulation edges, surface a first-class Presets folder, and ship the ~18 '🟢 ships-today' presets… proves the entire product thesis… with almost no new engine code"
> - "all of these are worthy… thick detailed documentation and implementation plans"
>
> _Type:_ framework / product (MVP) · _Status:_ 🟢 drafted · _Depends on:_ nothing new — extends existing systems
> _Skill owners:_ /cto + /cdo (Presets folder UI) + /uat (acceptance)

## 1. Problem / why
The flagship thesis — **pre-routed, swappable, inspectable presets** — can be proven **now**, before any utility or the field-solver, because the pieces already exist: `effect_chain` presets (`chainData: { effects }`), the `ModulationRoute` type, `preset.schema.json`, `PresetBrowser`, the device chain, and `ModEdge` routing. Wave 0 is the **narrowest slice that ships the whole idea** and de-risks everything downstream with real user evidence.

## 2. Scope (3 deliverables, no new engine)
1. **Bundle routes into chain presets.** Extend `effect_chain` `chainData` (and `preset.schema.json`) to also capture the **modulation edges** (`ModulationRoute[]`/`ModEdge`) + macros, so a preset restores a *wired* chain — not just effects.
2. **First-class Presets folder.** Elevate `PresetBrowser` into a browsable, foldered, searchable **Presets Library** surface (packs = folders; card = thumbnail + name + tag + what-it-does).
3. **Seed library: the ~24 🟢 ship-today presets** from `PRESET-TOP50.md` (Menkman, Riley, Atkins Blue, Klein, Constructivist, `Audio→Any-Param`, `video_analyzer.motion→Any-Effect`, `Attractor Drive`, `Entropy Mask`, `_mix Reactive`, etc.) — everything expressible with existing effects + existing operators.

**Explicitly out of scope:** the new utilities (tensor/depth/flow/displace), the field-solver, signal-tap (its own PRD; a couple Wave-0 presets *use* existing taps like `video_analyzer.motion` which is already an operator), the AI axis.

## 3. Composable parts 🔒 (verified this session)
- `frontend/src/shared/schemas/preset.schema.json` — the preset schema (extend it).
- `PresetSaveDialog.tsx` (`mode:'effect_chain'`, `chainData:{effects}`, imports `ModulationRoute`), `library.ts` (`savePreset`), `PresetBrowser.tsx`/`PresetCard.tsx`.
- `stores/operators.ts` `mappings[]` → `ModEdge` (the edges to bundle), `EffectRack.tsx` (the chain), `container.py` `_mix`.
- Existing effects for the seed set (cyanotype, solarize, infrared, datamosh, channelshift, grid_moire, invert_bands, reaction_diffusion, posterize, bitcrush, ascii_art, false_color, duotone, scanlines, kaleidoscope, strange_attractor, entropy_map, temporal_blend) + existing operators (audio_follower, video_analyzer, LFO, envelope, step-seq).

## 4. Implementation plan (phased, each a checkpoint)

**P0.1 — Schema + persistence (the core).**
- Extend `preset.schema.json`: `chainData` gains `routes: ModulationRoute[]` (+ optional `macros`). Add a `presetSchemaVersion` field + unknown-field-preserve on read (the `.dna` no-regression precedent).
- `PresetSaveDialog`: when saving an `effect_chain`, collect the chain's operator `mappings`/`ModEdge`s and write them to `chainData.routes`.
- **Apply**: extend the *existing* `onApplyPreset` (App.tsx:3769) which already appends `chainData.effects` via `addEffect({...effect, id: randomUUID()})`. Add: materialize **routes** (via `addOperator`/`addMapping`) + **macros** (currently saved but NOT applied — pre-existing gap).
- **⚠️ ONE-SHOT OBSTACLE (review S-apply):** apply reassigns a **fresh UUID per effect**, but bundled routes reference effect ids (`target_effect_id`) + operators may reference source effect ids. **Apply MUST build an old-id→new-id map and rewrite every route/operator ref through it**, or routes silently dangle. This is the single most important Wave-0 correctness detail.
- Bump `chainData.effects` `maxItems` (10 → e.g. 24) — pre-routed compositions + utilities can exceed 10 devices.
- Gate: round-trip test (save wired chain → reload → identical edges); **id-remap test (applied routes point to the new effect ids, not the saved ones)**; macro-apply test; backward-compat test (old presets without `routes` still load).

**P0.2 — Presets Library folder UI.**
- Promote `PresetBrowser` to a top-level surface with folders (packs), search, tag filter, thumbnail cards, "what it does" line, device/route counts.
- Apply = click or drag-to-chain. **Transparency:** after apply, everything is normal editable devices + edges (open the chain / ModulationMatrix).
- Gate: apply a pack preset, verify the wired chain renders identically to the hand-built version (pixel-diff); agent-native parity (an agent can apply via tool).

**P0.3 — Seed the 24 presets.**
- Author the 🟢 presets as preset files (JSON per schema), grouped into folders (Signature Looks / Reactive / Swap-starters).
- Each ships a **real thumbnail** (rendered) + tags + a one-line description.
- Gate: each preset applies + renders; deterministic ones flagged; screenshot-verify a sample.

**P0.4 — Related-suggestions stub (optional in Wave 0).**
- The peripheral "◇ related (n)" chip reading the affinity table (from `PRD-prerouted-presets-library.md §9`) — can land here or defer. If deferred, note it.

## 5. Acceptance criteria (oracle)
- [ ] Save a wired chain (effects + edges + macros) → reload → **byte-identical** wired chain (schema + persistence test).
- [ ] Apply a preset → devices + edges + macros materialize; render == the hand-built chain (pixel-diff).
- [ ] **Transparency:** apply → remove-all == baseline byte-identical (no hidden state).
- [ ] Backward-compat: existing `single_effect` + `effect_chain` presets load unchanged (regression).
- [ ] Library: browse / search / filter / apply works (UI smoke) + agent can apply a preset via tool (parity).
- [ ] 24 seed presets each apply + render (smoke); ≥1 per pack screenshot-verified.

## 6. Risks / open 🌱
- **Preset versioning** is load-bearing (presets must survive app updates) — bake `presetSchemaVersion` + unknown-field-preserve from day one.
- Missing-effect handling: a preset referencing an effect id not present (future) → skip + warn, don't crash.
- 🌱 Apply target: focused clip's chain vs a new track — start with focused clip.
- 🌱 Some 🟢 presets use `video_analyzer.motion` (already an operator) — fine; they're still no-new-engine.

## 7. Why this is the right first build
Lowest risk, highest thesis-value: it ships something real, proves pre-routed/swappable/inspectable presets end-to-end, and gives every downstream piece (utilities, signal-tap, field-solver) a proven home to slot into **with evidence**. Everything after Wave 0 is "add a new source/effect and author more presets."

## 8. Ancillary wins
Reuses the entire existing preset+chain+routing stack; the Presets folder is the product's front door; preset versioning + export/import (JSON) come nearly free → a sharing ecosystem; the seed set doubles as marketing/demo content (album-art-ready looks).
