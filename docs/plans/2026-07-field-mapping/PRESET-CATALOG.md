# Pre-Routed Preset Catalog (recipe packs)

**Status:** ideation (a big free batch, per stakeholder). Each is a **pre-routed chained preset** — devices (in order) + the modulation edges that wire them + params — applied in one click, fully inspectable/editable afterward (transparency invariant).

**Notation:**
- Chain: `Device → Device → Device` (left→right signal flow).
- Edge: `[Src.field → Dst.param : rule]` (a `ModEdge`; `rule` = broadcast/sampleAt/scanOver/integrate/remap/reduce…).
- `⟨audio⟩` = an audio-reactive variant (an `audio_follower` drives a param). `＋move` = the "one more move" upgrade suggestion.
- Devices reference real Creatrix effects (lowercase) + the new utilities/destinations (Title Case).

---

## Pack 1 · Painterly & Ink (Kuwahara / NPR)

1. **Wet Oil** — `Structure Tensor → kuwahara(anisotropic)` `[coherence → kuwahara.radius : scanOver]`. Brushwork flows with structure; strokes fatten in flat areas. ⟨audio⟩ `[audio.rms → kuwahara.q]` breathes with the track.
2. **Ink & Wash** — `kuwahara → edge_detect(soft) → duotone`. Painterly fill with drawn ink outlines, two-tone. ＋move: `Depth → saturation` for aerial fade.
3. **Loving Vincent** — `kuwahara(motion-coherent) → soft_bloom`. Flicker-free moving oil painting with a gentle glow. Deterministic; good for export.
4. **Gouache Poster** — `kuwahara(classic) → posterize → contour_lines(subtle)`. Flat poster paint with topographic edges.
5. **Palette Knife** — `Optical Flow → kuwahara` `[flow.mag → kuwahara.radius : scanOver]`. Bigger strokes where the footage moves — energy becomes impasto.

## Pack 2 · Self-Referential (structure-tensor steering)

6. **Self-Steering Flow** — `Structure Tensor → Displace` `[coherence → Displace.field : scanOver]` (feedback). Image liquefies along its own grain. ＋move: `[coherence → hue_shift.angle : remap]` = iridescent liquid metal.
7. **Marbled Paper** — `Structure Tensor → Displace → kuwahara`. Grain-flow warp, then painted → endpaper marbling.
8. **Grain Kaleido** — `Structure Tensor → kaleidoscope` `[θ → kaleidoscope.angle : sampleAt]`. Symmetry that tracks the image's orientation, not a fixed spin.
9. **Coherence Bloom** — `Structure Tensor → soft_bloom` `[coherence → bloom.intensity : scanOver]`. Structured regions glow; flat areas stay matte.
10. **Etch** — `Structure Tensor(lines) → channelshift` `[θ → channelshift.angle]`. Engraved line-field driven by orientation.

## Pack 3 · Cinematic Depth (depth-as-modulation)

11. **Rack Focus** — `Depth → blur` `[depth → blur.radius : remap(curve)]` `[audio.rms → Depth.focal]`. Focus pulls through the scene on the beat. The one you flagged.
12. **Aerial Perspective** — `Depth → saturation` `[depth → saturation.amount : remap]` + `[depth → brightness]`. Far field desaturates and lifts — instant atmosphere.
13. **2.5D Parallax** — `Depth → Displace` `[depth → Displace.field : scanOver]` `[LFO(slow) → Displace.amount]`. A flat frame gains a breathing parallax wobble.
14. **Depth Diorama** — `Depth(mask FG) → kuwahara` / `Depth(mask BG) → datamosh`. Painted foreground, moshed background — one clip, two worlds.
15. **Fog Depth** — `Depth → soft_bloom` `[depth → bloom.intensity]` + far-field tint. Volumetric haze from a 2D frame.
16. **Focus Stutter** — `Depth → blur` `[step_sequencer → Depth.focal]`. Focal plane hops between depth bands rhythmically.

## Pack 4 · Motion-Reactive (optical flow)

17. **Motion Smear** — `Optical Flow → Displace` `[flow.vec → Displace.field]`. Real footage motion drags the pixels — living smear.
18. **Wind** — `Optical Flow → edge_pixel_wind` `[flow.mag → wind.strength : scanOver]`. Edges stream where things move.
19. **Freeze-Melt** — `Optical Flow → temporal_blend` `[flow.mag → blend.feedback]`. Still areas freeze; moving areas melt.
20. **Motion Bloom** — `Optical Flow → soft_bloom` `[flow.mag → bloom.intensity]`. Movement lights up.
21. **Reactive Mosh** — `Optical Flow → datamosh` `[flow.mag → datamosh.intensity]`. Corruption follows motion (a controlled datamosh).

