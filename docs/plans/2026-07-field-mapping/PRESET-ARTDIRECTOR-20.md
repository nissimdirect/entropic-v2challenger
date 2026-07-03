# Art Director — 20 aesthetically-directed presets

**The brief to myself:** no generic "glitch filter." Each preset is a *named look* with a **specific reference**, a **restrained palette** (1–3 colors — restraint signals confidence), and enough distinctiveness that you could describe it without showing it. No builds — wirings of real effects. Tag: 🟢 ships today (existing effects) · 🔵 needs the planned tensor/depth/displace/kuwahara.

> Eno note: pair any of these with a swap-family (from PRESET-TOP50) and you have a *generative system*, not a single artifact — the look holds while the source swaps.

1. **Atkins Blue** — *ref:* Anna Atkins cyanotypes (1843). *palette:* Prussian blue + paper white, one hue. `cyanotype → film_grain(fine)`. Botanical-blueprint timelessness — not a "vintage" filter, a photographic *process*. 🟢
2. **Menkman Compression** — *ref:* Rosa Menkman / glitch theory. *palette:* native + cyan/magenta fringe. `datamosh(controlled) → channelshift(subtle)` `[video_analyzer.motion → intensity]`. Directable corruption, not random noise — the whole anti-"glitch-filter" thesis. 🟢
3. **Paik Scan** — *ref:* Nam June Paik / Rutt-Etra video synthesis. *palette:* CRT phosphor green. `Structure Tensor → Displace(scanline) → scanlines`. The image as a bent raster — video-art heritage. 🔵
4. **Riley Op** — *ref:* Bridget Riley op-art. *palette:* black & white only. `grid_moire + invert_bands` `[LFO → phase]`. Perceptual vibration as fine art, not decorative moiré. 🟢
5. **Molnár Grid** — *ref:* Vera Molnár, early generative plotter art. *palette:* one ink on paper-white. `Structure Tensor → kaleidoscope(rect)` `[coherence → jitter]`. Controlled disorder — the generative-art lineage. 🔵
6. **Risograph** — *ref:* riso print. *palette:* fluoro-pink + blue, strict two-ink. `duotone → ascii_art(halftone dots) → film_grain` (slight misregistration). Print-craft you can *smell*. 🟢
7. **Sabattier** — *ref:* Man Ray solarization. *palette:* silver-gelatin mono. `solarize → tape_saturation`. The darkroom accident as authorship. 🟢
8. **Aerochrome** — *ref:* Kodak infrared / Richard Mosse. *palette:* magenta foliage, cyan sky. `infrared` `[Depth → intensity]`. A specific *film stock*, not "make it pop." 🟢 (🔵 for depth drive)
9. **Blueprint** — *ref:* architectural cyanotype. *palette:* white line on blue. `Structure Tensor(lines) → cyanotype`. The frame rendered as a technical drawing. 🔵
10. **Albers Weave** — *ref:* Anni Albers, Bauhaus textile. *palette:* 2–3 earth tones. `Structure Tensor → Displace(warp+weft grid)`. Woven cloth from the image's own grain — craft, not "distort." 🔵
11. **Murata Melt** — *ref:* Takeshi Murata, *Monster Movie*. *palette:* molten native + bruise. `datamosh(heavy) → domain_warp` `[Optical Flow → warp]`. Datamosh elevated to sculpture. 🟢 (🔵 for flow drive)
12. **Chladni Ink** — *ref:* cymatics / Chladni figures. *palette:* two-ink. `reaction_diffusion(worms) → duotone`. Sound-figure patterning — a scientific image, beautifully. 🟢
13. **Xerox Degrade** — *ref:* copy-art / punk zine (Bruno Munari's "original degradations"). *palette:* blown B&W. `bitcrush → posterize(2) → film_grain(heavy)`. First-generation photocopy honesty. 🟢
14. **Chromastereo** — *ref:* chromostereopsis. *palette:* pure red + blue on black. `channelshift(red fwd/blue back)` `[Depth → offset]`. Colors that literally float at different depths — a perceptual trick you own. 🟢 (🔵 for depth)
15. **Klein Field** — *ref:* Yves Klein IKB monochrome. *palette:* one ultramarine. `false_color(single IKB ramp) → soft_bloom`. Restraint taken to its limit — the confidence of one color. 🟢
16. **Rutt-Etra Relief** — *ref:* the Rutt-Etra scan processor. *palette:* wireframe green. `Depth → Displace(horizontal-line relief) → scanlines`. Luminance-as-terrain, the definitive 70s synth look. 🔵
17. **Constructivist Cut** — *ref:* Rodchenko / El Lissitzky. *palette:* red + black + cream. `posterize(3) → duotone → contour_lines`. Soviet-poster boldness, hard geometry. 🟢
18. **Ukiyo-e Flat** — *ref:* Japanese woodblock. *palette:* muted natural, flat planes. `kuwahara → posterize → contour_lines(fine outline)`. Flat color + fine linework — woodblock craft. 🔵
19. **Ferrofluid** — *ref:* Sachiko Kodama's magnetic-fluid sculpture. *palette:* black chrome, near-mono. `Structure Tensor → domain_warp` `[coherence → warp]`. Sculptural spikes, not a "liquify." 🔵
20. **Demoscene** — *ref:* 90s ASCII / demoscene. *palette:* amber-on-black. `ascii_art(dense) → false_color(amber) → scanlines`. Computed-text craft — honest mono, no cosplay. 🟢

---

## The Art Director's take
- **~12 ship today** (🟢) — cyanotype, solarize, infrared, riso, op-art, datamosh, RD, xerox, Klein, constructivist, demoscene, chromastereo. These are a **distinctive first wave** with *zero* new code — and they immediately answer the anti-blanding problem: each is a named, ownable look, not "glitch preset #47."
- **Restraint is the throughline** — nearly all are 1–3 colors. That is the single biggest lever against looking like every other effects app.
- **Every one names a reference** — Menkman, Paik, Riley, Molnár, Albers, Murata, Klein, Rodchenko, Kodama. That's Pop Chaos's rule (credit specifics) *and* what makes a look defensible: you can say *why* it exists.
- **Pair with a swap-family** (PRESET-TOP50 §S-tier) and each becomes a generative system — the Menkman look holding while the source clip, the driver, or the field swaps underneath. That's Eno's "design the conditions, not the artifact."
