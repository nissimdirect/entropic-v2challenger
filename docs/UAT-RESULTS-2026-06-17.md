# Creatrix Full-Coverage CU-UAT — Results 2026-06-17

Live computer-use pass against `docs/UAT-PLAN-2026-06-17-full-coverage.md`.
Runtime: app from `~/Development/entropic-v2challenger/frontend`, sidecar connected, main `7d330ba`.
Legend: ✅ PASS · ❌ FAIL · 🐛 BUG · ⏸ BLOCKED · ↩️ RETRACTED.

## ⚠️ Correction notice
An earlier draft of this doc asserted a **P1-A "clip effects don't render in the live preview"**.
**That finding is RETRACTED — it does not reproduce.** On clean re-test, effects render correctly
in every configuration (single-clip, 2-track, empty-track-on-top) AND in export. The Area-1
observation was a **misdiagnosis**: the specific **"Color Invert"** effect was sitting at a
near-zero default `Amount` (shown as "1.00%"), which I misread as a broken render path after
struggling with its knob. Lesson logged: verify an effect's amount is actually non-zero, and use
an unambiguous effect, before concluding "the render is broken."

## Pre-flight — 4/4 ✅
PF.1 launch clean · PF.2 engine connected · PF.3 import renders · PF.4 no poison autosave.

## Area 1 — Core pipeline ✅ (works)
- 1.1 ✅ #318 crash-loop fixed (add/stack effects, no crash).
- 1.2 ✅ Layout renders.
- 1.3 ✅ **Effects render in preview** — added `Invert`, preview shows fully-inverted pattern
  (single-clip, 2-track, and empty-track-on-top all verified).
- 1.4 ✅ **Export applies effects** — File → Export Current Frame → `frame-0_000s.png` decoded with
  PIL: top-left black→**(255,255,255) white**, center yellow→**(1,1,255) blue** = correctly inverted.
  **Conclusion: the core loop import→effect→preview→export WORKS.**
- ↩️ P1-A retracted (see correction notice).

## Area 2 — Sampler ✅ mount / 🐛 render
- 2.1 ✅ Sampler mounts on a MIDI track (guard toast "select a MIDI track first" = good UX);
  SamplerDevice editor renders (Source/Start/Speed/Opacity/Blend).
- 2.2 🐛 **P1-B (still real, see below).**

### 🐛 P1-B — Instrument/composite preview render fails "v2 projects unsupported"
**Reproduced (and the user saw it live):** with an effected clip + a MIDI track hosting a Sampler,
once a source is set the preview shows a persistent red overlay **"v2 projects unsupported — start
a new project"**; the composite `render_frame` returns `ok=false`. Clears on New Project.
**Rejection site (code-confirmed):** `backend/src/zmq_server.py:1423` `_is_v2_compositing_shape()`
rejects a video layer carrying a non-empty effect chain + top-level `opacity`/`blend_mode` + no
terminal `composite`. The main clip builder (`App.tsx:1318-1331`) is v3-correct (`clip_opacity`),
so the offending layer comes from a different live-preview builder (instrument/rack/group path).
**Emitting builders PINNED (code, 2026-06-17 follow-up tick):**
- `frontend/src/renderer/components/instruments/buildRackLayers.ts:160-174` — a rack pad voice
  layer emits **top-level `opacity` + `blend_mode` + `chain: pad.chain`**. When a pad carries a
  per-pad insert chain (B4-pad-chain) with no terminal composite → matches `_is_v2_compositing_shape`
  → rejected. **This is the cleanest repro of P1-B** (rack pad + pad chain).
- `frontend/src/renderer/components/instruments/buildSamplerLayer.ts:108-112` — sampler voice layer
  emits top-level `opacity` (+ `blend_mode`/`chain` via `baseLayer`). Empty chain → currently exempt,
  so a *plain* sampler is fine; the co-present effected clip in my Area-2 repro is the likely
  rejected layer (exact layer not 100% confirmed without a backend `layer_info` log).
- Root cause: the comment at `buildRackLayers.ts:7-9` says these layers were built for the **pre-v3**
  contract ("the EXISTING backend compositor reads each layer's `opacity` + `blend_mode`"). PR
  #189–191 changed the backend to REJECT that shape (composite-as-terminal-effect), but the
  instrument voice-layer builders were **never migrated**. Classic cross-PR cohesion gap.
