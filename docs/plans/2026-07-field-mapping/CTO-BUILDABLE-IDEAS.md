# CTO — 20 High-Leverage Buildable Ideas

**Lens:** feasibility + reuse + sustainability (not weirdness). Each ships cheap because it exploits an **existing** Creatrix system (verified this session). Distinct from the 44 look-presets and the 20 mad-scientist experiments. Format: **idea — what — reuses (feasibility) — leverage.**

## A · Force-multiplier primitives (small build → unlocks many presets)

1. **Editable edge curve** — expose the per-mapping **`curve`** (already in `OperatorMapping`) as a real curve UI → every routing gets easing/S/expo. *Reuses:* existing `curve` field. *Leverage:* one control upgrades all presets' feel.
2. **`reduce` probe region** — let `reduce` sample a movable box, not just whole-field ("brightness of the subject → param"). *Reuses:* `reduce` rule + existing marquee/mask. *Leverage:* turns any field into a targeted scalar source.
3. **`FieldProvider` cache** — compute each utility's field once/frame, shared by output+mod+mask. *Reuses:* `field_source.py` (P6). *Leverage:* the enabler that makes triple-use free.
4. **Tap-point toggle** — utility reads "raw source" vs "at-slot." *Reuses:* pipeline slot. *Leverage:* makes depth/tensor usable anywhere in a chain (fixes the ordering trap cheaply).
5. **Inline field-math on an edge** — `[Depth × Flow → …]` without a Mixer device for the 2-input case. *Reuses:* Field-Mixer math. *Leverage:* compound control with zero extra devices in common cases.

## B · Architecture-exploit (near-free, reuse existing computes)

6. **`video_analyzer` motion as a field NOW** — it already computes motion; expose it as optical-flow-lite *before* the full flow utility. *Reuses:* existing operator. *Leverage:* motion-as-modulation shipped early, zero new algorithm.
7. **Spectral suite → F-axis sources** — the FFT/DCT effects already hold band data; tap `spectral.band[F]` as modulation sources. *Reuses:* `spectral_*` internals. *Leverage:* audio/spectral fields for free.
8. **`entropy_map` as a universal mask** — "affect only busy regions" on any effect. *Reuses:* existing effect → mask. *Leverage:* a new gating dimension, no new code.
9. **`_mix` as a mappable wet/dry macro** — surface the container's per-effect `_mix` as a knob + a routing destination ("audio → wetness"). *Reuses:* existing synthetic key. *Leverage:* every effect gains a modulatable dry/wet + powers morph.
10. **Existing feedback effects as a "trail" source** — `feedback_phaser`/`temporal_blend` already ping-pong; expose their buffer as a generic trail field before the full field-solver lands. *Reuses:* existing stateful effects. *Leverage:* feedback-as-modulation now, substrate later.

## C · Determinism / parity / perf (CTO priorities)

11. **"Render-Safe" preset pack** — a curated set using only deterministic fields (tensor / classical-depth / entropy) → preview==export byte-identical by construction; show a **render-safe badge**. *Reuses:* determinism flags. *Leverage:* trust + a real product differentiator vs random-glitch tools.
12. **`change_gate` operator** — skip an expensive device when frame-delta < threshold (Stochastic Similarity Filter). *Reuses:* cheap frame-diff. *Leverage:* cuts render cost across **all** heavy effects, not just AI.
13. **Field Recorder (bake)** — bake an expensive field (depth) to a clip cache; run once, then scrub. *Reuses:* cache infra. *Leverage:* perf + determinism for the costly utilities.
14. **Sim/field LOD** — half-res compute + upscale for preview, full-res on export. *Reuses:* the two-mode live/render pattern. *Leverage:* makes the field-solver usable on a laptop.
15. **Preset cost meter** — each preset shows its PERF-MODEL class (real-time / heavy / export-only). *Reuses:* PERF-MODEL. *Leverage:* honest UX; no nasty surprises live.

## D · Product / ecosystem (cheap via reuse)

16. **Preset schema versioning + unknown-field-preserve** — presets survive app updates. *Reuses:* the `.dna` no-regression precedent. *Leverage:* sustainability — presets don't rot.
17. **Recipe-pack export/import** — presets are JSON; ship/share packs as files. *Reuses:* project persistence + import. *Leverage:* a sharing ecosystem with zero new format.
18. **ISF/SSF import → auto-starter-preset** — import a community shader as an effect *and* a ready preset. *Reuses:* the ISF-import idea + preset system. *Leverage:* a content firehose.
19. **Agent-native "make a look from text"** — an agent composes a pre-routed preset from a goal using the *same* route-out actions humans use. *Reuses:* the agent tool layer + human/agent parity. *Leverage:* a genuine differentiator; zero new engine.
20. **MIDI-mappable morph + preset-launch** — map composition-morph `t` and preset-apply to the H-series MIDI. *Reuses:* H1–H5 hardware mapping. *Leverage:* scene-launch / morph-on-the-beat for live/VJ, free.

---

## CTO ranking — what to build first (cost × leverage)
1. **#3 FieldProvider cache** — the enabler; everything triple-use depends on it.
2. **#12 change_gate** — cross-cutting perf win, tiny build.
3. **#9 `_mix` as mappable macro** — powers morph + wet/dry everywhere, near-free.
4. **#6 video_analyzer-as-field** + **#8 entropy-as-mask** — motion + gating fields shipped with zero new algorithm.
5. **#11 Render-Safe pack** + **#16 preset versioning** — trust + sustainability, cheap.

All twenty reuse existing systems; none is a rebuild. The pattern: **the cheapest features are the ones that expose something the engine already computes.**
