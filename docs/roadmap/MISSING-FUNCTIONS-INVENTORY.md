# Missing-Functions Inventory — Creatrix

> **Date:** 2026-06-11 · **Sources:** docs on `origin/main` (PRD.md, UX-SPEC.md, EFFECTS-INVENTORY.md, addendums), code grep of `frontend/src` + `backend/` working tree, and `docs/roadmap/` (ROADMAP.md, MASTER-SEQUENCE, synth-paradigm vision §6–§8, specs 1–7).
>
> **Question answered:** what would a user expect from a creative video editor with DAW paradigms (tracks, clips, device chains, automation, modulation, export) that Creatrix does **not** have today?
>
> **Legend:** Severity — **P1** expected-by-everyone · **P2** differentiating · **P3** luxury. Effort — S / M / L. Roadmap links use vision-doc IDs (B1–B10, C1–C8, E1–E8, SG-*) and ROADMAP.md tiers.

---

## 1. NEW Items Shortlist (not on roadmap, not cut) — prioritized

These are the genuine gaps: nobody planned them, nobody cut them, and users of this category of tool will expect most of the P1s on day one.

| # | Function | Category | Severity | Effort | Notes |
|---|----------|----------|----------|--------|-------|
| 1 | **Timeline snapping** (clip edges snap to playhead / markers / other clip edges / grid) | Timeline | P1 | S–M | Quantize grid exists for pads; no clip-edge snap at all. The single most-expected editing affordance in any NLE/DAW. |
| 2 | **Ripple delete + ripple trim** | Timeline | P1 | M | Deleting a clip leaves a gap; trims don't shift downstream clips. Every NLE has this. |
| 3 | **Marquee (rubber-band) clip selection** | Selection | P1 | S | `rangeSelectClips` exists in `stores/timeline.ts` but is **not wired to any UI handler** — half-built orphan. Wire a drag-rectangle to it. |
| 4 | **Save As + numbered project backups** | Project | P1 | S | PRD claims Cmd+Shift+S; no Save-As flow exists in code. Autosave overwrites — no version history of `.glitch` files. |
| 5 | **Media relink / missing-media dialog** | Project | P1 | M | Audio clips get a `missing` flag but there is no "locate file" UI; video clips have nothing. Moving a project folder silently breaks it. |
| 6 | **Still-frame export** (current frame → PNG, one click) | Export | P1 | S | Image-sequence export exists; no "export this frame" — basic for thumbnail/cover workflows in a glitch tool. |
| 7 | **Clip crossfades / transitions** | Clips | P1 | L | Audio fade in/out exists; zero video clip-to-clip transitions. 53 transition types already designed in `LAYER-TRANSITIONS.md` (PRD Phase 12+ note) but **on no roadmap tier** — needs scheduling, not design. |
| 8 | **Clip rename + clip color** | Clips | P1 | S | Tracks have colors; clips can't be renamed or colored. Painful at >10 clips. |
| 9 | **Speed ramping / keyframed time remap** | Clips | P2 | M–L | Constant `setClipSpeed` + `reverseClip` exist; no ramps. High creative value for a glitch tool (datamosh + ramp = signature look). |
| 10 | **Export presets** (save/recall named export settings) | Export | P2 | S | Full settings dialog exists; nothing persists between exports beyond defaults. |
| 11 | **Parameter randomize / dice** (per-device + per-rack "roll the dice") | Devices | P2 | S | Deeply on-brand for a chaos tool; zero randomization affordance exists. Pairs with existing seeded-determinism (re-roll seed). |
| 12 | **Automation curve-type editor UI** (linear/ease/S-curve per segment, bezier handles) | Automation | P2 | M | PRD specifies curve types per node; store holds raw points only, no curve UI shipped. |
| 13 | **LUT import / basic color management** | Color | P2 | M | 9 blend modes + color-tool effects exist; no .cube LUT loading, no working-space awareness. Expected in any video finishing path. |
| 14 | **Send/return (aux) effect routing** | Devices | P2 | L | Device groups are metadata-only; no shared/parallel effect buses. The Ableton paradigm the app imitates has sends as a core primitive. Adjacent to (but not covered by) B4-lite broadcast routing. |
| 15 | **Slip / slide / roll trim tools** | Clips | P2 | M | Only in/out trim exists. Slip especially matters once source-vs-timeline offset workflows appear. |
| 16 | **Track grouping / folder tracks** | Timeline | P2 | M | No track folders or group-mute/solo. (Device-level grouping is B5 on roadmap; **track**-level is not.) |
| 17 | **Proxy media / preview-quality toggle** | Performance | P2 | M–L | Dynamic resolution scaling exists during playback, but no persistent proxy generation for heavy sources (4K, long files). |
| 18 | **Browser hover/click preview** (preset & effect audition before applying) | Browser | P2 | M | Library has search/favorites/drag, but no preview thumbnail-on-hover or one-click audition — an Ableton browser staple. |
| 19 | **Time-range selection** (select a span of time across tracks, act on it) | Selection | P2 | M | No range tool; loop region is playback-only. Prereq for range-render, range-delete, range-consolidate. |
| 20 | **Consolidate / render-in-place at clip level** | Clips | P2 | M | Freeze/flatten exists at track-prefix level only; no "bounce selected clips to one clip." |
| 21 | **Project templates** | Project | P3 | S | New-project always starts blank. |
| 22 | **Cross-project clip/chain copy-paste** | Clips | P3 | M | Clipboard covers automation points only. |
| 23 | **Stem/track export** (per-track render output) | Export | P3 | M | PRD marks low-priority; not scheduled anywhere. |
| 24 | **OSC input** | Control | P3 | M | PRD "Phase 12+"; useful for VJ rigs; not on the current roadmap tiers. |
| 25 | **Light mode / theme customization** | UI | P3 | M | Settings shows Light as "coming soon"; nothing scheduled. |
| 26 | **Direct share/upload (socials, frame.io-style review)** | Export | P3 | L | Conflicts somewhat with local-first stance; record as luxury. |

