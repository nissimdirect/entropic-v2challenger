# CYM — Cymatics Lab (Liquid Cymatics Generator + Refraction) · PRD

**Status:** DRAFT, awaiting user verdicts (OD-1…OD-6 below) · **Date:** 2026-09-07
**Category:** GENERATORS (answers `browser-folders` OD-5 "GENERATORS-real-leaves")
**Related:** `openspec/changes/browser-folders` · `openspec/changes/layertap-matte-v1` ·
`docs/roadmap/ROADMAP.md` · design brief `~/.claude/plans/creatrix-cymatics-generator-brief.md`

## Stakeholder input (verbatim, immutable)

> "we should also cannibalize biotemple code for a cymatics generator for the generators
> section" — user, 2026-09-07

> "Continue ur proposal on how to soup up the pieces we already have and combine / augment
> with the biotemple thing and add it to the roadmap as a prd . We don't want mic driven we
> want to map to an audio source btw" — user, 2026-09-07

Reference link supplied by user: BioTemple Cymatics Lab PRO (biotemple.earth).

## 0. Reference finding — there is no code to cannibalize

BioTemple Cymatics Lab PRO is **closed-source paid Windows software** ($69.36; $10 14-day
pass). Its stated feature set, verbatim: *"Real-time wave simulation, optical caustic
controls, vessel mask loading, procedural and PNG-based light rings, scene-ring lighting,
morph sequences, performance mode, projector output, screenshot capture."* Simulation-based
(not camera capture); adjustable by frequency, water depth, container shape, illumination;
supports running **video beneath the cymatics**.

**Legal line (normative):** reimplement the *technique* only — cymatics is physics and
caustic rendering is standard graphics literature; features and ideas are not copyrightable.
**Never** decompile or reverse-engineer their binary, ship their PNG light-ring assets, or
use their branding. Same discipline as the Noise Canvas cannibalization pass.

**What we actually cannibalize:** the user's OWN code at `~/Development/cymatics/`
(Chaos Visualizer) — `modes/chladni.py` (243 lines, Chladni nodal equation + audio mapping),
plus `ferrofluid.py`, `rubenstube.py`, `reaction.py`, `geometric.py`. No license question.

## 1. What it is

A **liquid-surface cymatics simulation** that ships as two faces of one core:

- **`gen.liquid_cymatics`** — renders the simulated water surface itself (shading +
  caustics + ring light), constrained by a vessel boundary. A generator.
- **`fx.liquid_refract`** — uses the same surface's gradient as a displacement map to
  **refract the layer beneath it**. This is BioTemple's "video beneath cymatics" feature,
  and it is the one that is Creatrix-native rather than novelty: your own footage seen
  through vibrating water.

Plus a cheap pattern-setting port:

- **`gen.chladni`** — the user's existing dry-plate Chladni mode (sand on nodal lines),
  ported to the Creatrix effect contract. Different physics from the liquid sim, different
  look, ~1:1 port.

All three are **driven by a selected audio source** (§3), not by a microphone.

## 2. Souping up what already exists (verified against main, 2026-09-07)

| Need | Already in-repo | Verdict |
|---|---|---|
| Offset-map pixel sampling (refraction) | `fx/wave_distort.py` (vectorized, 1080p ~40ms), `fx/flow_distort.py`, `fx/displacement.py`, `fx/pixel_flow_field.py` | **Reuse.** Refraction = an offset map; the optimized sampling pattern is solved. |
| Vessel / container boundary | mask-stack (per-effect mask row, DeviceCard); `fx.chroma_key`/`luma_key`/matte sources | **Reuse.** A "vessel" is a boundary mask, not new machinery. Custom shapes ride the existing matte path. |
| Per-band audio analysis | `modulation/audio_follower.py::evaluate_audio` — methods `rms`, `frequency_band`, `onset` → 0..1 | **Reuse.** Band analysis exists; we do not write an analyzer. |
| Modulatable params | `effects/field_params.py` / `field_source.py` (FieldRef schema, `field_capable`) | **Reuse.** Frequency/depth/amplitude become field-capable floats — modulatable by the existing system. |
| Determinism | `engine.determinism.make_rng` | **Reuse.** All stochastic seeding routes through it. |
| Effect contract | `EFFECT_ID` + `EFFECT_NAME` + `EFFECT_CATEGORY` + `PARAMS` + `apply()`; registration by **explicit import** in `effects/registry.py` (~:250/:384) | **Follow exactly.** Auto-discovery does NOT exist — a missing import = "unknown effect: fx.X". |
| "Morph sequences" (BioTemple feature) | automation lanes + presets | **Already have it.** Do not build a bespoke morph system. |
| "Projector output" (BioTemple feature) | pop-out window (`main/pop-out-window.ts`) → `multiwindow-stage-a` | **Already queued.** Do not duplicate; this PRD depends on, not rebuilds, that epic. |
| "Screenshot capture" | existing export-current-frame path | **Already have it.** |

