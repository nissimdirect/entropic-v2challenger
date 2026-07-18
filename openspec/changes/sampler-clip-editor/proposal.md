# Proposal — sampler-clip-editor (FrameStrip region/loop editing in the Sampler)

> **Status:** PLANNING (docs-only). Source PRD: `~/.claude/plans/creatrix-clip-editor-device-monitors-prd.md`
> (user dictation 2026-07-18 + code audit vs main `760783d`; re-checked vs `2369858`).
> Sibling changes: `device-monitors-v1`, `chain-tap-preview` (build AFTER this; see
> PLANNING-QUEUE Lane 4). Build slot: **first feature build after ui-foundation** (user-locked).

## Why

The B3.1 loop engine (`computeSamplerVoice.ts:180-305`: startFrame/endFrame/
`SamplerLoopConfig{in,out,dir,crossfade}`) is fully shipped and tested — and **invisible**.
`SamplerDevice.tsx` exposes only Source/Start/Speed/Opacity/Blend numeric fields; the B3.1
packet's own checklist item ("SamplerDevice.tsx — loop on/off, in/out number inputs, dir
select, crossfade frames input", `docs/roadmap/packets/phase-5a.md:417`) was never built on
any ref (`git log -S "loop" --all -- SamplerDevice.tsx` = empty). There is also no way to
load a clip by dragging (`SamplerDevice.tsx:9-12` documents the gap; timeline clips are
`draggable={false}`). This change ships the missing editing surface: a visual **FrameStrip**
(thumbnail filmstrip + region select + loop controls + grid snap) and the drag-from-timeline
gesture.

## Locked verdicts (user, 2026-07-18 — do NOT re-open)

1. Region select is **non-destructive** (writes startFrame/endFrame/loop on the same asset);
   explicit right-click **Crop** on the region bakes a new trimmed clip asset.
2. Grid anchor = **region start** (fallback: clip frame 0). ⚠ interpretation — see OD-1.
3. BPM division **follows global `quantizeDivision`** + local override chip.
4. Drag payload: clip's **current trim arrives pre-selected** (full source loaded).
5. No second free-running playhead, no audio waveform lane, no slicing UI (schema-compatible
   only), no beat-warp (INSTRUMENTS.md §3.15 stands).
6. Hover-scrub display follows the NFR-01 pattern (`docs/DIMENSIONAL-TRANSLATION-PRD.md:507`):
   cached thumbnails/proxy frames during movement, real render at rest — never per-mousemove IPC.

## Open Decisions (recommended defaults below — surface at T1, don't silently resolve)

### OD-1 · Grid anchor micro-semantics ("region start clip 0")
User verdict was terse. Recommended reading: grid divisions count from the region's IN point;
when no region exists the anchor is frame 0. Alternative reading: anchor at region start AND
show a secondary tick row from frame 0. **Resolve at mock review**
(`docs/mockups/clip-editor-frame-strip.html` renders the recommended reading).

### OD-2 · Crop bake mechanism
Crop must produce a real trimmed asset registered in the project.
- **(a) New backend `crop_clip` command (RECOMMENDED):** decode source, write frames
  [in,out] to a new file via the existing export encode path, `_handle_ingest` the result.
  Deterministic, parity-safe, no engine change.
- **(b) Reuse freeze/bake infrastructure** (`_handle_bake_performance_track` /
  `_handle_freeze_prefix`): tempting but those bake RENDERED output (chain applied); Crop
  must bake the RAW source region — different contract. Rejected as primary; cite only for
  the encode-path reuse.
- Trust boundary per the standing rule: validate at the zmq handler (`_parse_*` layer) and
  the frontend store — NOT `schema.py deserialize` (dead in production).

### OD-3 · Thumbnail API extension for zoomed strips
`generate_thumbnails(path, count)` (`backend/src/video/ingest.py:117`) returns COUNT
evenly-spaced thumbs. Default strip reuses it verbatim (+ `thumbnail-density.ts` math, 1
thumb/~100px, clamp 1-12). Zoomed/pop-out strips need arbitrary ranges.
- **(a) Additive `range` params (RECOMMENDED):** `{path, count, start_frame?, end_frame?}` —
  evenly spaced WITHIN the range; old callers byte-identical.
- **(b) Frame-index list param** `{frames:[...]}` — maximum flexibility, bigger surface, cache
  keying harder. Defer unless (a) proves insufficient.

### OD-4 · Where the editor renders large
Default: inline strip in the device chain (row 3 is capped+scrolls, `global.css:212-216` —
safe). Large view: the strip re-renders bigger inside the device-monitors floating panel
(sibling change) — **if device-monitors-v1 hasn't shipped when this lands, the large tier is
simply absent (strip + existing OS pop-out only), NOT a bespoke one-off panel.** Recommended:
accept the staging gap.

## Non-Goals

Slicing UI (design leaves marker affordance space; engine hooks are B3-era) ·
consolidate-on-drag (drag never bakes; only explicit Crop does) · monitors/taps (sibling
changes) · melodic piano-roll · any backend playback-engine change (the loop engine is done).

## Code-grounding facts (verified this audit — re-verify only if main moved past `2369858`)

- Loop/trim schema: `frontend/src/renderer/components/instruments/types.ts:11-56`.
- Playback math + parity gates: `computeSamplerVoice.ts` (regression + preview/export parity
  tables are the standing oracle — B3.1's parity guard caught a real divergence; keep both).
- Persistence: full sampler state restore FIXED in #322 (whitelist hole closed) — new fields
  ride the same exhaustiveness guard.
- Quantize math: `frontend/src/renderer/utils/launch-quantize.ts` `quantizeFrame(frame,
  division, bpm, fps)` — pure, NaN-guarded, mirrors `Timeline.tsx:249`. BPM source =
  `effectiveBpm` (P2.1). Divisions `[1,2,4,8,16,32]` (`stores/layout.ts`).
- Thumbnails: `_handle_thumbnails` (`zmq_server.py:627-639`) → `generate_thumbnails`;
  consumer density math `thumbnail-density.ts`; filmstrip CSS precedent `.clip__thumb`.
- Drag collision site: `.app` root global drag handlers (App.tsx:3636 area,
  `handleGlobalDragEnter/Over/Drop`) — payload discriminator REQUIRED; existing typed-drag
  precedent: `InstrumentsBrowser.tsx:171-181` (instrument-type onto track header).
- FrameStrip second consumer: fx-backspin `stop_mode=frame` selector
  (`docs/mockups/INDEX.md` fx-backspin open question 2) — component must be effect-param
  addressable, not sampler-only.
- Drag/draw canvas rows CANNOT be verified by synthetic computer-use — Playwright
  `_electron` OS-pointer e2e is the proven method (confirmed 4×; templates: #439 mask-draw,
  `gh393-aa4-breakpoint-marquee.spec.ts`).