---

## 2. Category Tables (full inventory, including roadmap-covered items)

### 2.1 Timeline & Editing

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Snapping (edges/markers/grid) | "I drag a clip and it lands exactly at the playhead." | No | P1 | S–M | No |
| Ripple delete / ripple trim | "I delete a clip and the gap closes." | No | P1 | M | No |
| Track grouping / folders | "I fold 6 texture tracks into one group and mute them together." | No (B5 is device-level only) | P2 | M | No |
| Time-range selection | "I select 4 bars across all tracks and delete/render just that." | No | P2 | M | No |
| Razor tool (click-to-cut mode) | "I switch to the blade and slice across tracks." | No (split-at-playhead exists) | P2 | S | No |
| Tempo track / project BPM map | "My quantize follows the song's tempo changes." | PRD Phase 12+, no tier | P3 | L | No |

Has today: multi-track timeline, named+colored markers, loop region, zoom (keys/wheel/fit), track mute/solo/lock/reorder/resize/opacity/blend, quantize grid for pads, split at playhead.

### 2.2 Clip Operations

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Crossfades / transitions | "Two clips overlap and dissolve (or glitch-wipe) between them." | Designed (LAYER-TRANSITIONS.md, 53 types) but **not on any tier** | P1 | L | No |
| Clip rename + color | "I label my clips so the timeline reads like a score." | No | P1 | S | No |
| Speed ramping / time remap | "Slow into the datamosh hit, snap back out." | No | P2 | M–L | No |
| Slip / slide / roll | "I shift the content inside the clip without moving its edges." | No | P2 | M | No |
| Clip-level consolidate / render-in-place | "Bounce these 3 stacked clips into one baked clip." | Partially (track-prefix freeze/flatten exists; clip-level no) | P2 | M | No |
| Cross-project copy/paste | "Copy a clip+chain from project A into project B." | No | P3 | M | No |

Has today: trim in/out, split, duplicate (Alt+drag), constant speed, reverse, gain, opacity, enable/disable, audio fades, transform (pos/scale/rot/flip), text clips with 7 animations.