**Net new code:** one shared liquid-sim kernel + two thin render/displace faces + the audio
source binding (§3). Everything else is composition of shipped parts.

## 3. Audio source mapping (the core requirement — "not mic driven")

**Current state (verified):**
- `_get_audio_pcm_for_frame(frame_index, fps)` (`zmq_server.py:2904`) returns a mono
  frame-window from `self.audio_player` — i.e. **project audio only**, one global source.
- `modulation/engine.py:562`: *"v1 keys off PROJECT audio only (source_track_id reserved)."*
  `modulation/sidechain.py:56-71` accepts `source_track_id` and **ignores it** by design.
- Audio tracks exist but sit behind env flag `_experimental_audio_tracks_enabled()`
  (`zmq_server.py:51-54`), **default OFF**.

**This PRD finishes that reserved sentence.** Requirement: every cymatics driver param binds
to a **chosen audio source**, resolved in this precedence:

1. **A specific audio track** (`source_track_id` — the reserved field, now honored)
2. **Project audio** (today's behavior — the default, so nothing regresses)
3. **None** (params run from automation/fields only; sim still works, fully deterministic)

**Binding shape (proposed):** a reusable `AudioSourceRef { source: 'project' | 'track',
track_id?: string, band: 'sub'|'bass'|'low_mid'|'mid'|'high_mid'|'presence'|'brilliance'|'full',
method: 'rms'|'frequency_band'|'onset', gain, smoothing }`. This is deliberately **generic**,
not cymatics-specific: sidechain, the granulator's onset path, and future audio-reactive
effects all want the same object. Shipping it here retires the reserved-field debt once.

**Backend work:** per-track PCM windowing — generalize `_get_audio_pcm_for_frame` to take an
optional track id and pull from that track's decoded audio (`audio/decoder.py`,
`streaming_decoder.py` exist) instead of the single global player. Must remain a pure
frame-indexed read (cycles-per-frame law: drive from `frame_index`/fps, **never wall-clock
Hz** — see `docs/solutions/2026-05-14-cpf-not-hz-for-oscillating-params.md`), so a project
renders identically at 24fps and 60fps and export matches preview.

**Dependency flagged:** option 1 (per-track) intersects the default-OFF audio-tracks flag.
If that flag stays off, ship options 2+3 first and land per-track binding when the flag
flips — the `AudioSourceRef` schema is forward-compatible either way (unknown/missing track
degrades to project audio, never errors — mirrors the existing sidechain no-raise contract).

**Default audio→cymatics mapping** (all overridable; derived from the user's own
chaos-visualizer band map):

| Band | Drives |
|---|---|
| Sub/Bass 20–250 Hz | Excitation amplitude (how hard the plate/liquid is driven) |
| Low-mid 250–500 Hz | Wave speed / ripple tension |
| Mid 500–2k | Pattern complexity (Chladni mode pair; liquid driver node count) |
| Presence 4–6k | Caustic sharpness / specular tightness |
| Brilliance 6–20k | Surface micro-detail, sparkle |
| Onset | Impulse — drops a new driver ring / retriggers a mode transition |

## 4. Use cases

