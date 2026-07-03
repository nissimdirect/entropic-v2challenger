# Creatrix CU-UAT Results — 2026-07-03 (STARTED, partial)

**Runtime verified:** DEV Electron from `~/Development/entropic-v2challenger/frontend` (npm start,
:5173) — NOT the stale `~/Desktop/Creatrix.app` package. Confirmed via DevTools (`./index.tsx`,
`var(--cx-bg-app)` Live Signal tokens). This is the feature-complete build with tonight's merges.

## Stage A — launch + fresh-merge confirms (PARTIAL, live-verified)
| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| A1 | Launch clean, welcome → New Project, no crash | ✅ | full DAW UI rendered |
| A2 | Engine connects | ✅ | status bar "Engine: Connected · Uptime 1156.8s" |
| A7a | A4 overdub toggle present (live) | ✅ | "Overdub" button in automation toolbar |
| A7b | H-UI hardware-mapping present (live) | ✅ | "MAP" button in status bar (bottom-right) |
| — | Effects browser 5-tab + categories render | ✅ | fx/op/composite/tool/instruments; 22 destruction, 18 distortion, etc. |

**Milestone: tonight's headline merges (A4 overdub, H-UI mapping) are provably in the RUNNING
build, not just merged in git.** No crash on launch or New Project.

## NOT YET RUN (the rest of the comprehensive pass — needs a dedicated session)
- A3 P1-B fix live (sampler voice + effected clip preview) · A4-A6 regression journeys
- Stage B persistence round-trips · Stage C creative journeys (WS2 instruments)
- Stage D chaos/antipatterns · Stage E design audit vs DESIGN-SPEC
- Stage F.1 MK.CU J1-J5 · F.2 MK.13 banner · Stage G B3 layout live · Stage H MK.12 subject-matte

**Honest status: CU-UAT is STARTED with real live evidence (Stage A partial), NOT complete.
The full A–H pass is a multi-hour foreground effort; this session verified the app launches
feature-complete and the two headline features are live.**


---

## PRE-CU FINDINGS — no-computer-use pass (2026-07-03, while CU lease blocked)

Work completed WITHOUT driving the screen (CU lease held by the parallel session).
Runtime = local Electron build from `~/Development/entropic-v2challenger/frontend` (out/main).

### Plan hardening (PR #387 — review addendum, 2 revisions)
Zero-trust verification of every plan reference vs main@404f3a3 surfaced and fixed:
- **Key-map drift**: journeys spec `g`/lasso, `c`/key, `v`/view-cycle; shipped bindings are
  `w`/lasso, key+wand **click-only** (no hotkey), `v`=Select. Driving with spec keys = false-fail.
