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

# SALVAGED ADDENDUM (from PR #387, conflicted; folded 2026-07-03) — pre-run zero-trust review
> STALENESS CORRECTIONS at fold time: (1) `F_CREATRIX_LAYOUT` is now **default ON** (#398 merged) —
> invert the A5/G baseline notes below accordingly; the flag round-trip protocol still applies via the
> DISABLE escape hatch. (2) main has moved past 404f3a3 — re-verify the CI-red classification at drive
> time. (3) The export-e2e root cause below is now tracked in task #15 (fix: home-dir temp path).

---

## ADDENDUM — 2026-07-03 pre-run zero-trust review (READ FIRST when driving)

Every reference in this plan was verified against main @ 404f3a3 before the first CU run.
Corrections below OVERRIDE the stage text above where they conflict.

### Shipped-bindings key map (journey specs diverge from code — use THESE keys)
| Spec says | Shipped reality (frontend/src/renderer/utils/default-shortcuts.ts) |
|---|---|
| `g` lasso (J4) | **`w`** = lasso (freehand→polygon→off cycle); `g` is unbound |
| `c` key tool (J2) | **no hotkey** — activate via browser `tool` tab chip (click-only) |
| `v` cycles composite→matte→rubylith (J2 j2-03/j2-06) | **`v` = Tool: Select.** No view-cycle binding exists |
| — | wand: **no hotkey** — `tool` tab chip only |
| confirmed as spec'd | `q` marquee · `⌫`/`⌥⌫` delete inside/outside · `⌘⇧A` deselect · `⌘J`/`⌘⇧J` copy/cut region to track · `i`/`o` loop in/out · `⌘L` loop toggle · `⌘⇧I` routing canvas · `b` razor · `s` slip · `d` slide · `x` ripple · `⇧M` marker |

### Known gaps — pre-classified (file as findings, do NOT burn CU time hunting)
1. **Matte/rubylith preview view modes are UNSHIPPED** — zero code hits for rubylith/matteView.
   J2 checkpoints j2-03, j2-06 and the `view: matte` statusbar chip WILL fail → expected 🐛
   (spec'd in MASKING-INTERACTIONS §5/§8 + DESIGN-SPEC, never built). Judge the rest of J2 on
   composite view only.
2. **A7c correction:** the range-select cursor tool was REMOVED post-plan (T5 cull,
   default-shortcuts.ts:64). A7c now = razor/ripple/marker/loop by click+hotkey, PLUS assert
   range is gone, PLUS slip (`s`) / slide (`d`) from T2 #359.
3. **T3 lock + T4 marker-rename ARE on main** — their commits rode inside the #359 (T2)
   squash, which is why stacked PRs #355/#357 closed empty (adjudicated: `Lock track` in
   Track.tsx via 3521c59; `renameMarker` in timeline.ts). TEST both: clip+track lock
   (D5-adjacent: mutation guards) and marker double-click inline rename.
4. **Stage F.2 citation fix:** the mode-banner spec is DESIGN-SPEC §10.2 (20px banner, ≤120ms,
   MOD dot, esc keycap naming the NEXT escape level) — not "SELECTION-MASKING-SPEC §14.9"
   (§14 is Open Decisions; no §14.9 exists).
5. **Stage H gate:** MK.12 build = #350 MERGED (#342 was the PRD-only PR). Within H: U7 is ⏸
   (coverage_tap.py absent — MK.12c unbuilt), U9 ⏸ (MK.12b), U10 unscheduled. Run U1–U6 + U8
   limitation probe.
6. **Report filename** = docs/UAT-RESULTS-2026-07-03.md (supersedes the 07-02 name above).

### Red-team riders (2026-07-03, 8×P1 + 2×P2 confirmed; step wording below OVERRIDES stages)
- **Pre-start:** relaunch the DEV Electron fresh (kill PID + `npm start`) before Stage A —
  re-baselines uptime/state. (Original stale-#377-bundle claim REFUTED by reflog: the 00:34
  launch used a tree pulled at 00:11 that already contained #377.)
- **B4 runs on a THROWAWAY project** (the L40 throwaway rule now covers B4, not just D/C7),
  and after verifying recovery, DELETE the autosave before B5 or it contaminates B5's verdict.
- **B3 legacy load:** COPY the legacy .glitch to a throwaway path and load the copy — never
  the original (auto-migrate/save could mutate it).
- **C7:** quit the app AND confirm no other writer before the move-aside; use COPY-aside, and
  restore only into a confirmed-absent target, else abort loudly (a naive `mv` restore nests
  the backup inside a freshly-recreated ~/.creatrix).
- **D1:** the "4-hour file" = a generated low-bitrate long-DURATION file (still-image src);
  check free disk first; delete after.
- **D3:** kill ONLY the UAT sidecar's child PID (from the app process tree / sidecar.log) —
  never pkill-by-name (parallel sessions run python too). Defer sleep/wake and the dual-instance
  check until the parallel session is idle; dual instance = throwaway project + expect the
  single-instance/userData collision, don't force a second vite server on :5173.
- **A6 oracle:** main CI is red on electron-e2e-full shards 2–4 + sidecar at review time —
  classify each red journey app-bug vs test-flake BEFORE issuing a manual ✅/❌.
- **D4/D5:** after the 64-op/500-clip boundary tests, New Project (or relaunch) before D5/D6/E
  so boundary state doesn't poison later verdicts.
- **Coordination:** the parallel build session must NOT `git pull` the canonical checkout while
  the CU pass runs (source-file pulls trigger vite HMR mid-pass); docs-only merges are safe.

### A6 pre-classification — export e2e cluster ROOT-CAUSED (2026-07-03, local repro)
The 3 red `phase-11/export.spec.ts` tests are **TEST-ENV, not app bugs**: the spec exports to
`os.tmpdir()` (= `/private/var/folders/…`), which `backend/src/security.py`
BLOCKED_OUTPUT_PREFIXES rejects ("Export failed: Cannot write to system directory:
/private/var" — visible in the failure snapshot). Exposed tonight when #378 switched the spec
from the `__testExportPath` hook to the real `stubSaveDialog` flow. Fix belongs to the e2e
lane: point the spec at a home-dir temp path (or allowlist `$TMPDIR`). **For CU: exports to
~/Desktop are unaffected — do NOT down-verdict C1/C6/J5 on this cluster.** Mass edge-cases/
chaos/security-gates failures still under local classification; B3 (#377) is flag-gated OFF
by default, so it did NOT change the default DOM and is not the breaker.

### Feature-flag matrix (PR #389 audit — ADOPTED into this pass)
`docs/UAT-FEATURE-FLAG-AUDIT-2026-07-03.md` is now a first-class stage input:
- **Stage A5/G baseline correction:** `F_CREATRIX_LAYOUT` is **default OFF** — the app's
  default IS the legacy layout; the B3 grid shell + LayerPanel mount only when enabled
  (`localStorage.setItem('entropic-enable-creatrix-layout','1')` + kill/relaunch). Their
  wave-1 task #20 flips the default ON — if it merges mid-pass, relaunch and re-baseline;
  name the flag state in EVERY layout-affected verdict (A5, A7b, E, G).
- **New Stage FLAGS (run inside Stage A, after A7):** per-flag default-verify → flip →
  verify old behavior → flip back → confirm clean round-trip, per the audit's protocol.
  P0 first (`F_0512_14` space transport, `F_0512_29` reload rebind), then P1, then the three
  CSS-disable flags (`F_0512_8/30/36` via body attr). A flag that can't round-trip = 🐛.
- **Coordination traps:** task #19 (zoom thumbs) overlaps `F_0512_8_CLIP_THUMBS` — test
  together; re-grep `frontend/src/shared/feature-flags.ts` at CU start (their wave-1 may add
  flags: master-out #18, AA.4).
