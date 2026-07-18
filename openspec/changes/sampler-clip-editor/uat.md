# UAT — sampler-clip-editor

> Method legend: [V]=vitest · [PT]=backend pytest · [E2E]=Playwright `_electron` OS-pointer
> (drag/draw rows are NEVER CU — proven 4×) · [CU]=computer-use visual check · [M]=manual.

| # | Row | Expected | Method |
|---|---|---|---|
| 1 | Load a clip into sampler via picker | FrameStrip renders thumbnails at density ≈ width/100px, clamp 1-12 | [V]+[CU] |
| 2 | Drag across strip | Region in/out set; handles visible; store updated | [E2E] |
| 3 | Drag region edge handles | Region resizes; in<out enforced; clamps at [0,frameCount-1] | [E2E] |
| 4 | Loop ON + trigger pad | Playback loops region per dir (fwd/rev/pingpong) — audible/visible wrap | [V parity]+[CU] |
| 5 | Loop OFF regression | Playback byte-identical to pre-change (standing regression gate) | [V parity] |
| 6 | Crossfade > 0 | Seam blend layers emitted, weights sum 1±1e-6 (existing oracle re-run) | [V] |
| 7 | Grid=BPM, snap on | Region edges snap to `quantizeFrame` boundaries from anchor; changing BPM moves grid (anti-dead-flag) | [V] |
| 8 | Grid=CLIP | Divisions of region length from region.in; no-region → anchor 0 | [V] |
| 9 | Local division chip | Overrides global without changing timeline's `quantizeDivision` | [V] |
| 10 | Hover-scrub | Cached thumb shown per pointermove; ZERO render IPC until rest/release; one render then | [V mock-IPC] |
| 11 | Drag timeline clip → sampler | Source set + region preselected to clip's trim | [E2E] |
| 12 | Drag timeline clip → empty app area | Media-import path NOT triggered (discriminator) | [V]+[E2E] |
| 13 | Instrument-type drag still works | Browser→track-header instantiation unchanged | [V] |
| 14 | Clip trim/move on timeline unchanged | draggable=true doesn't break existing pointer interactions | [E2E] |
| 15 | Right-click region → Crop | New asset created (out-in+1 frames, decodable); sampler source swapped; region reset | [PT]+[CU] |
| 16 | Crop negatives | Traversal path / in≥out / NaN rejected `ok:false`, no file written, server up | [PT] |
| 17 | Crop undo | Compound transaction reverts source swap AND removes asset reference | [V] |
| 18 | Save/reopen project | Region+loop+grid state round-trips (rides #322 guard) | [V] |
| 19 | Frame-Bank slots | Real thumbnails render; dedupe: N slots same clip = 1 thumbnail request | [V] |
| 20 | Rack pads | Static source thumb per pad; no request storm on breadcrumb nav (16-pad fixture) | [V] |
| 21 | Export parity | Region-trimmed looped sampler track: export == preview frame indices (parity table) | [PT]+[V] |
| 22 | MIDI-learn on new controls | Right-click loop/dir/crossfade → learn menu present + functional | [CU] |
