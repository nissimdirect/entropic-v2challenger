# Creatrix Live CU-UAT Plan — 2026-07-02

**Scope:** full-functionality live pass via computer use, PLUS use-case hole-hunting and
antipattern detection — testing user JOURNEYS, not only feature mounts. Successor to
`docs/UAT-PLAN-2026-06-17-full-coverage.md` (12/12 verdicted; its Area-mount checks are
NOT repeated here unless a fix touched them).

**Precondition:** Wave 1 of `docs/plans/2026-07-02-month-audit-fix-plan.md` merged
(F1 P1-B, F2 persistence, F3 e2e). Running UAT before F1/F2 re-blocks Areas 2/7 and makes
every save/reload check false-fail. If the user wants a pass sooner, run Stage A only.

**SCOPE EXPANSION (2026-07-02, runs LAST in the session per user directive "put CU last and
make it even more comprehensive" + tune-up-campaign CU-lane handoff).** This pass now also owns,
in ADDITION to Stages A–F below:
- **WS2 instrument live pass** — the deep items P1-B was blocking (sampler trigger 2.2, rack
  macros/choke/nesting, frame-bank scan, granulator 6-axis, freeze FSM end-to-end, MIDI Learn).
  P1-B is fixed (#323) so these should finally pass → **Stage C is the home for these (C2/C3).**
- **PS1 — MK.CU J1–J5** (Stage F): build the suite for real. It was FABRICATED as "in rule-9
  rotation" (EXECUTION-PLAN:477, corrected by F8) — this is its first real run.
- **PS3 — MK.13 mode-banner visual gate** (new Stage F.2): spec §14.9 (banner ≤120ms naming the
  Escape level); a code sweep couldn't find the component — CONFIRM VISUALLY or file 🐛.
- **CU-confirm the parallel session's fresh merges** (new Stage A.7): #336 (no stray track on
  click), #337 (Color-Invert reads "100%" not "1.00%"), #338 (device editor scrolls, preview
  never collapses — BOTH `F_CREATRIX_LAYOUT` states), #339 (razor/ripple/marker/loop/range cursor
  tools work by click AND hotkey).
- **B3 layout CU pass** (new Stage G) — gated on B3 build L2–L4 landing; if the flag layout isn't
  built yet at run time, Stage G is ⏸ (blocker named: L2–L4 not merged).
