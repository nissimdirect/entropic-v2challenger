---
title: Month-Audit Fix Plan — everything found by the 2026-07-02 adversarial audit
status: active
created: 2026-07-02
source: 2026-07-02 five-agent audit of the June 2-17 campaign (175 PRs) + session-log mining
supersedes: nothing — ADOPTS docs/plans/2026-06-17-p1b-uat-fix-plan.md as Wave 1 F1 (unchanged)
---

# Month-Audit Fix Plan (2026-07-02)

Ground truth at authoring: main `03b289f`. Local suites green (backend 15,287 / frontend 3,249).
Main CI red (sidecar 1 flake + electron-e2e 4-failure cluster). One open product bug (P1-B).
One new P1 (sampler persistence). Sequencing rule: **Wave 1 lands before the full CU-UAT pass**
(P1-B gates two UAT areas; the persistence hole invalidates any save/reopen testing).

Campaign rules apply per packet: own branch + PR, squash-merge, no `.github/workflows/**`,
every fix ships with a persistent test, §6 verification + qa-redteam on RISK:HIGH.

---

## Wave 1 — product-blocking (pre-UAT)

### F1 — P1-B: instrument voice-layer preview rejection · P1 · effort S-M · depends: none
**ADOPT `docs/plans/2026-06-17-p1b-uat-fix-plan.md` in full — packets P1+P2+P3 as this packet,
and its P4 (layout cramping) / P5 (%-label) / P6 (stray-track gesture) as an independent
parallel papercut wave** (P4/P5 feed UAT Stage E; P6 feeds Stage D6). That plan is fully pinned
and unexecuted; nothing in this audit contradicts it — the wiring agent re-verified its
`zmq_server.py:1218-1255` line pins against main `7d330ba` on 2026-07-02.
- Its STEP 0 (runtime `layer_info` log + live repro) still runs first.
- Its open question 4 (non-rack sampler export hardcodes `chain:[]` at App.tsx:2729/2763) gets
  RESOLVED in this packet, not deferred: confirm whether non-rack samplers support insert chains;
  if yes, serialize them on export; if no, document why.
- **Acceptance:** UAT Areas 2.2 + 7 drivable; the fix plan's own acceptance list; misleading
  `V2_UNSUPPORTED_MESSAGE` rewritten.

### F2 — Sampler (and sibling) persistence round-trip · P1 · effort M · depends: none
The load whitelist (`project-persistence.ts:958-963`) drops `endFrame`, `loop` (B3.1),
`rgbOffset`, `glide` (B3.3), `melodic` (B3.4). Save writes the full spread; reload silently
strips every B3 feature.
- Restore each dropped field **validated at the trust boundary**, mirroring existing patterns:
  clamp numerics (finite + range), validate `loop.mode` against the enum, `melodic.rootNote`
  0-127, reject-with-toast on malformed (match the rack-pad drop-with-toast convention).
  `scrub` stays intentionally un-persisted (modulation destination) — document that inline.
- **Exhaustiveness guard (the real fix):** TypeScript types erase at runtime, so the guard is
  two-part: (a) a runtime constant `PERSISTED_SAMPLER_FIELDS` + `UNPERSISTED_SAMPLER_FIELDS`
  ("scrub") whose union is checked at COMPILE time via
  `satisfies ReadonlyArray<keyof SamplerInstrumentV1>` plus a reciprocal
  `Record<keyof SamplerInstrumentV1, 'persisted'|'unpersisted'>` map — adding a type field
  without classifying it fails `tsc`; (b) a maximal-fixture round-trip test (every optional
  field populated → serialize → hydrate → deep-equal). This kills the whole bug class, which
  is what #315's gate missed.
- **Sweep siblings in the same packet:** run the same type-vs-hydration diff for
  `FrameBankInstrument`, `GranulatorInstrument`, `RackNode`/`RackPad`, matte nodes, operators
  (axisBinding), performance `trackEvents`. #315 fixed 3 named fields; nobody has proven the
  rest of the surface. Add the exhaustiveness guard per type.