## Pack 5 · Living Systems (field-solver: physarum / fluid / RD)

22. **Slime Portrait** — `physarum(seed=image, forage=luminance)`. The frame dissolves into a network of its own colors. ⟨audio⟩ `[audio.onset → physarum.deposit]` pulses the trails.
23. **Slime Follows Motion** — `Optical Flow → physarum` `[flow.vec → physarum.steer]`. Agents forage along the footage's movement.
24. **Curl Smoke** — `curl_fluid(seed=image)` `[LFO → fluid.speed]`. The image advects like smoke.
25. **Reaction Skin** — `reaction_diffusion` `[Depth → RD.feed : scanOver]`. Turing patterns grow denser in the near field.
26. **Ferro** — `Structure Tensor → curl_fluid` `[θ → fluid.direction]`. Fluid flows along the image's grain — ferrofluid look.
27. **Living Paint** — `physarum → kuwahara`. Slime networks, then painted — a moving fresco.

## Pack 6 · Painted-Then-Broken (glitch fusion — the signature)

28. **Paint-Then-Glitch** — `kuwahara → channelshift → row_shift`. Painted canvas, then corrupted. The house style.
29. **Structure-Reactive Glitch** — `Structure Tensor → datamosh` `[coherence → datamosh.intensity : scanOver]`. Corruption follows the image's forms, not randomness.
30. **Depth Datamosh** — `Depth → datamosh` `[depth → datamosh.intensity]`. Only the background dissolves; the subject holds.
31. **Sorted Structure** — `Structure Tensor → pixelsort` `[coherence → pixelsort.threshold : scanOver]`. Sorting gated by structure — organized chaos.
32. **VHS Painting** — `kuwahara → vhs`. Oil paint on a decayed tape — nostalgic + hand-made.

## Pack 7 · Audio-Reactive / Cross-Modal

33. **Pulse Focus** — `Depth → blur` `[audio.rms → Depth.focal]`. (Rack focus, audio-driven — the crowd-pleaser.)
34. **Beat Kaleido** — `kaleidoscope` `[audio.onset → kaleidoscope.sides : sampleAt]`. Symmetry snaps on hits.
35. **Spectrum Bands** — `[spectral.band[F] → invert_bands.rows : scanOver]`. Audio frequency bands paint horizontal inversions.
36. **Sonify Structure** *(cross-modal, needs presets)* — `Structure Tensor → [coherence → audio.filter.cutoff : reduce]`. The image *plays* the filter — one of the required seed patches for the cross-modal gate.
37. **Onset Strobe** — `strobe` `[audio.onset → strobe.trigger]`. Clean beat strobe, no manual tempo.

## Pack 8 · Compound Fields (Field Mixer)

38. **Deep Motion** — `Field Mixer(Optical Flow × Depth) → Displace`. Warp by motion *only where it's deep* — near-field stillness, far-field drift.
39. **Clean Structure** — `Field Mixer(Structure Tensor − Entropy) → kuwahara`. Paint where it's structured *but not busy* — avoids muddying detailed regions.
40. **Weighted Bloom** — `Field Mixer(Luminance + Coherence) → soft_bloom`. Glow driven by brightness *and* structure together.

## Pack 9 · Signal / Analytic (the field viz as the look)

*The utility outputs are striking on their own — ship them as looks.*
41. **Orientation Map** — `Structure Tensor(flow-hue)`. The tensor field as a psychedelic flow map. Album-art ready.
42. **Depth Relief** — `Depth(inferno)` + `contour_lines`. Topographic depth render.
43. **Entropy Heat** — `entropy_map(false_color)`. Information density as a thermal image.
44. **Flow Field** — `Optical Flow(vector-hue)`. Motion as color — a data-viz aesthetic.

---

## Notes for the build
- Each preset = one `effect_chain` Preset with `chainData.effects` + the bundled `ModulationRoute[]` (the flagship PRD extension). Grounded in real effect ids where named.
- Packs = folders in the Presets Library.
- **Related-preset suggestions** draw from these: a chain containing `kuwahara` surfaces Pack 1 + #28 (Paint-Then-Glitch) + the "＋ Structure Tensor = self-steering" one-more-move.
- Audio-reactive variants ⟨audio⟩ reuse the existing `audio_follower` operator — no new tech.
- Everything here is inspectable after apply (open the chain + Matrix) — presets teach.
