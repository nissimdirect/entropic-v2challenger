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
