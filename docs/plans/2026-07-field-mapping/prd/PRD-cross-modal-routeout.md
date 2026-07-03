# PRD — Cross-Modal Route-Out (visual field → audio param)

> **Immutable stakeholder input** (exact quotes):
> - "cross modal route out is worth it if there are presets so people have some seed ideas"
>
> _Type:_ framework extension · _Status:_ 🟢 drafted (greenlit, **conditional on presets**) · _Depends on:_ Mapping Framework (K1); audio engine params

## 1. Problem / why
The router treats visual fields as sources. Nothing stops a field from targeting an **audio** parameter — Tensor coherence → a filter cutoff, motion → reverb send, entropy → grain density. This closes the audio↔visual loop inside one tool. **The user's condition is explicit: it only ships with seed presets** so people aren't staring at a blank cross-modal patchbay.

## 2. What it does (scope)
- Extends valid `ModEdge` destinations to include audio-engine params (via a `reduce` to scalar — an image field → one control value, or a per-band field → per-band audio controls).
- Ships **seed presets** (the gating requirement): e.g., "Brightness → master filter," "Motion → reverb send," "Entropy → bitcrush depth," "Tensor coherence → resonance."
- **Out of scope:** full modular audio patching; per-sample-rate visual control (visual is frame-rate → smoothed to audio-rate via existing `smooth`/lag).

## 3. Composable parts 🔒 + ⚠️ the real obstacle (review 2026-07-03)
- `reduce` binding rule (from K1) does field→scalar.
- Existing signal `processor` (`smooth`/`quantize`/`scale`) bridges frame-rate → audio-rate.
- **⚠️ [verified] Audio params live in a SEPARATE system (`automation.ts`); the modulation engine resolves `ModEdge.dst` against *effect* params, not audio.** So field→audio is **not** "add to the destination registry" — it requires **bridging the modulation output into the audio automation/param system** (a new dst-kind `audio:<param>` that the engine writes into the audio store). Re-scoped from wiring → small integration. This is why P6 is late + preset-gated; it does not threaten the W0→E2 critical path.

## 4. The three surfaces
- **Preset (REQUIRED):** the seed patches above are the front door — one click, hear it.
- **Suggested:** on a field source, "route out ▸ audio" lists the seed destinations.
- **Full:** any field → any audio param at custom depth/curve/smoothing.

## 5. Acceptance criteria (oracle)
- [ ] At least 4 seed presets ship and each audibly modulates its target (documented A/B).
- [ ] Frame-rate field → audio param is smoothed (no zipper noise) — measured.
- [ ] `reduce`-to-scalar audio edge round-trips save/load.
- [ ] Rate-mismatch handled (visual ~30–60fps → audio-rate) without clicks.

## 6. Risks / open 🌱
- **Do NOT ship without presets** (explicit stakeholder gate). If presets slip, the feature slips.
- Frame→audio rate bridging is the real engineering risk — smoothing/interp must be clean.
- Feedback loops (audio→visual→audio) need the single-tick-delay cycle guard (exists in `engine.py`).
- 🌱 Reverse direction (audio field → visual) already partly exists via `audio_follower`; this PRD is the visual→audio half.

## 7. Ancillary wins
The sonification-loop idea becomes real; a visual performance can *play* the audio; deepens the "one instrument" identity.