| # | Use case | Flow | Ships in |
|---|---|---|---|
| 1 | Standalone cymatics visual reacting to a track | Add `gen.liquid_cymatics` on a video track → bind audio source to the music track → automate depth/vessel | P3 |
| 2 | Footage seen through vibrating water | Put `fx.liquid_refract` on a clip → its own audio (or another track) drives the surface | P4 |
| 3 | Dry-plate cymatics look | `gen.chladni` + palette/tint | P1 |
| 4 | Cymatics as a matte/modulation source | Generator output on a matte track → existing LayerTap/mask consumers read it | free once P3 + layertap land |
| 5 | Live sculptural performance | Params MIDI-mapped; performer window shows program-out | rides `multiwindow-stage-a` |

## 5. Components / packet sketch

- **P1 `gen.chladni`** — port user's `chladni.py` math to the effect contract. Params: mode
  pair or complexity scalar, contrast, line sharpness, plate shake, tint, rotation.
  Field-capable: complexity, contrast, shake. *Do NOT port chaos-visualizer's
  `core/param_descriptor.py` abstraction — Creatrix has no generic param registry (verified);
  map to the plain `PARAMS` dict.* Oracle: golden-frame equality at fixed params +
  determinism test (same seed/frame ⇒ identical bytes).
- **P2 `_liquid.py` (shared kernel, no registry entry)** — damped 2D wave propagation on a
  height field; fixed timestep from `frame_index`; boundary = vessel mask; drivers = N ring
  sources. Simulate at reduced resolution, upsample the field. Perf-budgeted against the
  existing meter vocabulary (YELLOW >10ms / RED >20ms).
- **P3 `gen.liquid_cymatics`** — render the field: normal-based shading + caustic
  approximation from surface curvature (∇²h) + procedural ring-light term. Vessel mask
  boundary. Palette via existing tint path. **Procedural rings only — no imported ring assets.**
- **P4 `fx.liquid_refract`** — same kernel, but ∇h becomes a displacement map applied to the
  input frame, reusing the `wave_distort`/`flow_distort` sampling pattern. Params: refraction
  strength, chromatic split, surface scale, edge policy (reuse the established
  constant/extend/tile/mirror set).
- **P0 `AudioSourceRef`** — the binding schema + per-track PCM read (§3). **Sequenced FIRST
  per OD-1.**

**Locked build order (OD-1 + OD-2):** P0 `AudioSourceRef` → P2 `_liquid.py` kernel →
P3 `gen.liquid_cymatics` → P4 `fx.liquid_refract` → P1 `gen.chladni` (follower, not leader).

## 6. Non-goals (v1)

Projector output (belongs to `multiwindow-stage-a`) · morph-sequence system (automation lanes
already do it) · PNG/imported light-ring assets · 3D · live microphone input (explicitly
rejected by user) · a bespoke audio analyzer (reuse `audio_follower`).

## 7. Open decisions (need user verdicts)

- **OD-1 Audio source scope — LOCKED (user, 2026-09-07): YES, audio source binding is in
  scope.** `AudioSourceRef` ships with the feature, resolving project-audio today and
  per-track (`source_track_id`) as the audio-tracks flag allows. Not mic-driven, ever.
- **OD-2 Ship order — LOCKED (user, 2026-09-07): LIQUID FIRST.** The sim kernel +
  `gen.liquid_cymatics` + `fx.liquid_refract` lead; the `gen.chladni` port follows as a
  sibling leaf rather than the pattern-setter.
- **OD-3 Sim resolution policy** — *now measured, see §9. The sim is not the cost;
  recommend a 128² default with a quality param up to 384² (still GREEN).*
- **OD-4 Caustics fidelity** — *curvature approximation validated visually and at
  6.8ms/1080p (§9). Recommend it for v1; photon gather stays out of scope.*
- **OD-5 Vessel source:** procedural shapes only (circle/square/polygon/N-gon) v1, or custom
  mask/image loading immediately? *Recommend: procedural + the existing matte path, no new
  loader.*
- **OD-6 Reference purchase:** is the $10 14-day BioTemple pass worth buying as behavioral
  reference? (Legitimate research; observation only, no decompiling.) User's call.

## 9. Prototype evidence (measured 2026-09-07, `~/Development/liquid-cymatics-proto/`)