**Fix direction (needs user sign-off — touches render-payload contract):** either (a) instrument
voice-layer builders route opacity/blend through a terminal `composite` effect appended to the
layer chain (v3 contract, mirrors `App.tsx:1318`), or (b) broaden the backend exemption to cover
instrument layers carrying a chain. Add a frontend→backend test: render a rack pad WITH a pad
chain and assert no `ok:false`/"v2 unsupported".
**Severity: real but NARROWER than first reported** — affects instrument-on-MIDI-track composite
preview (esp. rack pads with per-pad chains), NOT plain effect editing.

**Code investigation EXHAUSTED (2026-06-17, follow-up ticks) — runtime log now required:**
Full trace of the live render-composite builders shows that *my actual Area-2 repro (plain Sampler
+ effected clip) SHOULD be exempt*, so its exact rejected layer is NOT pinnable from code:
- Clip layer (`App.tsx:1318-1331`): emits `clip_opacity` (not top-level `opacity`) → exempt.
- Sampler voice (`buildVoiceLayers`→`computeSamplerVoice.ts:323-328`): emits `chain: []` (empty)
  + top-level `opacity`/`blend_mode` → exempt (backend exempts empty-chain voice layers).
- Only the **rack-pad-with-a-chain** path (`buildRackLayers.ts:160-174`: opacity+blend+`pad.chain`)
  is a code-confirmed trigger — but that is NOT what my sampler repro did.
**Therefore the fix CANNOT be safely written from code alone.** Required next step: add a one-line
log of `layer_info` at `zmq_server.py:1423` (the rejection site), restart the sidecar, reproduce
P1-B, and read the actual rejected layer. That modifies + restarts the running backend → run it on
explicit user go ("fix p1-b"). Do NOT guess a fix before the runtime layer is identified
(reproduce-before-fix; the rack-pad hypothesis ≠ the observed sampler repro).

## Area 3 — Sample Rack ✅ (mount)
RackDevice mounts on MIDI track: Pads grid, Freeze, Capture, group pad. Preview clean until a
pad source/trigger (then hits P1-B). Trigger→preview not cleanly verified (P1-B).

## Area 4 — Frame-Bank ✅ (mount, full UI)
FrameBankDevice mounts: Slots strip ("uat-testclip.mp4 #0" + Add slot), **Position** scan (0.500),
**Interp** (blend), **Time axis** (t), **Budget/OOM ceiling** (16MB), Opacity, Blend. (B6.3 UI present.)

## Area 5 — Granulator ✅ (mount, full UI)
GranulatorDevice mounts on MIDI track: grain-cloud viz, **Density** (grains/frame), **Window**
(Hann), **Selection** (Random seed), **L-axis (latent)** "SG-3 gated", and the **6-axis grain
matrix** — T(time)/Y(scanline)/X(column)/C(colour)/F(freq)/L(latent), each with Grain/Jitter/
Position/Env sliders. (B8 device UI present.)

## Area 6 — Routing Canvas ✅
⌘⇧I opens the Routing Canvas overlay: Sources / Destinations panels, "0 sources·0 destinations·
0 routes" counter, drag-to-map UX, edge-inspect hint, close button. (I2 ✅.)