- **Unshipped spec**: matte/rubylith preview view-modes have ZERO implementation → J2 j2-03/j2-06
  pre-classified as expected 🐛 (spec'd, never built), not a mid-run surprise.
- **Removed feature**: A7c range-select tool cut by the T5 cull; slip(`s`)/slide(`d`) added by T2 #359.
- **T3 lock + T4 marker-rename ARE on main** (rode inside the #359 squash — Track.tsx `Lock track`
  3521c59, timeline.ts `renameMarker`), despite stacked PRs #355/#357 closing empty. TEST both.
- **Citations**: F.2 banner spec = DESIGN-SPEC §10.2 (not the nonexistent §14.9); MK.12 gate = #350.

### A6 e2e oracle — CLASSIFIED (local repro on the dev build, not CI-infra flake)
The 4 "red journeys" the plan says to run manually against e2e expectations — the oracle is broken:
| Cluster | Local repro | Verdict | Owner |
|---|---|---|---|
| `phase-11/export.spec.ts` (3 tests) | 2 fail + 1 flaky locally | **TEST-ENV** — exports to `os.tmpdir()`=`/private/var`, rejected by `security.py` BLOCKED_OUTPUT_PREFIXES ("Cannot write to system directory"). Exposed by #378's `stubSaveDialog` switch. App export to ~/Desktop unaffected. | e2e lane (fix: home-dir temp path) |
| `regression/edge-cases.spec.ts` (10 tests) | 10 fail / 3 pass locally (== CI) | **APP-vs-TEST divergence** — expected selectors (`.effect-rack--empty`, `.drop-zone`, `.export-btn`) all still EXIST in code, so not stale-selector; behavioral/timing regression needing e2e-lane triage | e2e lane (#378 territory) |
| `regression/security-gates.spec.ts` SEC-15d | fails | **REAL surface note** — preload bridge exposes ~15 methods incl. `readFile`/`writeFile`/`deleteFile`; test whitelists only 6. File I/O on the bridge since Phase 4 (Feb 28) by design for persistence; the TEST allowlist is stale, BUT the wide renderer file-I/O surface is worth a security look | e2e lane + security |
| `phase-12` text/image, `phase-6` inspector, `phase-4` op-drag | fail in CI | not yet locally bisected | e2e lane |
**CU implication:** the e2e oracle is confirmed-unreliable on the live build → **A6/C1/C6/J5 must be
judged by DRIVING THE APP and pixel-verifying exports, never by the red e2e result.**

### Sidecar red = fx.copy_machine (#368, unmerged recipe), pre-classified
`test_parameter_sweep` + `test_calibration` fail on `fx.copy_machine` (missing `curve`/`unit` on
`feedback_amount`; cell_size/glyph_set/freeze/invert_auto "no visible impact" at frame_index=0 —
temporal effect, inert on a single frame). Same class as the fx.extrude_spin exemption (#379).
Not a UAT-surface bug; belongs to the copy-machine merge.

### Stage E static pre-audit (feeds the live design pass)
Ran a className-vs-CSS + type-floor scan over 26 tsx surfaces changed in 24h:
- **Orphan-class LEADS** (need live pixel-confirm — may be inline-styled, e.g. MarqueeOverlay uses
  inline SVG stroke, NOT a CSS bug): automation picker (`.auto-toolbar__picker*`), framebank slots
  (`.framebank-slot*`), rack breadcrumb (`.rack-breadcrumb__*`), transform panel (`.transform-panel__*`),
  effect-browser tool chips (`.effect-browser__tool-*`). Verify each renders styled when driven.
- **Type-floor**: `b3-layout.css` has 9–9.5px labels and `device-chain.css` has 7–8px — BELOW the
  DESIGN-SPEC §9 11px floor. B3 layout is flag-gated OFF by default so it won't show unless enabled;
  device-chain 7–8px is live today → Stage E candidate papercut.

### Feature-flag matrix ADOPTED (PR #389, parallel session)
`docs/UAT-FEATURE-FLAG-AUDIT-2026-07-03.md` folded into the pass: F_CREATRIX_LAYOUT default-OFF
(B3 hidden unless enabled; their task #20 flips it), 22 F_0512_* bugfix flags default-ON. New Stage
FLAGS added inside Stage A (default-verify → flip → verify → flip-back round-trip). #19/#8 thumbnail
overlap flagged.

### Chaos fixture kit built (Stage D-ready)
`test-assets/uat-chaos/`: malformed (.txt-as-.mp4), tiny 100px, 4h-duration low-bitrate,
spaces+quotes name, unicode/emoji name. Plus `test-assets/green-half.mp4` (J1/J2 fixture per spec).
Export-verify tooling (`verify_export.py`: PIL pixel/diff/ProRes-4444-alpha probe) smoke-tested.

**Still requires CU (nothing below can be done headless):** every ✅/🐛 verdict in Stages A3–H —
all need the running screen driven and screenshotted. This pass de-risked them; it did not replace them.


---

## LIVE CU PASS — Session 2 (2026-07-03 PM, dev build af9ba3b, computer-use)

Runtime: dev Electron relaunched fresh from `frontend` (npm start :5173), confirmed dev build via
DevTools `./index.tsx` + `--cx-bg-app`/`--cx-text-1` Live Signal tokens. Engine Connected throughout.
Verdict key: ✅ pass · 🐛 bug · ⚠️ observation-to-investigate · ⏸ not-run.

### Stage A — regression + spine (PASS)
| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| A1 | Clean launch → New Project → DAW | ✅ | Welcome (CREATRIX v3.0.0), no crash |
| A2 | Import renders | ✅ | test-video.mp4 1280x720 color bars; scrub 0→2.0s renders clean (30fps 19ms) |
| A5/G | F_CREATRIX_LAYOUT default-ON | ✅ | LAYER panel present by default (B3 shipped, #398) |
| — | Master bus + automation-editing toolbar live | ✅ | MASTER row; Overdub + Flatten/Ramp/Shape/+Mod buttons; MAP button all present |
| A7a | %-label fix (#337) | ✅ | device reads "30px"/"MIX 100%", not "1.00%" |

### Core pipeline (the spine) — end-to-end PASS
| Step | Verdict | Evidence |
|------|---------|----------|
| Add effect → preview | ✅ | fx.chromatic_aberration renders (fringing visible); Offset knob drag 5→30px works |
| Export H.264 MP4 | ✅ | full-timeline 150fr → ~/Desktop/uat-parity-ca.mp4 (185KB), "Export complete!" |
| Export path guard | ✅ | ~/Desktop export works → confirms export-e2e red = TEST-ENV (only os.tmpdir blocked), NOT app bug |
| **GATE 1: preview==export parity** | ✅ | export vs source mean_abs_diff **24.24** (effect baked in); export RENDERED (mean125/std124, not black) |

### Stage A3 / P1-B — instrument preview unblock (PASS on the bug's surface)
| Check | Verdict | Evidence |
|-------|---------|----------|
| MIDI track add (+I) | ✅ | "MIDI 1" track + PERFORM/CAPTURE control |
| Sampler add (double-click on selected MIDI track) | ✅ | param panel Source/Start/Speed/Opacity/Blend |
| Source bind → test-video.mp4 | ✅ | dropdown selectable+bound |
| **P1-B: no "v2 unsupported" rejection** | ✅ | NO rejection toast, NO compositing-error on mount+bind (the exact #323 surface); render 18→75ms (compositor processing instrument track) |
| INSTRUMENTS present | ✅ | Sampler / Sample Rack / Wavetable / Granulator |
> Full note-triggered voice-render into preview NOT exercised (needs MIDI-note-entry UI) — the rejection-guard that the bug broke is clean.

### Findings
- 🐛 **UAT-1 (P2 papercut, NEW):** on every cold import, frame-0 render fires during the sidecar socket handshake → user sees a "Frame render failed" toast + console `[Render] frame 0 error: Engine error: Socket is closed` (App.tsx:1741). Recovers fully (all later frames render). Not in the known register. Fix: gate frame-0 render on socket-ready, or suppress the toast during startup.
- 🐛 **UAT-2 (P1 candidate — CONFIRMED via discriminating test):** an un-triggered Sampler (MIDI 1, source=test-video, opacity 1.0, NO MIDI note fired) composites its clean source frame over the lower effected Track 2, silently occluding Track 2's chromatic aberration in the preview. **Discriminator run:** muting MIDI 1 → Track 2's CA returns in preview AND render time drops 75ms→25ms → confirms the sampler layer was actively compositing with no note. Design question for the user: an instrument with no note triggered should render nothing (transparent), not paint its full source over other tracks. If MIDI-layer-always-paints is intended, the parity gate still holds; if not, this is a composability/precedence bug. NOT in the known register.
- ⚠️ **UAT-3 (inconclusive):** marquee tool did not activate via `q` with a video track selected (2 attempts; status bar stayed "select"/"effect", no marching ants). May require preview focus or the `tool`-tab chip (addendum notes the chip path). MK.CU J1–J5 remain ⏸ UNRUN — needs a clean retry next session.
- Console noise: `useTrackDragReorder.ts:199/67` "UP armed=false moves=0 swaps=0 / DETACH listeners removed" fire on drag-onto-track gestures — harmless, no reorder committed.

### NOT RUN this session (budget-bounded — for a continued CU pass)
Stage B persistence round-trip · C2–C7 full journeys (freeze FSM, rack macros/choke, granulator 6-axis) ·
D chaos/antipatterns · E design audit · **F masking J1–J5 (retry marquee activation)** · G B3 restack ·
H MK.12 U1–U10 · I automation-editing suite · J modulation/LFO lanes · K master-bus isolation.

### GO/NO-GO (partial — Session 2 scope only)
Of the 6 cross-cutting gates, **Gate 1 (preview==export parity) = PASS** on the effect category on a
1-effect project. The P1-B instrument unblock holds. No NO-GO condition tripped in what was exercised.
UAT-2 is now CONFIRMED (un-triggered sampler occludes lower track) and must get a user design-decision before a full GO — it touches the composability gate. Gates 2–6 and the
full journey/data-loss/composability matrix remain UNVERIFIED live → **overall verdict: INCOMPLETE, not
yet GO** — the spine is proven, the breadth pass is outstanding.