A standalone numpy kernel (`liquid.py`, 16 passing tests) was built to de-risk the sim
before any repo code. Measured on the dev machine, budget vocabulary YELLOW>10ms / RED>20ms:

**Sim step cost (the wave field itself) — all GREEN, the sim is NOT the bottleneck:**

| grid | ms/frame | verdict |
|---|---|---|
| 64² | 0.11 | GREEN |
| **128² (proposed default)** | **0.33** | **GREEN** |
| 256² | 0.99 | GREEN |
| 384² | 2.12 | GREEN |

**Render / refract at output resolution (sim grid 128²):**

| op | 640×360 | 960×540 | 1280×720 | 1920×1080 |
|---|---|---|---|---|
| `render_surface` (generator) | — | — | — | **6.8 ms GREEN** |
| `refract` (effect) | 4.3 GREEN | 9.4 GREEN | 16.2 YELLOW | 38.9 RED |

Refract at 1080p is RED but **in line with shipped `fx.wave_distort` (~40ms at 1080p)** —
same offset-map gather cost. Preview resolutions are GREEN; full-res is an export/YELLOW-
meter concern, not a blocker.

**Optimizations already found (apply them in the port — they were worth 3.4×):** shade at
sim resolution and upsample ONCE at the end (was 22.9ms → 6.8ms); compute displacement
offsets at sim resolution then upsample the small integer maps (never build 1080p index
grids per frame); cache nearest-neighbour index maps by size pair; avoid `np.gradient`
(promotes to float64 and doubles 1080p byte traffic) — use float32 central differences.
These are the same mandates PR #416 derived for routing (hoist conversions, keep buffers
contiguous).

**Determinism — VALIDATED.** Cold re-simulation to frame N reproduces playback
**bit-for-bit** (max abs diff 0.000e+00), and the kernel is frame-indexed with no RNG and
no wall-clock read, so scrub == playback == export. Field stays finite and bounded over
3000 frames; zero drive decays to silence.

**⚠ NEW FINDING — scrub cost grows linearly and needs checkpointing.** Cold re-sim to
frame 1800 (60s @30fps) costs ~597ms — too slow for deep scrubbing:

| scrub target | cold re-sim |
|---|---|
| frame 30 (1s) | 11 ms |
| frame 300 (10s) | 103 ms |
| frame 900 (30s) | 304 ms |
| frame 1800 (60s) | 597 ms |

**Mitigation (must be in the port):** checkpoint the field every N frames (e.g. 120) and
re-sim from the nearest checkpoint — bounds worst-case scrub to ~40ms regardless of
timeline position. A 128² float32 field is 64KB, so 30 checkpoints ≈ 2MB per generator
instance; this belongs in the ONE global temporal-buffer budget the routing PRD defines
(alongside afterimage/feedback buffers), not a private cache.

**⚠ REVIEW FINDING (2026-09-07) — per-frame normalization causes brightness pumping.**
The field's peak amplitude swings ~2.6× under normal drive. Renderers that normalize by
the *current frame's* max therefore auto-gain, which reads as flicker on video (fine for
stills, wrong for a video app). Fixed in the prototype by carrying a smoothed peak
reference (EMA) **in sim state** — so it re-simulates deterministically — and normalizing
against that: brightness swing 19.7 → 3.4, stddev 5.37 → 0.64 (measured). **The port must
do the same; any renderer normalizing per frame is a defect.** Regression tests:
`TestTemporalStability` (2 cases, incl. the reference surviving re-sim identically).

Visual evidence: `out/grid.png` (vessel shapes × complexity), `out/refract.png`
(split-screen through the surface), `out/liquid.mp4`, `out/refract.mp4`.

**Prototype status:** 18 tests green (vessel containment, determinism incl. no-wall-clock,
long-run stability, decay-to-silence, render/refract contracts, temporal stability,
out-of-bounds clamping).

## 8. Traceability

UI entry point on ship: browser → **GENERATORS** folder → `Chladni` / `Liquid Cymatics`
leaves (drag to track), and browser → **EFFECTS** → `Liquid Refract`. Per FRONTEND-SDLC,
the implementing PR names the mounting file:line.