- **MK.12 subject-matte** (new Stage H) — gated on MK.12a (#342) landing; U1–U10 subject-driven
  modulation incl. the honest v1 single-dominant-subject limitation (corrected by stacking a
  lasso/wand node). ⏸ if MK.12a not merged at run time.

**File-ownership boundary (do NOT fix in this lane — file as tasks/issues):** the parallel session
owns `stores/{midi,layout,timeline}.ts`, `App.tsx`, `BoundingBoxOverlay.tsx`, `TransformPanel.tsx`,
`ParamPanel.tsx`, `utils/automation-record.ts` (WS4/WS5), and `backend/src/masking/ai_matte.py`
(MK.12a). Bugs found there → TaskCreate/issue with repro, never an edit.

**Runtime protocol (hard rules):**
- Request computer-use access for Electron (and Finder if file dialogs need it) at session START,
  not mid-pass; run a 2-minute smoke (launch + click + screenshot) before starting the clock.
- ALL chaos/destructive checks (Stage D, C7) run on throwaway projects created for this pass —
  never on user project files. C7's `~/.creatrix` move-aside gets an explicit backup
  (`mv ~/.creatrix ~/.creatrix.uat-backup-$(date)`) and a restore step that runs even on
  failure; C7 executes LAST in Stage C for this reason.
- Launch from the canonical checkout: `cd ~/Development/entropic-v2challenger/frontend && npm start`.
  Verify the running app's process path matches the edited tree BEFORE any verdict
  (live-runtime rule; `entropic-v2-uat` worktree is a decoy). Name the runtime path in the report.
- Store-shape changes since last launch → kill + relaunch, never trust HMR.
- Evidence standard: screenshot per verdict; exports decoded with PIL (pixel assertions, not
  "file exists"); verdicts ✅ ❌ 🐛 ⏸ only — no partials. Effect amount must be verified non-zero
  before any "render broken" claim (the P1-A lesson).
- Every 🐛 gets: repro steps, screenshot, severity, and a sweep for siblings before filing.

---

## Stage A — regression re-baseline (~30 min)

| # | Check | Oracle |
|---|-------|--------|
| A1 | Launch clean, sidecar connects, no startup error toast | screenshot + `~/.creatrix/logs/sidecar.log` tail |
| A2 | June-17 pre-flight 4/4 still green (import renders, no poison autosave) | screenshot |
| A3 | P1-B fix verification: sampler voice + effected clip → preview OK; rack pad WITH insert chain → preview OK | no "v2 unsupported" toast; rendered frame differs from source |
| A4 | #318 regression: add effect to clip repeatedly, stack 5 effects fast | no crash-loop, React devtools error count 0 |
| A5 | #319 regression: Creatrix layout renders in BOTH flag states | screenshot each |
| A6 | The 4 e2e-red journeys, manually: watchdog reconnect, effect move-down, full journey (import→effect→param→export), import-dialog hint | match e2e expectations |
| A7a | **#337 confirm:** add Color Invert to a clip → param label reads **"100%"** at full, not "1.00%" | zoom on the label |
| A7b | **#338 confirm:** open a tall instrument device editor with a clip selected → preview never collapses; device region scrolls internally — verify in BOTH `F_CREATRIX_LAYOUT` states | screenshot each state |
| A7c | **#339 confirm:** razor/ripple/marker/loop/range cursor tools each work by CLICK and by HOTKEY | one screenshot per tool showing its effect |
| A7d | **#336 confirm:** click-select clips near a lane's bottom edge ×10 → NO stray empty tracks appear (the June-17 gesture) | track count stable |

## Stage B — persistence & round-trip (the F2 class, ~45 min)

| # | Check | Oracle |
|---|-------|--------|
| B1 | Maximal project round-trip: sampler (loop+glide+melodic+rgbOffset+endFrame), frameBank (timeAxis=y), granulator (6-axis params), rack (pad chain + choke + macro), masks (rect+lasso+wand+key, feather/invert), operators (Kentaro + axisBinding), performance events → Save → **quit app fully** → relaunch → Load | every value survives, verified control-by-control against pre-save screenshots |
| B2 | Save → Load → Save → byte-compare the two save files | identical (or diff explained field-by-field) |
| B3 | Legacy project (pre-campaign .glitch from `~/.creatrix/projects/` or `~/.entropic/projects/`) loads | no crash; drop-with-toast only where designed |
| B4 | Autosave/recovery: kill -9 the app mid-edit → relaunch | recovery offer appears, restores state |
| B5 | New Project after loaded project | ALL stores reset (samplers/racks/granulators/frameBanks/masks/operators — the #167 "samplers survive New Project" class) |

## Stage C — creative journeys (use-case holes; ~90 min)

Journeys, executed start-to-finish as a musician would. A journey FAILS if any step needs
undocumented knowledge, a workaround, or silently produces wrong output — even if every
individual feature "works."

- **C1 Music-video glitch pass:** import 2 clips → trim/arrange on timeline → per-clip effects →
  per-track chain → mask a region (wand) → key out a color (chroma) → modulate an effect param
  with an LFO synced to BPM → export MP4 → play the file in QuickTime. *Watch for: BPM sync
  actually audible/visible? Modulation visible in export, not just preview?*
- **C2 Performance take:** MIDI track → Sampler with loop+melodic → play notes (virtual MIDI or
  pads) → capture via retro-capture → quantized launch ON → freeze the take → unfreeze → edit →
  re-freeze. *Watch for: FSM dead-ends, double-bake guard, frozen clip playable after reload.*
- **C3 Rack builder:** Sample Rack → 4 pads, per-pad chains, choke group, macro knob bound to 2
  pad params → drill into nested rack → back out → trigger pads live. *Watch for: nav dead-ends,
  macro range feel, choke actually cuts.*
- **C4 Grain sculpting:** Granulator → sweep all 6 axes while playing → onset selection mode →
  push density until SG-8 pressure toast → confirm degrade is graceful + toast dismisses on
  recovery (#298) → export a granulated section, compare preview vs export frame.
- **C5 Field + routing:** field-capable effect → assign image as 2D field source → Inspector
  Track shows the lane → Routing Canvas (⌘⇧I): create a route by drag, trigger the cycle
  pre-flight warning deliberately → verify the block reason is comprehensible.
- **C6 Masked composite export:** multi-track + masks + alpha → ProRes 4444 export → probe alpha
  channel with ffprobe/PIL → re-import the export, verify alpha honored.
- **C7 Project handoff:** save C1's project → open on a "clean" state (new user simulation:
  temporarily move `~/.creatrix` state aside) → does it open, are assets relinked or is the
  failure message actionable?

## Stage D — chaos & antipatterns (human-error protocol, ~45 min)

- **D1 Input errors:** unicode/emoji/200-char project names; filenames with spaces+quotes;
  import a .txt renamed .mp4; import a 4-hour file; a 100×100px video; param fields: paste
  "1e999", "-0", "NaN", emoji.
- **D2 Timing errors:** double-click every button that mutates state (export, freeze, bake,
  wand); spam undo/redo ×50 during playback; start export then immediately edit the timeline;
  close app during export (job cancel or orphan?).
- **D3 State errors:** two app instances on the same project file; disconnect sidecar mid-render
  (kill python) → watchdog restart UX; sleep/wake the Mac mid-session.
- **D4 Boundary errors:** 64 operators (MAX cap) then add one more — error comprehensible?
  MAX_GRAINS, 64 pads, mod-edge cap: each cap's user-facing behavior (silent clamp vs toast).
  Timeline zoom min/max; 500-clip project.
- **D5 Sequence errors:** export before importing anything; freeze an empty perf track; delete a
  track while its device editor is open; undo a track delete → devices/instruments restored
  (UH.2/UH.3 #314)?
- **D6 Stray-track gesture:** the June-17 mystery — click-select clips near the lane bottom
  edge repeatedly; count tracks. (Mechanism pinned in fix-plan P6: no drag threshold.)

## Stage E — design & UX audit (the user's Jul 1 ask: "we can do better on some designs")

- Screenshot every major surface (timeline, device chain, each instrument editor, browser tabs,
  inspector states, routing canvas, mask overlay, export dialog, perform panel) at default size
  AND at a cramped window (1280×800).
- Grade each against `docs/roadmap/DESIGN-SPEC.md` (Live Signal v1.1): token compliance, contrast
  (AA), hit-target size, focus-visible, information hierarchy. The June pattern was "markup ships
  with 0 CSS" — look specifically for unstyled/default-looking regions.
- Known candidates from June-17 minors: device-editor cramping pushing preview off-screen
  (fix-plan P4), `%`-unit labels reading as 1/100th (P5), sequencer intuitiveness (user: "i dont
  understand the sequencer the ux is not intuitive" — June 13, never re-tested).
- Output: ranked papercut list with screenshots → feeds a design-fix packet wave.

## Stage F.1 — MK.CU exit gate (PS1; formally closes the fabricated ledger claim)

Run MASKING-INTERACTIONS §0 **J1–J5** journeys as a named suite, per-journey verdict + screenshot.
This is the FIRST real MK.CU run — EXECUTION-PLAN:477's "active in rotation" claim was false
(corrected by F8). Each journey draws/refines/routes/keys/exports through a mask; a journey FAILS
if the masked region doesn't visibly gate the effect, or export alpha ≠ preview.
- J1 draw (marquee/lasso/wand → MatteNode visible in stack)
- J2 refine (feather / grow-shrink / invert change the composite)
- J3 route (device chain applies THROUGH the matte — inside-only)
- J4 key (chroma/luma matte, live-modulated key param)
- J5 export (ProRes 4444 alpha round-trips; re-import honors alpha)

## Stage F.2 — MK.13 mode-banner visual gate (PS3)

Spec §14.9: switching mask tool mode shows a banner **within ≤120ms naming the Escape level**.
A code sweep couldn't locate the banner component — so this is verify-or-file: enter each mask
tool mode, confirm the banner appears, is legible, names the right Escape level, and clears.
If absent → 🐛 (spec'd hard gate unshipped), file as a task; do NOT fix here.

## Stage G — B3 layout CU pass (gated on B3 build L2–L4)

⏸ if `F_CREATRIX_LAYOUT` layout (lean headers + LAYER panel) isn't built/merged at run time —
name the blocker (L2–L4 not merged). When present:
- G1 arrangement = layers: drag a track row to restack → composite z-order changes (top renders
  front); render-diff confirms front/back swap.
- G2 lean header: name·eye·`blend·opacity` chip·M/S·twirl only; chip click focuses the LAYER panel.
- G3 LAYER panel reflects the selected track; edit blend/opacity/fill/blending-options/transform →
  preview updates; Save → reload → all panel-edited values survive (the F2 persistence class).
- G4 twirl nests the track's fx + automation lanes; edit a nested fx → preview updates.
- G5 both flag states shippable (flag OFF = today's layout unchanged).

## Stage H — MK.12 subject-driven modulation (gated on MK.12a #342)

⏸ if MK.12a not merged. When present, run the PRD's **U1–U10** (music-video shot → AI subject matte
→ subject-driven modulation). Explicitly probe the **honest v1 limitation**: a scene with TWO
prominent subjects → confirm it tracks the single dominant one, and that stacking a lasso/wand node
corrects it (documented, not a silent failure). Verdict per U-step + the limitation behavior.

---

## Report format

`docs/UAT-RESULTS-2026-07-02.md`: per-stage tables, verdict + evidence link per row; bug list
with severity; the Stage E ranked papercut list; final tally (Gate 20: full scope / executed /
remaining, with named blockers for any ⏸). Bugs get filed into a fix wave, NOT fixed mid-UAT
(stock-take rule) except a P0 crash blocking the rest of the pass. **Cross-lane bugs (in the
parallel session's owned files) → TaskCreate with repro, never an edit.**

**Estimated wall-clock:** ~5–6h for A–H (expanded). Core = A+B+C (P1/P2 risk) + F (MK.CU gate).
G/H are conditional on their builds landing. D+E can run as a second sitting if time-boxed.
**This pass runs LAST in the session** (user directive 2026-07-02) — after the B3 build,
the e2e pyramid, and the Q7 rerun, so it exercises the most complete app state.

---

## LIVE UI MAP — verified 2026-07-03 against the running DEV build

**Runtime guard (repeat every session):** target the DEV Electron (`cd frontend && npm start`,
:5173), NEVER `~/Desktop/Creatrix.app` (stale package). Confirm via DevTools: `./index.tsx` +
`var(--cx-bg-app)` tokens present = dev build. `open_application Creatrix` launches the WRONG
(packaged) app — surface the dev window via its dock icon / app switcher instead.

**Menu bar (macOS):** Electron · File · Edit · Select · Clip · Timeline · Adjustments · View ·
Window · Help. Export = File → Export (Cmd+E). Import = File → Import (Cmd+I) or drag onto timeline.

**Welcome screen:** "New Project" / "Open Project" + a RECENT PROJECTS list. New Project → the DAW.

**DAW layout (New Project state) — exact regions:**
- **Transport (top-left):** play ▶ / stop ■ / loop ◇ · `0:00.0 / 0:00.0` · BPM field (120) ·
  `S` (solo) · `Q` (quantize) · grid selector (1/4).
- **Left dock — browser:** `Browse…` button; tabs **EFFECTS · PRESETS · INSTRUMENTS**; a search
  box; sub-tabs **fx · op · composite · tool · instruments** (the PR-A 5-tab browser); `+ Add Text
  Track`; effect categories with counts (codec_archaeology, color, creative, destruction 22,
  distortion 18, enhance, fx, generator…). "Hover an effect for details" hint at the bottom.
- **Center — preview canvas:** "No video loaded" until import; two small icons bottom-left of the
  preview = the **mask/lasso preview-overlay tools** (MaskSelectOverlay; press `q` for marquee).
- **Timeline (mid):** empty state "Drag media here, press Cmd+I, or use File → Import" · `+ Add
  Track` · `+ MIDI Track`.
- **Automation toolbar (above device chain):** mode buttons **R · L · T · D** · **Overdub** toggle
  (A4 #372) · `+ Lane` · `+ Trigger` · `Simplify` · `Clear` · hint "Click R on a track to arm".
- **DEVICE CHAIN (bottom):** "Add effects from the browser (click or drag)".
- **Status bar (bottom):** left = **`Engine: Connected · Uptime Ns`** (green dot = sidecar up);
  right = **`tool: select`** + **`MAP`** button (H-UI #375 hardware-mapping overlay toggle).

**Confirmed-live tonight (Stage A):** clean launch, engine connect, **A4 Overdub** + **H-UI MAP**
both present and rendered — tonight's headline merges are in the running build, not just git.

**Concrete stage entry points (use these, don't re-discover):**
- Import (A2/A3/B/C/export): Cmd+I → the file dialog (`.file-dialog-btn`); wait for `.asset-badge`
  (up to 90s ingest) then the preview frame.
- Add effect: click a category → click/drag an effect into DEVICE CHAIN; params appear in the panel.
- Sampler/instrument (Stage C2/C3): INSTRUMENTS tab → drag onto a MIDI track (`+ MIDI Track` first;
  guard toast "select a MIDI track first" = expected).
- Masking (Stage F): press `q` on the preview for marquee; the two preview-overlay icons; MAP button
  is HARDWARE mapping, NOT masking.
- Hardware-map UI (H-UI, new): the **MAP** button (status bar) → the MIDI-Map overlay (Stage — new,
  add: highlight mappables, MIDImix 4×8 grid, click-slot→click-param, flash-on-knob).
- Automation record (A1–A4 live): arm a track (R), pick mode R/L/T/D, **Overdub** toggles
  additive-vs-replace; `+ Lane` adds an automation lane, `+ Trigger` a trigger lane.
- Export (Stage 11/C1/C6): Cmd+E → `.export-dialog` → codec select → `.export-dialog__export-btn`
  → `.export-progress__done` (encode can take >30s; wait to 90s).

---

# NEW FEATURES THIS SESSION (2026-07-03) — added to the CU-UAT scope

Everything below shipped to main on 2026-07-03 and needs live CU coverage. Kill+relaunch the DEV
app first (store-shape changed). All of it is Ableton-parity automation + a new Master bus.

## Stage I — Automation EDITING suite (Ableton parity) (~60 min)
Arm a track (R in the automation toolbar), add a lane on an effect param (context menu → Add Lane),
then exercise each editing gesture and confirm the drawn shape SURVIVES save→reload AND matches on
export (preview==export is the invariant).
- **I1 Curves (AA.1):** Alt+DRAG a segment/node → continuous tension; Alt+double-click → straighten.
  Confirm the eased ramp renders (not linear). Simplify preserves the curve shape.
- **I2 Select + move (AA.4):** marquee-drag over breakpoints → they select (highlighted); drag to move
  in time+value; **copy/paste**; quantize toggle (Cmd+U) snaps moved points to grid when on.
- **I3 Transform box (AA.4b):** with a selection, an edge/corner box appears — drag an edge to scale,
  **drag one side down to skew/tilt** (flat → ramp), corner to scale both. **Flatten** (→ constant line),
  **Ramp** (interior → straight line). Each is ONE undo step.
- **I4 Insert Shape (AA.3a):** the "Shape" picker on the toolbar → sine/tri/saw-up/saw-down/square/
  ramp-up/ramp-down/random → bakes REAL editable breakpoints into the lane/selected range (then tweak
  them with I1–I3). Honors quantize.
- **I5 Is-automated LED (AA.6):** a small green dot on any effect knob (ParamPanel + DeviceChain rack)
  that has an active lane; appears/disappears as lanes are added/removed.
- **Oracle:** for at least one param, decode the exported frames (PIL) and confirm the automated value
  matches preview at the same frame. **KNOWN BUG to probe — task #28:** modulation/automation on a param
  whose range is NOT [0,1] (e.g. Hue Shift amount [0,360]) may clamp to [0,1] → value pins low. Test a
  non-[0,1] param explicitly and report if it mis-scales.

## Stage J — Modulation + LFO operator lanes (the differentiators) (~45 min)
- **J1 Modulation lanes (AA.2):** on a param that already has an absolute lane, "+ Mod" adds a
  RELATIVE (blue) modulation lane; blendOp add/multiply/max. Confirm the modulation SUPERIMPOSES on the
  absolute (both coexist, absolute not overwritten). Draw it; confirm preview==export.
- **J2 LFO operator lanes (AA.3-A):** set a lane's source to an operator (LFO) with rate/depth/phase/
  waveform → the param oscillates each frame (generative, not baked). Confirm DETERMINISTIC (same project
  → same output) and preview==export (the LFO runs backend-side in both). Try all waveforms.
- **J3 Spatial axis (the moat):** where exposed, set a lane's domain to Y/X (not just T) → the value
  varies DOWN/ACROSS the frame (spatial ripple), not over time. (AA.3-C spatial-operator is spiked-out —
  don't expect operator-source over Y/X yet; drawn/absolute over Y/X should work.)

## Stage K — Master-Out Bus (~45 min)
A new permanent **Master track** (pinned bottom of the timeline, amber, no clips) processes the FINAL
SUMMED video (all tracks composited).
- **K1 Exists + guards:** every project has exactly one Master track; it can't be deleted, duplicated,
  or hold clips; dragging an INSTRUMENT onto it is rejected with a toast; effects (fx/op/tool) are allowed.
- **K2 Effects on the sum:** add e.g. an invert/color-grade to the Master → confirm it applies to the
  COMPOSITED output (all tracks), not per-track. Empty Master chain = no visual change (byte-identical).
- **K3 Preview==export:** the master effect looks identical in preview AND the exported file. Test the
  single-clip case specifically (M.2b forced it onto the composite path; "Export current frame as PNG"
  should bail to the Export dialog when the Master has effects).
- **K4 Master automation (M.3):** arm the Master track, automate a master effect param → it varies over
  time in preview AND export. **KNOWN-FIXED regression to spot-check:** a master lane on effect type X must
  NOT change a per-CLIP effect of the same type X (contamination was fixed — verify a clip with the same
  effect type as an automated master effect is untouched on export).

## Stage G UPDATE — B3 layout is now DEFAULT-ON (no longer gated)
F_CREATRIX_LAYOUT ships ON (PR #398). Run Stage G against the default layout. Escape hatch:
localStorage 'entropic-disable-creatrix-layout'=1 to compare to legacy. Lock/arm/drag affordances were
ported into the lean header (#395) — verify all three work on the Master + normal tracks.

## Also new: clip thumbnails scale with zoom (#397)
Zoom the timeline in/out → clip filmstrips show more/fewer poster frames (capped at 12). Verify no perf
regression on many-clip timelines.

## KNOWN-BUG WATCHLIST (report against these, don't re-file)
- **#28 (HIGH, open):** automation/modulation clamps to [0,1] on non-[0,1]-range params (Stage I5 oracle).
- **#26:** sg3-aborted lanes filtered in preview but not export bake (preview≠export on sg3-abort).
- **#15:** e2e-full suite broadly red (test-infra debt, not app breakage — smoke is the merge gate).
- **#27:** one timeline-ui component test quarantined (master-pinned-last, CI-flaky) — behavior is sound.