- **Acceptance:** save → reload round-trip test asserting field-level equality for a maximal
  project (loop+glide+melodic+rgbOffset sampler, frameBank w/ timeAxis, granulator, rack w/ pad
  chains, masks, operators); exhaustiveness tests green; malformed-input fuzz per new field.

### F3 — electron-e2e red cluster on main · P1 · effort M · depends: none (serialize with F1 if selectors overlap)
4 failures on main HEAD since ≤ #317-#319: phase-0a watchdog, effect-chain move-down,
full-journey, import-video hint text (`toBeVisible`/`toHaveText`).
- STEP 0: pull the CI artifacts (`test-failed-1.png` screenshots + traces) and **classify each:
  stale selector vs real regression** before touching anything (e2e-discipline rule: read the
  screenshots after the FIRST failure). Prime suspects: #319's `.app--creatrix` grid-specificity
  change re-shaping the DOM, #317's control renames.
- Fix per classification: selectors → migrate; real regressions → root-cause fix with unit
  coverage, e2e stays as the guard.
- **Acceptance:** full e2e job green on a main-push run (not just PR smoke).
- **Policy fix (the actual root cause):** the campaign's "merge on smoke-green only" rider is
  retired — post-campaign merge gate = smoke + electron-e2e green (sidecar where path-applicable).
  Codified in EXECUTION-PLAN via F8, enforced from this packet's merge onward.

### F4 — sidecar timing flake · P2 · effort S · depends: none
`test_signal_operator_caps.py::test_render_budget_guard_warns_when_eval_exceeds_16ms` expects
1-2 warnings across 60 slow frames, CI runner produces 6. Wall-clock-dependent assertion.
- Make it deterministic: inject a fake clock / monotonic counter into the budget guard's
  rate-limiter (test the LOGIC: warns at threshold, rate-caps repeats) instead of asserting a
  count produced by real elapsed time. Do NOT just widen to `<=6` — that's the #228 tolerance
  band-aid pattern and it will flake again on a slower runner.
- **Acceptance:** test passes 50/50 locally under `-p no:cacheprovider --count=50` (or loop) AND
  on CI; sidecar job green on main.

---

## Wave 2 — trust-boundary / latent traps

### F5 — IPC allowlist: bidirectional contract · P2 · effort S · depends: none
3 backend handlers registered but unallowlisted (`audio_tracks_clear` zmq_server.py:493,
`mask_gc_sidecars` :574, `render_text_frame` :438) — same class #313 fixed, alive because
`relay-allowlist.test.ts` only checks renderer→allowlist.
- Per handler, decide **wire or remove** (no third option): `audio_tracks_clear` — allowlist it
  (audio-tracks flag work will need it); `mask_gc_sidecars` — allowlist + confirm the GC caller
  that #227 intended actually exists, else wire it; `render_text_frame` — if truly superseded,
  delete the handler and its tests, else allowlist.
- Add the inverse contract test: enumerate backend `_handle_*` registrations (parse the dispatch
  table) and assert each is either allowlisted or on an explicit BACKEND_ONLY list.
- **Acceptance:** bidirectional test green; zero orphans in either direction.