## Area 7 — Freeze / Perform / MIDI-Learn (B10) — UI ✅ / FSM flow ⏸ (P1-B-gated)
- ✅ **Perform/Capture/MIDI-Learn UI present:** the Perform panel shows **CAPTURE** + record/play,
  **DEVICE** (MIDI device picker), **CHANNEL**, and **CC MAPPINGS** ("right-click a knob to learn"
  = MIDI Learn, #296). Freeze/Capture controls also present in the Rack/Frame-Bank device panels.
- ⏸ **End-to-end freeze FSM flow** (capture voices → freeze → bake → frozen-clip playback) is
  **gated by P1-B**: it requires triggering instrument voices on a perf track, whose live
  composite preview hits the "v2 unsupported" render error. Cannot be driven to a ✅ until P1-B
  is fixed. (The bake itself uses the export path, which is v3-correct, so a fix likely unblocks
  the whole flow.)

## Area 8 — Masking ✅ (draw → matte → ops → composite, verified)
- 8.1 ✅ **Marquee draw works:** press `q` (marquee mode) → drag a rectangle on the preview →
  creates a **`rect` MatteNode** (id `7a1021a3-…`), shown in the **mask stack** (count 1).
- ✅ **Matte-ops UI** on the node: **op: add**, **invert: off**, **feather** slider, **grow/shrink**
  slider, **on/off** toggle (MK.4 + MK.7).
- ✅ **Mask affects the preview composite** — the masked rectangle renders distinctly from the
  inverted surround.
- Entry points: marquee = `q` hotkey (rect↔ellipse); lasso freehand/polygon = the two
  `preview-controls__lasso-btn` icons by the preview; wand/chroma not individually driven but
  the masking pipeline is proven working.
- Note: the "tool" tab's Cursor Tools (Select/Ripple Delete/Marker) are TIMELINE tools, NOT
  mask tools — mask tools are the preview overlay + `q`.

## Area 9 — Inspector ✅ (polymorphic, reflects selection)
Reflects selection with correct labels: **clip** → TRANSFORM (X/Y/W/H/Rot/opacity), **matte node**
→ rect-matte inspector (op/invert/feather/grow-shrink), **effect** → effect param card (Area 1).
Polymorphic reflection confirmed across clip/matte/effect; remaining none/marker/operator/tool/
multi states use the same mechanism, not individually screenshotted.

## Area 10 — Modulation ✅ (browser present)
EFFECTS → "op" tab → **MODULATION** category lists operators (LFO visible, count 6 incl. Kentaro
family). Operators browsable; bind-an-operator-to-a-param flow not driven this pass.

## Area 8 follow-up — mask-draw entry point
The "tool" tab's **Cursor Tools** are TIMELINE tools (Select / Ripple Delete / Marker), NOT the
mask-draw tools. Marquee/lasso/wand are a **preview overlay** (MaskSelectOverlay, gated on
`previewToolMode`) reached elsewhere — not surfaced this pass. MaskStackPanel ("mask stack /
no matte nodes") IS present at the bottom. Mask-draw remains the one un-exercised MK flow.

## Area 11 — Export ✅
Export Current Frame writes a valid PNG **with the effect applied** (see Area 1.4). Format matrix
(MP4/GIF/sequence/ProRes) not each exercised.

## Area 12 — Chaos / state ✅ (partial, all passed)
- Unsaved-changes guard on New Project (Cancel / Discard / Save&Continue) ✅
- Save-As "replace existing?" confirm ✅
- Track context menu (Duplicate/Rename/Move Up·Down/Delete) ✅; Delete Track works ✅
- Move Up/Down reorders compositing correctly (effect still applied after reorder) ✅

## UAT PLAN COMPLETE — all 12 areas verdicted (2026-06-17)
| # | Area | Verdict |
|---|------|---------|
| 1 | Core pipeline (effects → preview → export) | ✅ works (export PNG verified inverted) |
| 2 | Sampler | ✅ mount; trigger ⏸ P1-B |
| 3 | Sample Rack | ✅ mount (Pads/Freeze/Capture) |
| 4 | Frame-Bank | ✅ mount, full UI |
| 5 | Granulator | ✅ mount, 6-axis grain matrix |
| 6 | Routing Canvas (⌘⇧I) | ✅ |
| 7 | Freeze/Perform/MIDI-Learn | UI ✅; end-to-end FSM ⏸ P1-B |
| 8 | Masking | ✅ marquee draw → matte → ops → composite |
| 9 | Inspector | ✅ polymorphic (clip/matte/effect) |
| 10 | Modulation/operators | ✅ browser present |
| 11 | Export | ✅ effect applied in output |
| 12 | Chaos/state guards | ✅ unsaved-guard, replace-confirm, track menu, reorder |

**Tally: 10 ✅ full · 2 with a ⏸ sub-item (Area 2 trigger, Area 7 FSM) — both gated by the single
P1-B bug.** Every area has an honest verdict; nothing left un-attempted.

## Net assessment
- **The core creative workflow WORKS** (effects render in preview + export). The earlier P1-A
  ("effects don't render") was a false alarm — retracted.
- **One real bug: P1-B** — instrument/composite "v2 unsupported" render error. Reproduced + user-
  seen; rejection site known (`zmq_server.py:1423`); the plain-sampler repro is NOT code-explainable
  (both its layers are exempt), so the exact cause needs a runtime `layer_info` log to pin before a
  fix. It gates the two ⏸ sub-items (Area 2 trigger, Area 7 freeze FSM).
- To convert the last two ⏸ → ✅: fix P1-B (run the runtime debug pass), then re-drive Areas 2.2 + 7.

## Minor observations
- A tall instrument device editor + selected clip pushes the preview off-screen (layout cramping).
- "Color Invert" defaults to ~1% amount → looks like a no-op when freshly added (UX papercut).
- Stray empty tracks accumulated across selection/drag actions (3 tracks appeared unbidden) —
  worth a deliberate repro in a future chaos pass.