### 2.3 Device Chains, Racks & Routing

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Send/return (aux) buses | "One feedback device processes sends from 4 tracks in parallel." | No (B4-lite is broadcast mod-routing, not FX sends) | P2 | L | No |
| Parameter randomize / dice | "Hit dice, the rack re-rolls into something new." | No | P2 | S | No |
| Rack macros (8 knobs over grouped devices) | "I map 8 macros over my glitch rack like an Ableton rack." | **Yes — B4 sample rack + 8 macros (Tier 4)**; UX-SPEC Cmd+G rack exists partially (groups are metadata-only) | P2 | — | No |
| Full sampler / instrument devices | "I play video like an instrument." | **Yes — B1 (merged #153/#155), B2/B3/B6/B7/B8 Tiers 4** | — | — | No |
| Routing canvas / operator graph UI | "I see and rewire my modulation graph." | **Yes — I2 Routing Canvas (Tier 2b, backend draft #142), PR-C operators** | — | — | No |
| A/B compare at project level | "Toggle between two whole arrangements." | No (effect-level `copyToInactiveAB` exists) | P3 | M | No |
| Plugin/extension API | "I write my own effect in Python." | **Yes — E7 Plugin SDK + SG-9 (Tier 7)** | — | — | No |
| VST/AU hosting | "Load my audio plugins." | PRD "way later", no tier | P3 | L | No |

Has today: per-track effect chains (~214 effects — registry count drifts; treat the ROADMAP §0 ledger as live), drag-reorder, bypass, dry/wet container, device groups (metadata), single-effect + chain presets with factory library.

### 2.4 Automation & Modulation

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Curve-type editor UI (ease/bezier per segment) | "I shape my automation, not just connect dots." | No (PRD specifies it; store has raw points only) | P2 | M | No |
| Envelope (ADSR) operator + curve editor | "Trigger an envelope onto any parameter." | Partially — pad-level ADSR exists; operator-level via **PR-C / Tier 2b** | P2 | — | No |
| Step sequencer operator | "Step-sequence my datamosh triggers." | **Yes — cross-modal v1.1 F1 datamosh sequencer (PR #36 plan)** | — | — | No |
| Video analyzer operator (motion/luma → mod source) | "Bright frames push the feedback amount." | **Yes — F2 motion angle (PR #36); Q7/L-backbone Tier 5 for deep features** | — | — | No |
| Macro modulator device | "One knob sweeps five parameters along curves." | **Yes — F3 macro device (PR #36)** | — | — | No |
| Cross-modal mod matrix (audio→video routing UI) | "Route the kick to the warp amount in a grid." | **Yes — B2 (Tier 3); audio_follower operator already exists** | — | — | No |
| Automation follow/relative modes (trim automation) | "Offset existing automation without rewriting it." | No | P3 | M | No |

Has today: per-track/effect/param lanes, point add/drag, region copy/paste-at-playhead, LFO + audio-follower operators, modulation routes, signal order Base→Mod→Automation→Clamp.

### 2.5 Export & Render

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Still-frame export | "Export this exact frame as a PNG." | No | P1 | S | No |
| Export presets | "Save 'IG Reel 1080x1920' and reuse it." | No | P2 | S | No |
| Stem/per-track export | "Render each track separately for compositing elsewhere." | PRD low-priority, no tier | P3 | M | No |
| Social upload / publish | "Export straight to TikTok." | No | P3 | L | No |
| Streaming / realtime output (Syphon/NDI) | "Send the canvas to my VJ rig." | No (PRD lists as not-yet; pairs with cut DAW-sync — check before proposing) | P3 | L | No |

Has today: MP4 (H.264/H.265), ProRes 422/4444, GIF, PNG/TIFF/JPEG sequences, resolution/fps/bitrate (CRF/CBR), quality presets, audio mux toggle, region export (full/loop/in-out), background render queue with ETA + cancel, deterministic seeded output.

### 2.6 Project & Media Management

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Save As | "Fork my project before a risky experiment." | No (PRD claims it; absent in code) | P1 | S | No |
| Numbered backups / version history | "Open yesterday's version after I wrecked the chain." | No | P1 | S | No |
| Media relink dialog | "Project opens, tells me 3 files moved, lets me locate them." | No (audio `missing` flag only, no UI) | P1 | M | No |
| Project templates | "Start from my 4-track glitch template." | No | P3 | S | No |
| Cloud sync / collaboration | — | No — **conflicts with local-first stance; treat as design decision, do not propose without explicit revisit** | P3 | L | de-facto |

Has today: `.glitch` JSON save/load, 30s autosave, crash-recovery dialog, recent projects, broad import (video/image/audio incl. HEIC/MXF), version string for forward-compat.

### 2.7 Browser & Library

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Hover/audition preview | "Hover a preset, see it on a thumbnail before committing." | No | P2 | M | No |
| Media pool / asset organization panel | "Tag and bin my source clips." | PRD lists as not-yet; PR-A layout redesign (browser tabs) is the landing zone — **link, don't duplicate** | P2 | M | Partially planned (PR-A) |
| Community preset sharing | — | **CUT — E3 Patch Gallery (see §4)** | — | — | **Yes** |
| ML preset recommendation | — | **CUT — E4 + suggestion-rank (see §4)** | — | — | **Yes** |

Has today: asset browser tab, searchable effect tree with fuzzy match + favorites, preset library with drag targets, 50+ factory presets, lazy scan + metadata sidecars.

### 2.8 Performance / Live + MIDI

| Function | User story | On roadmap? | Severity | Effort | Cut? |
|---|---|---|---|---|---|
| Clip launcher / session view, scenes, follow actions | "Launch clips in a grid like Ableton Session View." | **Yes (loosely) — B10 live-performance affordances + E6 Live Performance Mode (Tier 4/5)**; PRD says Phase 13+ | P2 | — | No |
| Launchpad / hardware grid bridge | "My Launchpad mirrors the pad grid." | **Yes — E5 (Tier 3, draft #145)** | — | — | No |
| 8x8 pad grid, velocity, retro-capture | PRD Phase 9 spec | Partially built (4x4 + MIDI CC mapping exist); rest unscheduled beyond PRD phases | P2 | M | No |
| MPE / MIDI 2.0 | — | No | P3 | L | No |
| OSC input | "Sync with my lighting rig." | No (PRD Phase 12+) | P3 | M | No |
| Ableton Link / DAW sync | — | **CUT — "DAW sync (G7)" (see §4)** | — | — | **Yes** |

Has today: 4x4 pad grid w/ QWERTY mapping, gate/toggle/one-shot, choke groups, per-pad ADSR, MIDI CC mapping + pad notes + clock sync, performance recording to timeline.

### 2.9 Audio (v2 debt — mostly already tracked)

| Function | On roadmap? |
|---|---|
| Audio tracks default-ON (currently flag-gated OFF) | **Yes — PR-4 un-flag + auto-extract (ROADMAP.md v2-debt track)** |
| Gain meter phase 3 | **Yes — v2 debt (#102/#105 shipped phases 1–2)** |
| Audio effects (EQ/comp) on audio tracks | No — P3, L (app is video-first; audio FX chains exist structurally but no audio DSP devices) |
| Audio recording input | No — P3, L |

### 2.10 UI / Preferences

| Function | On roadmap? | Severity |
|---|---|---|
| Hotkey discoverability (cheat sheet, 6 surfaces) | **Yes — #65 epic, v2 debt** | — |
| Region-select preview | **Yes — v2 debt** | — |
| Light mode / themes | No ("coming soon" stub) | P3 |
| Dockable / customizable panel layout | No (PR-A redesign is fixed-layout) | P3 |

---

## 3. Internal Orphans — built but unreachable

Features that exist in code today but no user can reach. Cheapest wins in the whole document: wire or delete.

**Half-built feature (wire it):**
- `rangeSelectClips` — `frontend/src/renderer/stores/timeline.ts` — range selection action with zero UI event handler. Wiring this + a marquee = shortlist item #3.
- `EXPERIMENTAL_AUDIO_TRACKS` — shipped (#30/#66) but flag default-OFF; un-flag is roadmap PR-4.
- Auto-update flow — `entropic.downloadUpdate()` / `installUpdate()` exposed in `preload/index.ts:135–141`, `UpdateBanner.tsx` exists, but nothing invokes them. Update pipeline is half-wired.

**Unmounted React components (zero importers):**
- `ParamSlider` — `frontend/src/renderer/components/effects/ParamSlider.tsx` (superseded by Slider/ParamPanel)
- `MacroKnob` — `frontend/src/renderer/components/library/MacroKnob.tsx` (relevant to B4 macros — candidate to revive, not delete)
- `ZoomScroll` — `frontend/src/renderer/components/timeline/ZoomScroll.tsx`

**Dead preload APIs:** `entropic.getPathForFile()` (preload/index.ts:5), `entropic.isPopOutOpen()` (preload/index.ts:153).

**Backend ZMQ handlers never called from renderer** (`backend/.../zmq_server.py`): `shutdown` (:245), `seek` (:266), `apply_chain` (:296), `render_text_frame` (:302), `audio_position` (:339), `audio_tracks_clear` (:355), `export_status` (:369), `effect_health` (:379), `effect_stats` (:381), `check_dag` (:383, test-only), `read_freeze` (:390), `memory_status` (:396).
Notable: `effect_health`/`effect_stats`/`memory_status` are ready-made backends for a **performance HUD / diagnostics panel** (P3, S — frontend-only work). `read_freeze` suggests the freeze read-path was never finished.

---

## 4. Cut by decision — DO NOT RE-PROPOSE

Locked in `docs/roadmap/plans/entropic-synth-paradigm-vision.md` §6–§7 (Round-1 decisions). Listed so future inventories don't resurrect them.

| Cut item | Where recorded |
|---|---|
| B5 Cross-stem cross-modal (stem separation) | vision §6 B5 — "Cut — stem separation not needed. B2 handles whole-audio routing." |
| D1 Pixel-as-waveform oscillator (+ V→A→V feedback) | vision §6 D1 + §7 |
| E3 Patch gallery (community sharing) | vision §6 E3 — out of immediate scope |
| E4 Latent recommendation | vision §6 E4 — deferred (depends on E3) |
| LLM-as-co-editor | vision §7 |
| DAW sync (Ableton Link etc.) — G7 | vision §7 |
| Eurorack CV — G8 | vision §7 |
| Suggestion-rank heuristic (ML browser ranking) | vision §7 — explicit categorical browsing instead |
| Telemetry | vision §7 — external user-test at Tier 4 instead |
| Generative-no-source mode | vision §7 — deferred; reference clip required for v1 |
| Pricing (v1) | vision §7 — ship free, decide later |
| Windows/Linux (v1) | vision §7 — Mac-first |

**Deferred-not-cut** (revisit at the named tier, don't propose earlier): Hilbert/polar/learned-MLP axis bindings (research tier) · fractional axis positions (Tier 4+, with granulator) · tensor trigger payloads (Tier 5+) · A4 wavelet/recursive-F · C4 arbitrary-effect wrapper + multi-band · A5 identity-curve/multi-frame grains · B1 sampler UX evolution (post PR-A).

---

## 5. Method note

Derived by diffing three sets: (a) DAW conventions from the Ableton paradigms the project explicitly imitates (racks, sends, freeze/flatten, follow actions, clip launching, browser audition), (b) NLE conventions (ripple/roll/slip/slide, snapping, transitions, proxies, relink, LUTs, speed ramps, save-as/backups), (c) the app's actual code surface (grep of stores, dialogs, IPC, preload) cross-checked against PRD claims — several PRD-claimed features (Save As, curve-type UI, marquee select) are documented but not implemented, and are listed here as missing. Items already on the roadmap link to their vision-doc ID/tier rather than being re-specified.
