---
title: Creatrix Master Tune-Up & Build Plan — Stability, Instruments, Photoshop Tools, Timeline Meta, Transform Automation, Hardware Banks
status: draft (pending user decisions D1–D5)
created: 2026-07-02
source: user directive 2026-07-02 + 4 code sweeps (instruments, masking/tools, automation, MIDI, timeline-meta) + docs/UAT-RESULTS-2026-06-17.md + month-audit ground truth
---

# Creatrix Master Tune-Up & Build Plan (2026-07-02)

**User's ask (verbatim intent):** (1) itemize every instrument/plugin and verify + tune each; (2) tune the
photoshop-like tools (alpha layers, cutting/pasting, translating, warping); (3) record/overdub automation on
asset transforms; (4) hardware mapping — map a controller once, record or draw automation, switch to a
different component and have everything mapped already; (5) audit the slicing meta — lock/unlock, magnetize,
snap, quantize grid, changing quantization.

**Ground truth basis (all code-verified on main `03b289f`, 2026-07-02):**
- June-17 full CU-UAT: 12/12 areas verdicted; core pipeline works; ONE open bug (P1-B) gates all instrument
  triggering in preview. Fix plan committed (`docs/plans/2026-06-17-p1b-uat-fix-plan.md`) but never executed.
- Month-audit (2026-07-02): NEW P1-class sampler persistence hole; main CI red (1 flaky sidecar timing test +
  real e2e failure cluster post-#317–#319); IPC allowlist asymmetry (3 orphaned handlers).
- Automation sweep: transform automation does not exist (lanes address only `effectId.paramKey` + BPM; recorder
  wired only to effect-param Knob; transform sent as static per-request snapshot; overdub exists only for
  trigger lanes — continuous lanes are punch-in overwrite).
- MIDI sweep: Web MIDI in renderer (`useMIDI.ts`); flat absolute CCMapping `{cc, effectId, paramKey}`, one
  CC → one target, no banks; CC values are a render-time overlay (`applyCCModulations` on a cloned chain) that
  bypasses store writes, undo, and the automation recorder; learn surface = effect knobs only (right-click);
  rack macros NOT mappable; velocity captured but discarded; no aftertouch; no stable controller identity in
  persistence; no atomic focused-device selector (focus = `selectedTrackId` × `selectedRackPad` × `rackEditPath`).
- Timeline-meta sweep: split/snap/quantize/launch-quantize/ripple-delete/markers all WORKING; **7 of 9 cursor
  tools are stubs** (razor `b`, slip `s`, slide `d`, ripple-delete-tool `x`, marker-tool `shift+m`, loop-in/out,
  range-select `r` — buttons + registered shortcuts, zero handlers); slip/slide edits don't exist anywhere;
  clip/track LOCK is fully absent (no data model field); markers can't be renamed.

---

## WS0 — Stability & correctness fixes (FIRST — everything else stands on these)

| ID | Packet | Priority | Effort | Depends |
|----|--------|----------|--------|---------|
| F1 | **Execute the P1-B fix plan P1+P2+P3** (backend voice-marker exemption in `_is_v2_compositing_shape`, sibling hardening, regression suite). STEP 0 reproduce-before-fix gate per the committed plan — needs sidecar restart, run on user go. | P0 | S–M | none |
| F2 | **Persistence-fidelity sweep (sampler hole + siblings)**: project-load whitelist (`project-persistence.ts:958-963`) restores only `{clipId,startFrame,speed,opacity,blendMode}` — silently DROPS `endFrame`, `loop` (B3.1), `rgbOffset`+`glide` (B3.3), `melodic` (B3.4). Save/reopen loses every B3 feature. Fix the whitelist + round-trip test asserting full-fidelity reload of each B3 field. **Then sweep the same whitelist-drops-fields pattern across ALL persisted instrument state** (rack pads/macros, granulator, frame-bank, operators — #315 added their persistence but field-completeness was never audited): diff each store's persist-shape against its load-whitelist, one round-trip test per instrument type. | P1 | S–M | none |
| F3 | **Red CI on main**: (a) flaky `test_render_budget_guard_warns_when_eval_exceeds_16ms` → CI-tolerant bound (precedent: #228); (b) bisect + fix the real e2e failure cluster (watchdog, effect-chain move-down, full-journey, import-video) that appeared right after #317–#319. | P1 | M | none |
| F4 | **IPC allowlist asymmetry**: allowlist or delete 3 orphaned backend handlers (`audio_tracks_clear`, `mask_gc_sidecars`, `render_text_frame`); make the contract test bidirectional. | P2 | S | none |
| F5 | **Layout cramping** (UAT P4): bound `.app__device-chain` height + internal scroll, both flag states. | P2 | S | none |
| F6 | **Color Invert "1.00%" label** (UAT P5): shared formatter renders `unit==='%' && max<=1` as ×100; mandatory registry sweep precondition. | P2 | S | none |
| F7 | **Stray empty tracks on clip select** (UAT P6): >4px drag threshold in `Clip.tsx` before below-lane new-track logic. | P3 | S | none |
| F8 | **Non-rack sampler export chain audit** (fix-plan open Q4): per-instrument export hardcodes `chain:[]` (`App.tsx:2729,2763`) while per-pad export serializes `pad.chain` — confirm whether non-rack sampler insert chains exist, and if so stop dropping them on export. | P2 | S | F1 |

F1–F4 have zero file overlap → parallelizable. F1 unblocks the entire WS2 live pass.

## WS1 — Timeline editing meta (the "slicing meta" audit → fixes/builds)

Already WORKING (verify in live pass, no build): split at playhead (⌘K / ⌘⇧K / `e` / context menu, undo-safe),
timeline snap to grid+edges+playhead+markers (toggleable, ⌘-bypass), BPM-linked quantize grid (⌘U, division
user-changeable 1–32 via dropdown), launch quantization for pads (separate toggle, next-boundary snap),
ripple delete (⇧⌫, 7 tests) + ripple trim, markers (place `m`/seek/delete/snap-target).

| ID | Packet | Priority | Effort | Depends |
|----|--------|----------|--------|---------|
| T1 | **Wire the cheap stub tools to their existing features**: razor (`b` + click-clip → `splitClip` at click time), marker tool (click-to-place on ruler), loop-in/out tools (→ existing I/O actions), ripple-delete tool (click-clip → `rippleRemoveClip`), range-select (gate `MarqueeOverlay` on the tool). Each is UI wiring over an already-tested store action. | P1 | M (5 small wires) | none |
| T2 | **Slip + slide edits** — genuinely new edit types (shift in/out without moving clip; move clip while neighbors adjust). Build the store actions + tests first, then wire tools `s`/`d`. | P2 | M–L | T1 |
| T3 | **Clip + track lock** — new: `locked` field on Clip and Track, guards in move/trim/split/delete/ripple paths, lock toggle in context menus + track header, visual affordance, undo-safe. | P2 | M | none |
| T4 | **Marker rename** — `renameMarker` action + double-click inline edit on `MarkerFlag`. | P3 | S | none |
| T5 | **Decision D1 fallout**: cull-or-keep any tools the user doesn't want; consolidate redundant split shortcuts (⌘⇧K vs ⌘K/`e`). | P3 | S | D1 |

## WS2 — Instruments live tune-up pass (gated on F1)

Drive `docs/UAT-PLAN-2026-06-17-full-coverage.md` deep items live (computer use), tune as we go:
- **Sampler**: trigger→preview (2.2), mod knobs (2.3), persistence (2.4 — verifies F2), loop/scrub/speed/
  melodic/RGB-glide feel. Known deferred: `flow` interp (needs B7 wiring), per-pad sends TODO(B4.3+).
- **Sample Rack**: pad trigger (3.1), macros (3.2), pad chains (3.3 — the P1-B repro), choke (3.4), pad-delete
  cleanup (3.5), B5 nesting (3.6–3.7).
- **Frame Bank**: slots, position scan, interp modes, budget/OOM ceiling behavior (4.x).
- **Granulator**: 6-axis matrix feel/ranges, density limits, GPU-vs-CPU preview parity (5.x).
- **Operators**: bind-operator-to-param flow live (never driven); Kentaro cluster; note the card-only editors
  (Sidechain/Gate/MIDIEnvStutter) and the sidechain per-track PCM TODO — file as tune items with user verdicts.
- **B10 Perform/Freeze/MIDI Learn**: full FSM capture→freeze→bake→playback (7.x, unblocked by F1); MIDI Learn
  round-trip on real hardware; retro-capture dump.
Output: per-item ✅/🐛 verdicts appended to a new UAT results doc; bugs filed as F-packets.

## WS3 — Photoshop-tools tune-up + builds

Live-verify the working set (marquee `q`, lasso `l`, wand+tolerance, color-range eyedropper, matte ops panel,
chroma/luma keys + spill, mask routing per-device/per-chain, cut/copy-to-track ⌘J/⌘⇧J, ProRes 4444 alpha
export, clip transform bbox+snap+numeric panel) — and build what's missing:

| ID | Packet | Priority | Effort | Depends |
|----|--------|----------|--------|---------|
| PS1 | **Build MK.CU journeys (J1–J5) as we drive the live pass** — the specced-but-never-built visual regression suite; leaves a repeatable gate behind. | P1 | M | none |
| PS2 | **Task #44 masking blend perf**: ~6.2ms/device vs 1.0ms budget (10-device masked chain ≈16fps). Fuse the 3-pass lerp (numexpr / in-place `out=`) or half-res preview blend + upscale; byte-identity guard on the no-mask path; restore an absolute CI bound. | P1 | M | none |
| PS3 | **Mode banner verify** (MASKING-INTERACTIONS §14.9 hard gate): visually confirm it exists; build if absent (names the Escape level, ≤120ms). | P2 | S | none |
| PS4 | **MK.11 full scope**: ALL matte params as lanes (feather/growShrink/opacity), `mask_coverage(node_id)` as a modulation SOURCE, keyframed matte transforms. SG-5 is green → unblocked. Shares interpolation machinery with WS4. | P2 | L | WS4 A1–A2 (shared lane plumbing) |
| PS5 | **MK.12 RVM subject/background dual-chain** (figure-isolator port) — heavy; explicitly deferred unless user pulls it in (D5). | P3 | XL | D5 |

## WS4 — Transform automation (record + draw + overdub on asset transforms)

The three-part seam (all code-verified missing):

| ID | Packet | Priority | Effort | Depends |
|----|--------|----------|--------|---------|
| A1 | **Clip-scoped lane addressing**: extend `AutomationLane.paramPath` scheme with `clipTransform.<clipId>.<field>` (x/y/scaleX/scaleY/rotation, opacity later); expose in `AutomationToolbar.getAvailableParams()`; draw-in works immediately (Draw mode already paints any lane). | P1 | M | none |
| A2 | **Per-frame transform evaluation**: fold resolved transform-lane values into the `transform` IPC field per frame (parallel to `evaluateAutomationOverrides`) for preview; **for EXPORT, the packet MUST name its mechanism before dispatch** — either (a) frontend pre-bakes a per-frame transform array into the export payload, or (b) backend replays the lane (`export.py` already has a performance-replay path to mirror). Preview==export parity test is the acceptance gate. RISK:HIGH — this touches the render-payload contract, the exact seam class that caused P1-B; qa-redteam mandatory. | P1 | M | A1 |
| A3 | **Record from the bounding box**: wire `BoundingBoxOverlay.onChange` (and `TransformPanel` numeric fields) into the same latch/touch + armed-track + lane-lookup + `recordPoint` pattern as `ParamPanel.handleKnobChange`. **Note: latch/touch recording is only meaningful while the transport is PLAYING** (points are keyed to playhead time) — stopped-transport transform edits stay plain store writes; Draw mode is the stopped-transport authoring path. Acceptance criteria must cover both states. | P1 | S–M | A1 |
| A4 | **Continuous-lane overdub** (decision D2): additive-layering or trim-region punch mode for numeric lanes (trigger lanes already overdub). Applies to ALL continuous lanes, not just transforms. | P2 | M | A1 |
| A5 | **Backend transform interpolation QA**: `_apply_clip_transform` under per-frame animated values — rotation anchor stability, clamp behavior at extremes, warpAffine perf at 1080p. | P2 | S | A2 |

## WS5 — Hardware mapping scheme (banked, focus-follows, record-capable)

**Target UX (the user's scenario):** learn the controller once → knobs always control "the focused thing" →
record or draw automation from them → select a different device/component → same physical knobs are already
mapped to the new component. No re-learning.

**Design: bank-relative slots** (from the MIDI sweep):
- `CCMapping` becomes `{cc, bankSlot}` — a CC learns its **physical knob position** (0–7), once per controller,
  not a target.
- `BankAssignment{contextKey, slots[8]}` — per focused context, what each slot controls. Slot targets:
  `{effectId,paramKey}` | `{type:'macro',rackId,macroId}` | `{type:'transform',clipId,field}` |
  `{type:'mask',nodeId,param}`.
- **Auto-assignment defaults** so it "just works" without manual setup: rack focused → its 8 macros; effect
  device focused → first 8 float/int params (registry order); clip selected (no device) → transform bank
  (x, y, scaleX, scaleY, rotation, opacity, +2 spare); user can override + save per context.
- Macros are the anchor target: 8 macros ≈ 8 knobs, and macro `routes[]` fan-out means re-routing happens in
  the rack, not the controller layer.
- **Control semantics (resolves the overlay-vs-store split):** ALL hardware CC control is a transient
  modulation overlay (today's `applyCCModulations` behavior — non-destructive, twist to hear, release to
  return to base) EXCEPT while automation recording is armed (latch/touch + playing), where CC moves commit
  through the same record path as manual knob drags. CC→macro follows the same rule: transient macro
  modulation normally, committed `RackMacro.value` writes while recording. This mirrors how the manual knob
  already behaves and avoids a mixed model where macros are permanent but effect params are not.
- **User's actual hardware (D4 answered 2026-07-02) — design against these three, ship built-in profiles:**
  - **Akai MIDImix** — 8 channel strips × (3 knobs + 1 fader) + master fader + mute/rec-arm buttons, fixed
    factory CC map. Model as **4 bank ROWS of 8** (knob-row-1/2/3 + fader row), not a single 8-slot bank:
    fader row → default mix bank (track/pad opacity or 8 macros), knob rows → focused device's param banks.
    Mute/rec-arm buttons → track mute / record-arm; BANK L/R buttons → bank paging (makes H7 paging P2, not P3).
  - **Novation Launchpad** — 8×8 note grid, no CCs. Maps to the NOTE layer (existing `padMidiNotes` learn),
    not CC slots: rack pads / drum-rack triggering + choke groups; bottom row candidates for bank/context
    switching. Grid-note profile shipped built-in.
  - **Korg nanoPAD 2** — 16 velocity pads + X-Y touchpad (default CC1/CC2). The X-Y pad is the marquee
    transform-automation controller: one 2-axis slot pair, default-assigned to clip transform x/y when a clip
    is focused (records position automation by finger-drawing) and re-assignable to any 2D pair (granulator
    axes, feather/grow). Velocity pads make H6 (velocity plumbing) worth promoting to P2.
  - Scheme consequence: a `ControllerProfile` = named layout of CC→(row,slot) + note→grid entries, shipped
    for these three, learn-fallback for anything else. H5 persists per-profile.

| ID | Packet | Priority | Effort | Depends |
|----|--------|----------|--------|---------|
| H1 | **Focused-context selector**: one derived, subscribable `activeMappingContext` from `selectedTrackId` × `selectedRackPad` × `rackEditPath` × `selectedEffectId` (+ selected clip). Foundation for banks AND fixes the "what is focused" ambiguity generally. | P1 | S | none |
| H2 | **Bank model + resolver**: types above; `applyCCModulations` resolves `cc → bankSlot → focused context's slot target`; keep legacy absolute mappings working (migration: existing `{cc,effectId,paramKey}` → pinned assignment). | P1 | M | H1 |
| H3 | **Widen the learn surface**: right-click learn on rack macro sliders, instrument device knobs (sampler/granulator/frame-bank), transform panel fields, matte-op sliders — all become slot-assignable. | P1 | M | H2 |
| H4 | **CC → automation recording**: subscriber on CC changes routes through the SAME latch/touch record path as manual knobs (respecting rate-limit/echo suppression from B10). With A1–A3, hardware records transform automation; with existing lanes, effect params. Draw-in already covered by Draw mode. | P1 | M | H2, A1–A3 for transforms |
| H5 | **Controller-identity persistence**: persist knob-position learn (`cc→bankSlot`) per controller fingerprint (name+manufacturer) at app level (not per-project); bank ASSIGNMENTS stay per-project. Reconnect = mapped. | P2 | S–M | H2 |
| H6 | **Velocity plumbing**: MIDI velocity (already captured, currently discarded — hardcoded 127) → pad trigger velocity → voice opacity/env depth. Promoted to P2: nanoPAD 2 + Launchpad are both velocity pads. | P2 | S | none |
| H7 | **Bank paging + bank HUD**: MIDImix BANK L/R buttons page between knob-row banks; HUD shows slot→param on context switch. Promoted to P2: MIDImix has dedicated paging hardware. | P2 | M | H2 |

**Dependency spine:** H1 → H2 → {H3, H4, H5, H7}; H4's transform leg needs A1–A3. WS4 and WS5 converge at H4:
that's the moment "twist a hardware knob, record scale automation on a clip, switch to the granulator, twist
the same knob to control density" all works.

---

## Sequencing (proposed waves)

- **Wave 0 (parallel, start immediately):** F1 (P1-B) · F2 (sampler persistence) · F3 (CI red) · F4 (IPC).
  Zero file overlap. F1 needs the user's go for the sidecar-restart repro step.
- **Wave 1:** WS2 instruments live pass (needs F1) · T1 cheap tool wires · F5–F8 papercuts · PS3 banner check.
  **WS2/WS3 live passes require a computer-use grant + the app running from the canonical checkout (Gate 18)**
  — request CU at wave start, not mid-pass. Hardware waves (H2+) additionally need the physical controllers
  plugged in for live verification.
- **Wave 2:** A1→A2→A3 (transform automation core) · PS1 MK.CU (built during the WS3 live pass) · PS2 (#44 perf)
  · H1 (context selector — small, unblocks Wave 3).
- **Wave 3:** H2→H3→H4→H5 (hardware banks + recording) · A4 (overdub) · T2 (slip/slide) · T3 (lock) · PS4 (MK.11).
- **Wave 4 (optional/user-pulled):** PS5 (MK.12 RVM) · H6/H7 · T4/T5.

Campaign rules apply: packet-per-branch, squash-merge, CI green on SMOKE, §6 verification, qa-redteam on
RISK:HIGH (A2, H2, PS2 qualify), no `.github/workflows/**` changes.

## Decisions — RESOLVED 2026-07-02 ("demo d5 first but yes your recs for the rest are good")

- **D1 — LOCKED:** wire the 5 cheap cursor tools in Wave 1 (razor/marker/loop-in-out/ripple-tool/range-select);
  build slip + slide as real features in Wave 3.
- **D2 — LOCKED:** punch-replace (touch-overwrite, release-resumes) is the overdub default for continuous
  lanes; additive "relative" mode ships later as a toggle.
- **D3 — LOCKED:** both clip lock AND track lock (track lock = all-clips guard + reject drops).
- **D4 — LOCKED:** Akai MIDImix + Launchpad + Korg nanoPAD 2 profiles as specced in WS5; auto-assignment
  defaults approved (MIDImix fader row→mix/macros, knob rows→focused device, nanoPAD X-Y→clip x/y,
  Launchpad grid→rack pads).
- **D5 — DEMO FIRST:** before scheduling MK.12, produce a standalone demo of RVM subject-matting on real
  footage (via the existing `~/Development/figure-isolator` local RVM setup): original | matte | selectively-
  glitched composite. Scheduling decision (this campaign vs next) follows the demo verdict.
