# Creatrix Live CU-UAT Plan — 2026-07-02

**Scope:** full-functionality live pass via computer use, PLUS use-case hole-hunting and
antipattern detection — testing user JOURNEYS, not only feature mounts. Successor to
`docs/UAT-PLAN-2026-06-17-full-coverage.md` (12/12 verdicted; its Area-mount checks are
NOT repeated here unless a fix touched them).

**Precondition:** Wave 1 of `docs/plans/2026-07-02-month-audit-fix-plan.md` merged
(F1 P1-B, F2 persistence, F3 e2e). Running UAT before F1/F2 re-blocks Areas 2/7 and makes
every save/reload check false-fail. If the user wants a pass sooner, run Stage A only.

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

## Stage F — MK.CU exit gate (formally closes the fabricated ledger claim)

Run MASKING-INTERACTIONS §0 J1-J5 journeys (draw/refine/route/key/export with masks) as a named
suite; record per-journey verdicts. This is the FIRST real MK.CU run — EXECUTION-PLAN.md's prior
"active in rotation" claim was false (corrected by fix-plan F8).

---

## Report format

`docs/UAT-RESULTS-2026-07-02.md`: per-stage tables, verdict + evidence link per row; bug list
with severity; the Stage E ranked papercut list; final tally (Gate 20: full scope / executed /
remaining, with named blockers for any ⏸). Bugs get filed into a fix wave, NOT fixed mid-UAT
(stock-take rule) except a P0 crash blocking the rest of the pass.

**Estimated wall-clock:** ~4h for A-F. If budget-constrained: A+B+C are the core (P1/P2 risk);
D+E+F can run as a second session.
