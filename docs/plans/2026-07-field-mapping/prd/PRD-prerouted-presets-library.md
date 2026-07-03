# PRD — Pre-Routed Chained Presets + the Presets Library (FLAGSHIP)

> **Immutable stakeholder input** (exact quotes):
> - "make each subcomponent complete and composable and use the natural creatrix routings and stuff to get it together"
> - "the things in tandem offer an opportunity for us to have chained effects pre-routed as presets"
> - "presets as a major folder"
>
> _Type:_ framework / product · _Status:_ 🟢 drafted · _Depends on:_ Mapping Framework (K1); the utilities/effects PRDs
> _Skill owners:_ /cto + /cdo (browser UI) + /don-norman (IA)

## 1. The thesis
Don't build a parallel system. Each new piece (utility / effect / destination) is a **complete, composable device** that plugs into the **existing Creatrix device chain + modulation routing**. The differentiator is what those pieces enable **in tandem**: **pre-routed chained presets** — a one-click bundle of *devices + their params + the modulation edges that wire them* — surfaced in a **first-class Presets folder**. This is the "guide to cool outcomes" made real, and it's mostly an extension of what already exists.

## 2. What already exists (🔒 grounded — build on it, don't rebuild)
- `Preset` with `mode: 'single_effect' | 'effect_chain'`; **`chainData: { effects }`** already stores a multi-device chain (`PresetSaveDialog.tsx`).
- The preset domain already imports **`ModulationRoute`** and **`MacroMapping`** types.
- `PresetBrowser` / `PresetCard` / `library.ts` store — a browsable preset surface exists.
- Device chain (`EffectRack.tsx`), operator `mappings[]`/`ModEdge`, `ModulationMatrix` — the routing is real.

## 3. The gap (the actual build)
1. **Bundle routes into chain presets.** Extend `effect_chain` `chainData` to also capture the **modulation edges** (`ModulationRoute[]` / `ModEdge`s) and any **field-source utility devices**, so a preset restores a *wired* chain — not just effects+macros.
2. **Apply = materialize the wired chain.** Applying a pre-routed preset drops the devices onto the clip's chain (or a new track) AND recreates the edges + macros — a complete, playable patch.
3. **Presets = a major folder.** Elevate `PresetBrowser` to a first-class, top-level **Presets Library**: browsable, foldered, searchable — the front door to the whole system.

## 4. What a Pre-Routed Chained Preset IS
A saved object containing: ordered **devices** (utilities + effects + destinations) with params · the **modulation edges** wiring them (src→dst, binding rule, depth, curve) · **macros** · metadata (name, tags, thumbnail). Examples (the flagship packs): "Self-steering flow" (Tensor + Displace + coherence→field edge), "Rack focus" (Depth + Blur + depth→radius + focal←audio), "Paint-then-glitch", "Depth diorama".

## 5. The Presets Library (major folder)
- Top-level surface (alongside device chain / timeline), like Ableton's browser. Categories/folders: **Chains (pre-routed)** · Utilities · Effects · Single-effect presets · user folders · **Recipe packs** (curated pre-routed sets).
- Card = thumbnail (real render) + name + tags + a "what it does" line + device/route count.
- Drag-to-chain or click-to-apply. Search + filter by tag/source-field.
- **Transparency invariant (hard):** applying a preset produces only normal, editable devices + edges — open the chain / `ModulationMatrix` and it's all there, remixable. No hidden state. Test: apply → then fully remove == baseline byte-identical.

## 6. The three surfaces (this PRD *is* surface 1)
- **Surface 1 — Presets Library:** browse a folder, one click → a wired look. (This PRD.)
- **Surface 2 — Suggested routings:** on any device, "route out ▸" (K1).
- **Surface 3 — Modulation Matrix:** every edge/rule/curve (exists).

## 7. Acceptance criteria (oracle)
- [ ] A pre-routed preset round-trips: save a wired chain (devices + edges + macros) → reload → identical wired chain (schema + persistence test).
- [ ] Apply materializes devices AND edges AND macros; the result renders identically to the hand-built chain (pixel-diff).
- [ ] Transparency: apply → remove-all == baseline byte-identical.
- [ ] Library: browse, search, filter, drag-to-chain (UI smoke + agent-native parity — an agent can apply a preset via tool).
- [ ] Backward-compat: existing single_effect + effect_chain presets still load (no regression).

## 8. Risks / open 🌱
- **Version/compat:** presets reference effect ids + params that may drift — need a preset schema version + unknown-field-preserve (the `.dna` no-regression precedent).
- **Missing dependency:** a preset using Depth (ONNX) on a machine without the model — degrade gracefully (classical fallback + toast).
- 🌱 Recipe-pack governance: who authors the curated packs; community sharing (ISF/SSF-import synergy).
- 🌱 Do pre-routed presets target one clip's chain, a track, or spawn structure? Start: apply to the focused clip's device chain.

## 9. Related-preset suggestions (uninvasive)
> **Stakeholder:** "if we have effects that are part of a chain we should come up with a way to suggest related presets uninvasively"

**Pull, not push.** When a chain has devices, quietly surface *related* pre-routed presets — never a modal, toast, or nag.
- **Where:** a peripheral **"◇ related (n)"** chip in the chain/Presets-folder header that reflects the current chain. Ambient, ignorable.
- **Affinity:** from the same static table as route-out — devices/fields in the chain → related packs. Two kinds:
  - **Complete the look** — a pack that *contains* your current devices (chain has Kuwahara → "Paint-then-glitch").
  - **One more move** — a single device+edge that upgrades what you have (chain has Kuwahara → "＋ Structure Tensor = self-steering").
- **Uninvasive rules (Norman / anti-dark-pattern):** dismissible; a dismissed suggestion never reappears for that chain (persisted); **never auto-applies**; no confirmshaming; peripheral, never blocks the canvas; a global "quiet suggestions" toggle.
- **Preview on hover** (ghosted devices/edges it would add), **apply on explicit click** → materializes real editable edges (transparency invariant).

**Acceptance:** suggestions are deterministic from the affinity table + chain contents; dismissed ones don't return; no suggestion is ever modal/blocking; apply == hand-built.

## 10. Ancillary wins
Reuses the existing preset + chain + routing systems (small extension, big payoff); makes compositions, routing-presets, and recipes **one concept**; the Library is the discoverable front door that lets beginners reach power-user results; every preset is inspectable → beginners learn by opening them.