### F6 — bake-log integrity (test pollution + provenance) · P2 · effort S · depends: none
All 181 entries are microsecond streams with empty `device`; pytest writes to the REAL
`~/.creatrix/audio-bake-log.jsonl` (2 entries landed during this audit's test run).
- `bake_log.py`: honor `CREATRIX_BAKE_LOG_PATH` env override; backend `conftest.py` sets it to a
  tmp path for the entire suite. (Test isolation at the writer, not per-test.)
- Add provenance to each record: `app_mode` (packaged app vs dev vs test). **Verify at
  implementation which signal the sidecar actually has** (relay auth token presence, an env var
  the Electron main sets, or argv) — the audit did not confirm one exists; if none does, add one
  to the spawn args. Gate counts only app-mode sessions.
- `check_bake_gate.py`: ignore sessions `duration_s < 5` as noise regardless of origin.
- Archive the contaminated log to `audio-bake-log.pre-cleanup-2026-07-02.jsonl` and start fresh
  — the current data proves nothing either way.
- **Acceptance:** running the full backend suite adds ZERO lines to the real log (asserted by a
  test that snapshots the file); gate output distinguishes "no real usage yet" from "under 7 days".
- **User note:** after this lands, the 1-week bake clock genuinely starts on first real playback.

### F7a — P6.11-DEDUP-GAP: FieldProvider dead-source warning spams per-frame · P3 · effort S · depends: none
Confirmed OPEN (ledger audit 2026-07-02: `field_source.py` has zero dedup logic). Warn once per
dead source, not once per frame. Test: render 60 frames with one dead ref → exactly 1 log line.

### F7 — harden the #299 mirror-test gate-miss · P3 · effort S · depends: none
`granulator-payload-wiring.test.ts` reimplements App.tsx serialization instead of intercepting
the real `sendCommand`. Replace with a render-App.tsx + mock-IPC test asserting the actual
payload (the pattern the audit found missing). Sweep for other mirror-style payload tests while
in there (grep for tests constructing expected payloads from store state without rendering).

---

## Wave 3 — docs / ledger truth

### F8 — ledger reconciliation done right · P2 · effort S · docs-only PR
- ROADMAP.md: rewrite §1/§2/§4/§5/§6 so they no longer describe shipped work as future — either
  update statuses or collapse to a pointer at §0.2 (prefer collapse; per-tick snapshots at top
  proved to be the only part that stays true). Fix Gap G1 (Q7 verdict EXISTS —
  `~/.entropic/q7-report.json`, TIER_5_GO 2026-06-15, flag DEGRADES_UNDER_LOAD; remaining
  blocker = user greenlight only). Fix Gap G7 (bake: reframe per F6 — evidence contaminated,
  clock not started). Update G13 worktree count (45 post-prune).
- INDEX.md:28 "PR-A ❌" → ✅ (resolve the internal contradiction with line 66).
- EXECUTION-PLAN.md:477: **delete the false "MK.CU J1-J5 active in rule-9 rotation" claim** and
  mark MK.CU honestly: ❌ never run, satisfied by the 2026-07-02 UAT plan below.
- EXECUTION-PLAN merge-gate rider: campaign smoke-only gate RETIRED; standard gate = smoke +
  electron-e2e (+ sidecar path-applicable) from F3's merge onward.
- Add §0.3 snapshot: this audit's ground truth + link to this plan.
- Backlog pointer (explicitly OUT of this plan's scope, so it isn't silently dropped): PFX.2
  (3 invisible-at-defaults effects), MK.11/MK.12/MK.14, Phase 7/8/9, q7 stack (D1).

---

## Wave 4 — decisions & user-hands items (not fix packets)

- **D1 — Q7 greenlight.** Verdict is TIER_5_GO (real MLX run) but flagged `DEGRADES_UNDER_LOAD`.
  Options: (a) greenlight the 24 parked q7 drafts now; (b) first re-run the benchmark under
  concurrent render load to qualify the flag (~30-45 min, runbook exists); (c) keep parked.
  **Recommend (b) then (a)** — the flag is exactly the condition a live DAW hits.
- **D2 — VST universal binary.** `~/Desktop/PopChaos-VST3/` is arm64-only; the universal rebuild
  died mid-session Jun 16. Need: is the other Mac Intel or Apple Silicon? Intel → rebuild
  required (packet exists in session bc96f5dd's transcript); Apple Silicon → ship as-is.
- **D3 — stale local branches + stashes.** 24 squash-merged branches (hook blocks my `-D`) —
  one-liner available on request. 10 stashes (April-June) need a 5-minute triage: keep
  `preserve-before-cu-uat-relaunch` until UAT passes; the April `torn-edges`/`bug-6/13` ones are
  probably dead.
- **D4 — MK.CU / live UAT** = the companion UAT plan (`docs/UAT-PLAN-2026-07-02-live-cu.md`).

## Sequencing

```
F1 (P1-B) ──┬─→ full CU-UAT pass (companion plan)
F2 (persist)┤
F3 (e2e)    ┤   F4-F7 parallel anytime (no file overlap with F1-F3
F8 (docs)   ┘   except F5/zmq_server.py — serialize F5 after F1)
D1/D2/D3 — user, anytime
```
Single-flight: `zmq_server.py` = {F1, F5} — F1 first. `project-persistence.ts` = F2 only.
