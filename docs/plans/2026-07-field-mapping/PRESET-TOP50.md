# The Gated Launch Set — 50 max (hard cap)

**Gate discipline:** the shipped preset library is **≤50**, best-of-breed. Ideas beyond 50 live in `PRESET-CATALOG.md` / `PRESET-ARTDIRECTOR-20.md` as the bench, not the roster. Scored on **swap-into-new-spaces + standalone-cool + novelty + distinctiveness**; filtered to **no additional builds** (presets/wirings only — sims, infra, and experiments excluded).
**Tag:** 🟢 ships today (existing effects + existing operators) · 🔵 free once the field-mapping core lands. **swap▸** = the axis to explore.

Merged from the technical catalog + the Art Director's 20 (deduped). What got cut to hold the line at 50 is listed at the bottom.

---

## Tier 1 · Swap-families — the explorable engines (7)
*One patch, N spaces. Ship first — they teach exploration.*
1. **Field → Displace** 🔵 — swap▸ field (tensor/depth/flow/entropy/luma) = 5 warps.
2. **Field → Any-Param** 🔵 — swap▸ destination (hue/blur/grain/kaleido/sat).
3. **Audio → Any-Param** 🟢 — swap▸ target; reactivity on any effect, today.
4. **Reactive-Anything** 🟢 — `video_analyzer.motion → <any effect>`; swap▸ the effect.
5. **Rack Focus** 🔵 — `Depth → blur`, focal ← audio; swap▸ the focal driver.
6. **Self-Steering Flow** 🔵 — `Structure Tensor → Displace` (feedback); swap▸ add coherence→hue.
7. **One-Field Triptych** 🔵 — Field → Displace + Hue + Blur at once; swap▸ the field.

## Tier 2 · Signature Looks — named, referenced, ownable (20)
*Anti-blanding: each is describable without showing it. Palette-restrained (1–3 colors). ~12 ship today.*
8. **Menkman Compression** 🟢 — directable datamosh (Rosa Menkman).
9. **Riley Op** 🟢 — B&W perceptual vibration (Bridget Riley).
10. **Atkins Blue** 🟢 — cyanotype, one hue (Anna Atkins).
11. **Klein Field** 🟢 — one-ultramarine monochrome (Yves Klein).
12. **Risograph** 🟢 — two-ink fluoro misregistration.
13. **Sabattier** 🟢 — solarized silver-gelatin (Man Ray).
14. **Aerochrome** 🟢 — IR magenta/cyan film (Mosse).
15. **Chromastereo** 🟢 — red/blue floating-depth illusion.
16. **Murata Melt** 🟢 — datamosh-as-sculpture (Takeshi Murata).
17. **Xerox Degrade** 🟢 — first-gen copy-art, blown B&W.
18. **Demoscene** 🟢 — amber ASCII on black.
19. **Constructivist Cut** 🟢 — red/black/cream, hard geometry (Rodchenko).
20. **Chladni Ink** 🟢 — two-ink reaction-diffusion sound-figures.
21. **Paik Scan** 🔵 — bent raster, phosphor green (Nam June Paik).
22. **Rutt-Etra Relief** 🔵 — luminance-terrain wireframe.
23. **Molnár Grid** 🔵 — controlled-disorder plotter art (Vera Molnár).
24. **Albers Weave** 🔵 — woven cloth from the grain (Anni Albers).
25. **Ukiyo-e Flat** 🔵 — flat planes + fine linework (woodblock).
26. **Ferrofluid** 🔵 — sculptural black-chrome spikes (Kodama).
27. **Blueprint** 🔵 — white line on cyan technical drawing.

## Tier 3 · Field-driven standouts (14)
28. **Structure-Reactive Glitch** 🔵 — corruption follows the forms.
29. **Wet Oil** 🔵 — anisotropic Kuwahara, coherence→brush.
30. **Depth Diorama** 🔵 — paint FG / mosh BG.
31. **Motion Smear** 🔵 — footage drags itself along flow.
32. **Marbled Paper** 🔵 — grain-flow warp then paint.
33. **Reactive Mosh** 🔵 — directable datamosh, flow→intensity.
34. **Grain Kaleido** 🔵 — symmetry tracks orientation.
35. **Deep Motion** 🔵 — `Flow × Depth → Displace`.
36. **Clean Structure** 🔵 — `Tensor − Entropy → Kuwahara`.
37. **2.5D Parallax** 🔵 — depth→Displace + slow LFO.
38. **Aerial Perspective** 🔵 — depth desaturates the far field.
39. **Sonify Structure** 🔵 — coherence → audio filter cutoff (cross-modal seed).
40. **Coherence Bloom** 🔵 — structured regions glow.
41. **Reaction Skin** 🔵 — RD density driven by depth.

## Tier 4 · Reactive / quick — ships-today workhorses (9)
42. **Paint-Then-Glitch** 🔵 — the house style.
43. **Beat Kaleido** 🟢 — sides snap on onset.
44. **Spectrum Bands** 🟢 — F-band → row inversions.
45. **Entropy Mask** 🟢 — affect only busy regions; swap▸ the effect.
46. **`_mix` Reactive Wet/Dry** 🟢 — audio → any effect's dry/wet.
47. **Chromagram Palette** 🟢 — recolor to the music's key.
48. **Attractor Drive** 🟢 — strange-attractor orbit → any param.
49. **Feedback Trail Mod** 🟢 — temporal_blend buffer → Displace (poor-man's field-solver).
50. **VHS Painting** 🔵 — oil paint on decayed tape.

---

## Cut to hold the line at 50 (the bench, not the roster)
Weak/duplicative technical fillers dropped so the Art Director's signature looks could take slots: *Duotone Beat, Posterize Pulse, Wave Beat, Kaleido Zoom, Solar Flow, Grid Moiré Drift, Onset Strobe, Fog Depth, Focus Stutter, Wind, Motion Bloom, Weighted Bloom, Halftone Structure, Ink & Wash, Etch, Sorted Structure, Contour Depth, Gouache Poster, Palette Knife, Orientation-Map-as-look.* Also excluded by the no-build filter: all field-solver sims (Slime Portrait, Curl Smoke, Living Paint, Lenia), CTO infra, mad-scientist experiments.

**Composition of the 50:** ~24 🟢 ship-today · ~26 🔵 free-once-core · 7 swap-families · 20 signature/referenced looks. That's a launch library with identity *and* explorability, none of it requiring net-new engine work.
