# Effects-Quality Workstream — Audit + Improvement Packets

**Date:** 2026-06-11 · **App:** Creatrix (entropic-v2challenger) · **Scope:** the ~214-effect backend library (`backend/src/effects/fx/`)
**Signal:** user verdict **"moire sucks."** Per `user-profile.md:69`, *"kind of sucks" = complete rejection — don't iterate, rethink the approach.* Grid Moire shipped in PR [#123](https://github.com/nissimdirect/entropic-v2challenger/pull/123) as a grid overlay; the rework to true interference moiré + black-render fix + two independent liquify meshes is **open PR [#146](https://github.com/nissimdirect/entropic-v2challenger/pull/146)** (`feat/grid-moire-real`, base `main`, backend smoke 6267 passed). Key process lesson from the #146 body: **"Visual verify caught it; numeric tests missed it."** That sentence is the reason this workstream exists — 12K+ backend tests and 126 oracle validators prove effects *run*; nothing proves they *look good*.

---

## 1. Prior-feedback mining — every concrete complaint found

| # | Complaint | Source | Quality class |
|---|-----------|--------|---------------|
| C1 | **"moire sucks"** — Grid Moire v1 (#123) is a grid *overlay*, not interference; renders **near-black at high interference** (moire=gridA*gridB, frame mean ~0.06 vs fixed ~70). | Current session signal + PR #146 body | Authenticity + edge behavior (black frames) |
| C2 | **Datamosh is a simulation, not the real technique.** "Real datamosh = I-frame removal from compressed bitstream. Entropic's approach = optical flow simulation (calcOpticalFlowFarneback)." Meta-learning #4: *"Real-world techniques > simulations — when possible, implement the actual technique, not just a visual approximation."* A REAL H.264 NAL-splice engine was built (`core/real_datamosh.py`, v1-era). **2026-06-11 verification: it did NOT survive the v2 port** — v2's `fx.datamosh_real` (`fx/datamosh_real.py`) is a JPEG-byte-corruption *simulation* (verified docstring + imports, see PFX.4), and the inventory's `fx.real_datamosh` name is stale. | `memory/datamosh-learnings.md` (lines 10–22, 86–116, 138) + origin/main d821ae8 | Authenticity |
| C3 | **"Don't just modulate shit up and down. That sucks. That's not musical."** — anti-mechanical-modulation. Applies directly to effect built-in LFOs/oscillating params: naive triangle/sine sweeps read as mechanical and dead. | `memory/user-profile.md:42, :223` | Animation/temporal behavior |
| C4 | **"Audio concept ports mediocre"** — user correction during v2 ideation: uncritically porting audio-DSP concepts to video (flanger/phaser/comb family, 13 modulation effects) yields mediocre visuals. Also "video instrument naming weak." | `memory/learnings.md:1787` (session #104, 2026-02-19) | Authenticity + expressiveness |
| C5 | **"MIX broken"** (F-0516-5) — user *perceived* the mix param as broken; a 206-effect sweep (`/tmp/uat-mix-sweep.py`) proved 0 in-place mutation bugs. Verdict: not a bug, a **perception gap** — param effect too subtle to see = expressiveness failure even when numerically correct. | `memory/entropic-uat-may14.md:28` | Parameter expressiveness |
| C6 | **Util effects look like no-ops at default params** — F-0516-7 zero-default amber hint badge (open PR #103). Effects whose defaults produce no visible change read as broken. | `memory/entropic-uat-may14.md:25` | Parameter expressiveness + edge behavior |
| C7 | **Stateful effects look dead in single-frame preview** — "preview warmup" pattern (fake history for instant feedback) needed across all 58 stateful effects; physics uses iteration loops, datamosh synthetic displacement, feedback shifted frames. | `memory/learnings.md:663` | Animation/temporal behavior |
| C8 | **Hz-based oscillating params silently break seeded determinism** (same project renders differently at 24 vs 60 fps source). Fixed pattern: cycles-per-frame, not Hz. Any effect still carrying Hz-labeled frame-index LFOs is a latent quality+determinism bug. | `docs/solutions/2026-05-14-cpf-not-hz-for-oscillating-params.md` | Edge behavior + composability |
| C9 | **P0-1 `choices` vs `options` param-schema mismatch** — 3 effects shipped with the wrong key (params silently unusable from UI). Pattern class: schema drift makes params dead. | `memory/entropic.md` (UAT log, P0-1) | Parameter expressiveness (dead params) |
| C10 | **Parallel-built effects share systematic gaps** — 22 of 102 Phase-8 effect files missing `curve`/`unit` on 138 int params (learning #211). When 5 agents build 102 effects, quality defects are *correlated*, not random — a library-wide audit is the only way to find them. | `memory/learnings.md:222` (#211) | All axes (motivates full audit) |

Also relevant: there are **two moiré effects** — `fx.grid_moire` (codec_archaeology, the #123/#146 one) and an older `fx.moire` (`backend/src/effects/fx/moire.py`, category `misc`): two synthetic sine gratings blended over the frame via `mix`. It has the **same v1 disease C1 describes** — pattern *overlaid on* the image rather than *interfering with* image structure. It must be triaged in PFX.1 and is pre-filed as PFX.3.

---

## 2. Inventory + existing infrastructure (verified on disk 2026-06-11)

- **Effects:** `backend/src/effects/fx/` = 144 `.py` files on `origin/main`; registry (`backend/src/effects/registry.py`) auto-registers via `EFFECT_ID/EFFECT_NAME/EFFECT_CATEGORY/PARAMS/apply` module contract + variant aliases → **~214 registered** (ROADMAP.md ground truth; `docs/EFFECTS-INVENTORY.md` documents 189 as of Phase 8 — itself stale, a PFX.1 deliverable is updating it). Categories: physics(21) destruction(18) temporal(14) modulation(13) codec_archaeology(13) texture(11) tools(9) whimsy(8) color(8) sidechain(7) enhance(6) distortion(6) glitch(4) + R&D + 8 new spectral (A4/C4/A5, PRs #162/#165).
- **Oracle system:** `backend/tests/oracles/` = **126 `test_*_oracle.py` validators** + `conftest.py` providing: session-scoped ffmpeg-generated reference clips (`testsrc_2s_320x240_30fps.mp4`, `mandelbrot_2s_320x240_30fps.mp4`, `testsrc_with_audio_1s.mp4`, cached in `oracles/_cache/`), numeric metric helpers (`first_frame_bgr_mean`, `per_pixel_l1_distance`, `nth_frame_l1_distance`, `laplacian_variance`, `row_transitions`, `frame_diff_mean`), and `run_cli_apply()` — subprocess wrapper around `backend/src/cli.py apply INPUT --effect ID --params JSON -o OUT`.
- **Param sweep:** `backend/tests/test_parameter_sweep.py` sweeps every numeric/bool/choice param min→max over `_REGISTRY` and asserts *output changes*. It is numeric-only — it cannot catch C1 (black frames pass "output changed") or C5 (change too subtle to see).
- **Gap this workstream fills:** nothing renders effects for *human eyes* at scale. Oracle coverage 126/214 (≈59%) is also short of the library.

---

## 3. The 5-axis effect-quality rubric

Score each effect 0–2 per axis (0 = fail, 1 = acceptable, 2 = excellent). Max 10. **Canonical calibration example: Grid Moire** — v1 (#123) vs v2 (#146):

| Axis | Definition | Grid Moire v1 (#123) | Grid Moire v2 (#146) |
|------|------------|----------------------|----------------------|
| **(a) Authenticity** | Does it perform the *real technique* it names, or a cheap simulation/overlay? (C1, C2, C4) | 0 — grid overlay pretending to be moiré | 2 — real interference beat between two meshes |
| **(b) Parameter expressiveness** | Do params produce *visibly distinct* results across their range? No dead params (C9), no imperceptible defaults (C5, C6). | 0 — high interference → uniform black | 2 — per-mesh size/angle/rotate/scroll/liquify each visibly distinct |
| **(c) Animation/temporal behavior** | Alive vs static. Stateful effects must read as animated in preview (C7); motion must not be mechanical up-down sweeps (C3); frame-index LFOs in cycles-per-frame (C8). | 1 — static grid | 2 — animated turbulent liquify flow |
| **(d) Edge behavior** | Graceful at param extremes: no black/blank frames, no NaN/inf, no uniform output, deterministic, brightness preserved where the effect isn't *about* darkness. | 0 — near-black at extremes (mean ~0.06) | 2 — brightness-preserving blend (mean ~70), trust-boundary tests |
| **(e) Composability** | Plays well in chains/blends: respects alpha, doesn't clobber the frame so totally that downstream effects get nothing, mix param behaves, source-couples where sensible. | 1 — overlay composites but conveys nothing of source | 2 — source-coupled interference, mix-safe |

**Verdict bands:** 8–10 ship · 5–7 fix-list (param/anim polish) · 0–4 rework-or-cut (the "sucks" band — rethink, don't iterate).

---

## 4. Packets

Shared packet rules: all branches cut from `origin/main` unless stated; all work in a dedicated worktree (parallel sessions are active on this repo — see `feedback_going-parallel-convention.md`); **≤4h each**; every packet's acceptance gates include (1) oracle/backend tests green and (2) a before/after **visual artifact** committed to the PR description (not the repo).

---

### PFX.0 — Batch visual-render harness ("contact sheets")

- **ID:** PFX.0 · **branch:** `fx-quality/pfx0-contact-sheet-harness` · **base:** `origin/main` · **depends-on:** none
- **Model:** Sonnet
- **Goal:** one command renders **every registered effect** × {default params, per-param min, per-param max} against reference clips into tiled contact-sheet PNGs + short MP4 strips, so user + Fable can visually score all ~214 effects in one sitting. This is the tooling that would have caught C1 before ship.
- **OUTPUT, QUANTIFIED:**
  - **Render matrix:** N × M × K where N = `len(_REGISTRY)` (~214; assert ≥200), M = param points (1 defaults + 2 per numeric/bool/choice param at min/max, others held default — median ~4 params/effect → ~9 variants), K = clips. **Budget rule:** defaults render on all K=3 clips; per-param min/max render on the real-footage clip only → ≈ 214×3 + 214×8 ≈ **2,350 renders**; at 320×240/2s/30fps with 8 subprocess workers ≈ 30–60 min wall. `--quick` flag = defaults-only (~640 renders, <15 min).
  - **PNG naming convention (mandatory, machine-parseable):** per-variant frame strip `renders/<category>/<effect_id>__<param|defaults>__<min|max|default>__<clip>.png` (3 frames: 0/15/45 tiled horizontally); per-category sheet `sheet_<category>.png` (one row per variant, rows grouped by effect); plus `index.html` linking sheets + raw MP4s and `flags.json`.
  - **Auto-flag thresholds (exact):** **BLACK** = mean luma < 2 (0–255 scale) sustained across the sweep frames · **BLANK** = `laplacian_variance` < 5 · **NO-OP** = SSIM vs input > 0.995 (add an SSIM helper alongside the conftest metrics; `per_pixel_l1_distance` < 1.0 as corroborating signal) · **STATIC-WHEN-STATEFUL** = `frame_diff_mean` < 0.5 over 30 frames for effects with state · **CRASH** = nonzero subprocess exit · **TIMEOUT** = render > 120s (kill, continue). Flags emit to `flags.json`: `{effect_id, variant, clip, flag, metric, value, threshold}`.
  - These flags are rubric axes (b)/(c)/(d) as numbers — the human judges (a)/(e).
- **PRECONDITIONS (run all; any mismatch → STOP and report, do not improvise):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git worktree add ../creatrix-fx-quality -b fx-quality/pfx0-contact-sheet-harness origin/main
  cd ../creatrix-fx-quality
  python3 backend/src/cli.py list | head -5        # CLI alive, registry imports
  python3 -c "import sys; sys.path.insert(0,'backend/src'); from effects.registry import _REGISTRY; n=len(_REGISTRY); print(n); assert n>=200, 'registry shrank'"
  ls backend/tests/oracles/conftest.py backend/tests/test_parameter_sweep.py   # reuse targets exist
  ffmpeg -version | head -1
  ```
- **Scope (verified paths):** NEW `backend/scripts/contact_sheet.py` (`backend/scripts/` exists on origin/main — verified, holds `generate_oracles.py` etc.) · NEW `backend/tests/test_contact_sheet_harness.py` · output dir `~/Development/creatrix-fx-renders/<date>/` (gitignored; **never** `/tmp`).
- **DO-NOT-TOUCH:** `backend/src/effects/**` (zero effect changes in this packet) · `backend/src/engine/**` · `frontend/**` · existing tests · `.github/workflows/**`.
- **Steps:**
  1. Reference clips: reuse the oracle ffmpeg generators from `backend/tests/oracles/conftest.py` (`testsrc`, `mandelbrot` — generators verified there, metric helpers at conftest.py:100-211) and add one **real-footage** clip (high-motion, faces/texture — moiré and datamosh class effects are invisible on synthetic testsrc; C2's tutorials: "works much better with lots of movement"). 320×240, 2s, 30fps.
  2. Enumerate `_REGISTRY`; for each effect render via `run_cli_apply`-style subprocess (verified `conftest.py:211`; clean state, crash isolation): (i) defaults on all 3 clips, (ii) each numeric/bool/choice param at min and max (others default) on the real-footage clip — reuse `_sweep_cases()` logic (verified `test_parameter_sweep.py:18`). Parallelize with 8 workers.
  3. From each output: grab frames 0 / 15 / 45 → tile per the PNG naming convention above; emit per-category sheets + `index.html` (raw MP4s linked for axis-c animation judgment).
  4. Auto-flag pass: compute the exact thresholds from the OUTPUT block (BLACK <2 mean luma · BLANK var<5 · NO-OP SSIM>0.995 · STATIC frame_diff<0.5 · CRASH nonzero exit · TIMEOUT >120s) → `flags.json`.
  5. `--effect ID` filter flag (repeatable) for single-effect re-runs (used by every later packet for before/after artifacts) + `--quick` defaults-only mode.
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - NEW `backend/tests/test_contact_sheet_harness.py` (pure-function units, no ffmpeg): `test_black_frame_flagged_when_mean_luma_below_2` · `test_blank_flagged_when_laplacian_variance_below_5` · `test_noop_flagged_when_ssim_above_0995` · `test_static_stateful_flagged_when_frame_diff_below_05` · `test_tiler_emits_one_row_per_variant_with_3_frames` · `test_png_filenames_match_naming_convention`
  - **Negative test (harness survives a crashing effect):** `test_crashing_effect_marked_CRASHED_and_run_continues` — monkeypatch a registry entry whose `apply` raises → its row flagged CRASHED, remaining effects still render, harness exits 0. Companion: `test_timeout_effect_killed_and_flagged` (sleep-forever stub → TIMEOUT flag, run continues).
  - Integration: `python3 backend/scripts/contact_sheet.py --effect fx.grid_moire --effect fx.moire --effect fx.color_invert` → sheets exist; **grid_moire-v1-on-main auto-flagged BLACK at max interference** (known-bad fixture proves the flagger catches C1).
  - Command: `cd backend && python -m pytest tests/test_contact_sheet_harness.py -x --tb=short` then the smoke tier.
- **ACCEPTANCE GATES (quantified):** full-library run completes with **0 fatal aborts** (crashes isolated) · sheet rows ≥ `len(_REGISTRY)` minus explicitly skipped (skip list with reasons, ≤5) · known-bad detection: v1 grid_moire flagged BLACK · `flags.json` parses and every flag row carries metric+value+threshold · backend smoke green — the ONE pinned command: `cd backend && python -m pytest -m smoke -x --tb=short` (marker verified on origin/main at `backend/pyproject.toml:30`: "smoke: fast unit tests with no I/O, no ZMQ, no filesystem") · **visual artifact:** the codec_archaeology contact sheet itself attached to PR.
- **ROLLBACK:** `git worktree remove ../creatrix-fx-quality --force; git branch -D fx-quality/pfx0-contact-sheet-harness` — new files only, zero blast radius.
- **FAILURE MODES:** (a) one hung render stalls the whole run — per-render 120s timeout + kill is mandatory, tested · (b) SSIM on near-black pairs reads spuriously high — compute SSIM only when not already BLACK-flagged · (c) stateful effects misread as no-ops on frame 0 — flag on the 30-frame window, not frame 0 (C7) · (d) registry variants sharing a module double-render — dedupe by (module, mode) and note variant parentage in the row label.
- **EVIDENCE:** PR with harness + tests, run log (count rendered/flagged/crashed/timeout, wall time), one attached contact sheet, `flags.json` flag tally.
- **Effort:** ~4h.

---

### PFX.1 — Full-library triage session (score all ~214 against the rubric)

- **ID:** PFX.1 · **branch:** `fx-quality/pfx1-triage-scorecard` (docs/data only) · **base:** `origin/main` · **depends-on:** PFX.0 merged + one full harness run on disk
- **Model:** Fable (rubric scoring requires visual + calibration judgment; the rest of the workstream defaults to Sonnet)
- **Goal:** every effect scored 0–10 on the rubric → ranked fix-list. Primary artifact is a **machine-readable CSV**; the markdown scorecard is generated FROM it.
- **SCORECARD ARTIFACT STRUCTURE (exact):**
  - `docs/audits/effects-quality-scorecard-<date>.csv` — one row per registered effect, columns (in order): `effect_id` · `category` · `axis_a_authenticity` (0–2) · `axis_b_expressiveness` (0–2) · `axis_c_temporal` (0–2) · `axis_d_edge` (0–2) · `axis_e_composability` (0–2) · `total` (0–10, must equal the sum) · `band` (`ship` 8–10 / `fix` 5–7 / `rethink` 0–4) · `autoflags` (semicolon-joined PFX.0 flags, may be empty) · `complaint_refs` (semicolon-joined C1–C10, may be empty) · `diagnosis` (one line) · `fix_packet` (PFX id or empty).
  - `docs/audits/EFFECTS-QUALITY-SCORECARD-<date>.md` — human view generated from the CSV (per-category tables + tally line).
  - **The "sucks band":** every `rethink` row (0–4 — per `user-profile.md:69`, rethink, don't iterate) is copied into `docs/audits/rethink-list-<date>.md`, ordered by (category visibility × score deficit), each with a 3-line packet stub (what's wrong / proposed approach / effort guess). Top-10 stubs are also appended to this file as PFX.6+.
  - Refresh the effect count in the `docs/EFFECTS-INVENTORY.md` header (documents 189; registry is ~214 — stale, verified).
- **PRECONDITIONS:** `ls ~/Development/creatrix-fx-renders/<date>/index.html` (harness output exists; missing → STOP, run PFX.0 first) · `python3 -c "import json; json.load(open('<renders>/flags.json'))"` parses.
- **Scope (verified paths):** `docs/audits/` (new files) · `docs/EFFECTS-INVENTORY.md` (count/status columns only).
- **DO-NOT-TOUCH:** all source code. **This is a stock-take, not a fix session** (`feedback_stock-take-not-fix.md`): enumerate + queue only; fixes go to PFX.2+ packets.
- **Steps:** (1) seed axis-b/c/d scores from PFX.0 auto-flags (BLACK/BLANK at any param point caps axis-d at 0; NO-OP at defaults caps axis-b at 1; STATIC-WHEN-STATEFUL caps axis-c at 1); (2) Fable first-pass visual scoring from contact sheets, axes (a)+(e) judged per category with the rubric's Grid Moire calibration; (3) user pass on the bottom two bands only (~30–60 min of their time — contact sheets exist precisely so this is cheap); (4) per `feedback_no-yellows-binary-verdicts.md`: no partial statuses — each effect lands in exactly one band; (5) emit the rethink list + top-10 stubs.
- **TEST PLAN (named checks + exact commands — docs packet, validation is scripted):**
  - Row-count check: `python3 -c "import csv,sys; sys.path.insert(0,'backend/src'); from effects.registry import _REGISTRY; rows=list(csv.DictReader(open('docs/audits/effects-quality-scorecard-<date>.csv'))); assert len(rows)==len(_REGISTRY), (len(rows), len(_REGISTRY))"`
  - Consistency check (**the negative test — must FAIL on a deliberately corrupted row before the real run**): script asserts per row `total == a+b+c+d+e`, `band` matches `total` banding, every axis ∈ {0,1,2}; corrupt one row (`total=9, band=rethink`), run, confirm it throws, restore.
  - Complaint coverage: every C1–C10 maps to ≥1 row's `complaint_refs` or is explicitly closed in the PR body.
- **ACCEPTANCE GATES (quantified):** CSV rows == `len(_REGISTRY)` exactly · consistency script green (and demonstrated red on the corrupted fixture) · 10/10 complaints mapped or closed · rethink list ordered with effort estimates · top-10 packet stubs appended here · tally line present.
- **ROLLBACK:** revert the docs commit.
- **FAILURE MODES:** (a) scoring from sheets only and missing temporal life — axis-c judged from the MP4 strips, not stills · (b) variant aliases double-counted vs base effects — score the registry view (what users see), note parentage in `diagnosis` · (c) Fable leniency drift across 214 rows — re-score the first 10 effects after finishing as a calibration check; >1-point drift → second pass on that category.
- **EVIDENCE:** scorecard PR · tally line "X ship / Y fix / Z rethink of N total" · consistency-check output (green + the demonstrated red).
- **Effort:** ~3h Fable + ~1h user.

---

### PFX.2 — Grid Moire v2 FOLLOW-UPS ONLY (#146 merge owned by EXECUTION-PLAN P1.4)

- **ID:** PFX.2 · **branch:** `fx-quality/pfx2-grid-moire-followups` · **base:** `origin/main` · **depends-on:** **EXECUTION-PLAN P1.4 (#146 merged — P1.4 is the SOLE merge owner; this packet never merges #146; dep verified: `EXECUTION-PLAN.md:107` "P1.4 — Merge #146 Grid Moire v2"; #146 state OPEN as of 2026-06-11)**; PFX.0 helpful for the artifact but not required
- **Model:** Sonnet
- **Goal:** ship #146's declared follow-ups on top of the already-merged v2 (black-render fix, true interference, two independent liquify meshes): **transparency-overlay + freeze mode, explicit wrap toggle**, and an updated oracle that encodes the rubric (brightness-preservation is already in #146's +10 acceptance tests).
- **PRECONDITIONS (HARD GATE):**
  ```bash
  cd ~/Development/entropic-v2challenger
  test "$(gh pr view 146 --repo nissimdirect/entropic-v2challenger --json state --jq .state)" = "MERGED" || { echo "STOP: #146 not merged — P1.4 owns the merge; do not merge it from this packet"; exit 1; }
  git log origin/main --oneline -1   # record base SHA
  ```
- **Scope (verified paths):** `backend/src/effects/fx/grid_moire.py` · `backend/tests/oracles/test_grid_moire_oracle.py` (**exists on origin/main — verified** `git ls-tree -r origin/main backend/tests/oracles | grep grid_moire`; extend, don't create) · `backend/tests/test_parameter_sweep.py` exemptions already in #146.
- **DO-NOT-TOUCH:** `fx/moire.py` (that's PFX.3) · registry mechanics · any other effect · frontend.
- **Steps:** (1) cut follow-up branch from post-#146 main; add `overlay_mode` (interference replaces vs composites over source) + `freeze` (halt scroll/liquify phase) + explicit `wrap` toggle; (2) extend the oracle with the named tests below.
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - Extend `backend/tests/oracles/test_grid_moire_oracle.py`: `test_brightness_preserved_across_full_param_grid` (the C1 bug-catcher: mean luma within ±30% of input at EVERY param-grid point) · `test_visible_beat_fft_peak_at_difference_frequency` (FFT of output luma shows a peak at |f1−f2|, not just "output changed") · `test_no_nan_or_inf_at_param_extremes` · `test_two_seeded_runs_byte_identical` (determinism) · `test_freeze_mode_halts_phase_advance` (frame 10 == frame 40 when `freeze=true`) · `test_overlay_mode_composites_while_replace_mode_does_not`
  - **Negative test (the oracle must catch the disease, not just bless the cure):** `test_oracle_rejects_synthetic_black_output` — feed the brightness assertion a synthetic near-black render (mean ~0.06, the v1 signature) and assert it FAILS; proves the validator would have caught #123.
  - Full-chain integration: `python3 backend/src/cli.py apply <real-clip> --effect fx.grid_moire --params '{"freeze":true}' -o /tmp-equiv/out.mp4` via `run_cli_apply` (CLI → registry → effect → encode) + chain test: grid_moire → a color effect downstream still receives usable luma range (axis e).
  - Commands: `cd backend && python -m pytest tests/oracles/test_grid_moire_oracle.py -x --tb=short` · param sweep green with documented exemptions · PFX.0 single-effect run (`--effect fx.grid_moire`): **0 auto-flags at any param extreme**.
- **ACCEPTANCE GATES (quantified):** all 6 named oracle tests + 1 negative green · PFX.0 run flags = 0 across the full param grid · **before/after visual artifact** (v1-on-#123-parent vs v2 contact-sheet rows, gray frame + real clip) in PR body · backend smoke green · rubric self-score ≥8 (all five axes scored, ≥1 each) recorded in the scorecard CSV.
- **ROLLBACK:** follow-ups are one revert.
- **FAILURE MODES:** (a) FFT beat assertion flaky on real footage — run it on the synthetic gray-frame clip where the difference frequency is analytically known · (b) `freeze` interacting with seeded determinism (frozen phase must not consume RNG draws — C8-adjacent) · (c) `wrap` toggle changing edge pixels and tripping existing #146 acceptance tests — run those first.
- **EVIDENCE:** the precondition's MERGED output, follow-up PR link, artifact images, the 7 test names with pass output.
- **Effort:** ~3h.

---

### PFX.3 — `fx.moire`: same disease, same cure (sine-grating overlay → image-coupled interference)

- **ID:** PFX.3 · **branch:** `fx-quality/pfx3-moire-image-coupled` · **base:** `origin/main` (after PFX.2 merge) · **depends-on:** PFX.2 (reuses its interference + brightness-preservation patterns)
- **Model:** Sonnet
- **Goal:** `backend/src/effects/fx/moire.py` (category `misc`, params `freq_1`/`freq_2`/`angle`/`mix` — all four verified on origin/main) currently blends two *synthetic* sine gratings over the frame — an overlay, exactly C1's failure mode in different clothes. Rework: derive one grating from **image structure** (luma-quantized bands or edge-field phase) so the beat pattern responds to content; keep the four params but make each visibly distinct across range; decide overlap story vs grid_moire (sine-interference vs mesh-interference — document the distinction in EFFECTS-INVENTORY or merge one into the other as a variant; merging uses the variant-alias machinery at **`registry.py:67-68` (`_register_variant`)** — verified; the previously-cited "line 43" was wrong).
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  grep -n "EFFECT_CATEGORY" backend/src/effects/fx/moire.py    # expect "misc" (verified d821ae8); different → re-read file before editing
  ls backend/tests/oracles/ | grep -c moire                    # expect 2: test_moire_oracle.py + test_grid_moire_oracle.py (verified d821ae8)
  git log origin/main --oneline -- backend/src/effects/fx/moire.py | head -3   # nobody else mid-flight on it; recent foreign commits → STOP, check parallel sessions
  ```
- **Scope (verified paths):** `backend/src/effects/fx/moire.py` · **update** `backend/tests/oracles/test_moire_oracle.py` (exists on origin/main — verified) · `docs/EFFECTS-INVENTORY.md` row.
- **DO-NOT-TOUCH:** `grid_moire.py` · registry beyond an alias if merging · all other effects.
- **Steps:** prototype image-coupled grating (≤1h spike, judge via PFX.0 single-effect run before committing to it — "sucks" band means rethink, not polish) → implement → brightness-preserving blend per #146's pattern → oracle update → before/after artifact.
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - Update `test_moire_oracle.py`: `test_beat_pattern_correlates_with_image_structure` (**the authenticity assertion**: spatial correlation between the beat field and input edge map > threshold — an overlay scores ~0) · `test_brightness_preserved_across_param_grid` · `test_each_param_visibly_distinct` (pairwise L1 between freq_1-min/max, freq_2-min/max, angle-min/max, mix-min/max renders all > visibility threshold — no dead params, C9 class) · `test_two_seeded_runs_byte_identical`
  - **Negative test:** `test_flat_gray_input_does_not_black_out` — on a structureless input the image-coupled grating has nothing to couple to; output must stay brightness-safe and NaN-free (the degenerate-input edge), and `test_beat_pattern_correlates_with_image_structure` must FAIL when pointed at a captured v1-style synthetic-overlay render (proves the assertion discriminates).
  - Full-chain integration: `run_cli_apply` render on the real-footage clip → moire → color effect downstream still receives usable luma range (axis e chain test).
  - Commands: `cd backend && python -m pytest tests/oracles/test_moire_oracle.py -x --tb=short` · param sweep green · PFX.0 run (`--effect fx.moire`): 0 BLACK/BLANK/NO-OP flags across the param grid.
- **ACCEPTANCE GATES (quantified):** 4 named oracle tests + 2 negatives green · PFX.0 flags = 0 · before/after contact-sheet rows in PR · rubric self-score ≥8 in the scorecard CSV · backend smoke green · EFFECTS-INVENTORY documents the moire-vs-grid_moire distinction (or the merge + alias).
- **ROLLBACK:** single-file revert (plus alias removal if added).
- **FAILURE MODES:** (a) edge-coupling makes output frame-rate sensitive on noisy footage — derive the grating from a blurred luma field, assert determinism · (b) correlation threshold tuned on testsrc passes trivially — tune on the real-footage clip · (c) alias merge silently changes existing project files referencing `fx.moire` — alias must preserve the old id (that's what `_register_variant` is for).
- **EVIDENCE:** PR link, artifact, scorecard delta row, the 6 test names with pass output.
- **Effort:** ~4h.

---

### PFX.4 — Datamosh authenticity audit (real technique vs optical-flow simulation)

- **ID:** PFX.4 · **branch:** `fx-quality/pfx4-datamosh-authenticity` · **base:** `origin/main` · **depends-on:** PFX.0 (artifacts); independent of PFX.2/3
- **Model:** Sonnet
- **AUDIT PRE-RESOLVED (verified on origin/main d821ae8, 2026-06-11) — the file-level verdict is already in:**
  - The effect is **`backend/src/effects/fx/datamosh_real.py`**, `EFFECT_ID = "fx.datamosh_real"` (NOT `fx.real_datamosh` — `git grep -ln real_datamosh origin/main` hits ONLY the stale `docs/EFFECTS-INVENTORY.md`).
  - Its docstring, line 1: *"Datamosh Real — JPEG byte corruption simulating P-frame artifacts."* 96 lines; imports are `io`/`numpy`/`PIL.Image`/`make_rng` — **no subprocess, no ffmpeg, no H.264, no NAL units**. Params: `intensity` (JPEG quality degradation), `corruption` (fraction of encoded bytes corrupted).
  - **Verdict: `fx.datamosh_real` is a THIRD simulation** (JPEG-recompression corruption), distinct from both the optical-flow simulation (`fx/datamosh.py` — `calcOpticalFlow` verified there and in `fx/flow_distort.py`) and v1's real H.264 NAL-splice engine (`core/real_datamosh.py`). The name is a C2 authenticity violation: it says "real," it isn't.
- **Goal:** resolve C2 for v2/Creatrix — path **(b)** from the original spec, now confirmed: port the v1 NAL-splice engine behind the existing effect contract, with the audit verdict above recorded first. Deliverables: (1) verdict table committed to `docs/EFFECTS-INVENTORY.md` (per mosh-family effect: technique, real/simulated, evidence line) + fix the stale `fx.real_datamosh` name there; (2) v1-engine recoverability check (Gate 19 six-ref discipline); (3) the port itself **if it fits the remaining budget** — if reading shows it exceeds ~2h, this packet ships the verdict + a sized follow-up packet spec instead (scope is capped at 4h); (4) interim honesty fix either way: rename/relabel `Datamosh Real` → `Datamosh (JPEG Crush)` via the variant-alias machinery (`registry.py:67-68`) so the UI stops claiming authenticity it doesn't have.
- **PRECONDITIONS (re-confirm the pre-resolved audit; mismatch → the audit is stale, redo it):**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  git show origin/main:backend/src/effects/fx/datamosh_real.py | head -1   # expect the "JPEG byte corruption" docstring
  git grep -ln "real_datamosh" origin/main | head                          # expect ONLY docs/EFFECTS-INVENTORY.md
  git grep -ln "calcOpticalFlow\|optical_flow" origin/main -- backend/src/effects/fx/ # expect datamosh.py + flow_distort.py
  ls backend/tests/oracles/ | grep -i datamosh                             # note existing oracle coverage
  # v1 engine recoverable? (Gate 19 discipline — check refs before assuming gone)
  find ~/Development -maxdepth 3 -name "real_datamosh.py" 2>/dev/null | head
  ```
- **Scope (verified paths):** `backend/src/effects/fx/datamosh_real.py` · `backend/src/effects/fx/datamosh.py` (verdict row only, no code) · new `backend/src/effects/fx/` file for the NAL-splice port (if it lands) · their oracles · `docs/EFFECTS-INVENTORY.md` authenticity column + name fix.
- **DO-NOT-TOUCH:** engine render pipeline · ffmpeg invocation layers used by other effects · `frequency_mosh.py`/`reaction_mosh.py` (different techniques, verdict rows only) · frontend.
- **Steps:** confirm preconditions → commit the verdict table → Gate 19 sweep for `core/real_datamosh.py` in v1 refs (`git log --all`, stash, reflog, worktrees, sibling dirs) → 1h timeboxed read of the v1 engine → port-or-repacket decision → if porting: wrap NAL splice behind the pure-function contract (`(frame, params, state_in) -> (result, state_out)` is frame-based; bitstream splice is clip-based — the port likely lands as a clip-level tool/export-stage effect; document the contract decision) → oracle with the authentic-signature tests below → high-motion footage artifact (synthetic testsrc hides mosh quality — C2: "motion is king").
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - NEW/extended datamosh oracle: `test_freeze_through_pixels_persist_across_removed_iframe_boundary` (**the authentic signature** — pixels without new color data persist, not just "output differs") · `test_jpeg_crush_variant_remains_deterministic_under_seed` (existing effect, C8 check while in there) · `test_mosh_output_differs_between_low_and_high_motion_clips` (motion-dependence is the point of real moshing)
  - **Negative test:** `test_input_with_no_iframes_degrades_gracefully` — an all-P-frame (or single-I) input gives the splice nothing to remove; effect must not crash, must emit a usable frame, and must flag/no-op cleanly. Companion negative: the freeze-through assertion must FAIL when run against the JPEG-crush simulation's output (proves the signature test discriminates real from simulated).
  - Full-chain integration: `run_cli_apply` end-to-end on the high-motion clip (CLI → registry → effect → encode), then PFX.0 single-effect run: flags clean.
  - Commands: `cd backend && python -m pytest tests/oracles/ -k datamosh -x --tb=short` · `cd backend && python -m pytest -m smoke -x --tb=short`.
- **ACCEPTANCE GATES (quantified):** verdict table in EFFECTS-INVENTORY covers all 4 mosh-family files (datamosh, datamosh_real, frequency_mosh, reaction_mosh) with evidence lines · the stale `fx.real_datamosh` name is gone from docs · 3 named oracle tests + 2 negatives green (or, on the re-packet path: verdict + rename shipped, follow-up packet spec written with effort estimate) · simulated-vs-real side-by-side visual artifact on the high-motion clip · backend smoke green.
- **ROLLBACK:** per-file revert; verdict-only outcome has zero code risk; the rename alias reverts cleanly.
- **FAILURE MODES:** (a) the frame-based effect contract can't express clip-level bitstream splicing — that's the #1 port risk; the contract decision is an explicit step, not an assumption · (b) v1 engine unrecoverable → Gate 19 evidence quoted, packet pivots to verdict+rename+repacket (still a complete deliverable) · (c) PyAV/ffmpeg version drift breaks NAL parsing assumptions from v1-era code — pin the read to the version on origin/main · (d) renaming the UI label without an alias breaks saved projects — alias machinery is mandatory.
- **EVIDENCE:** verdict table, PR link, artifact, EFFECTS-INVENTORY diff, Gate 19 sweep output.
- **Effort:** audit+verdict ~1h (mostly pre-done above) · port ≤2h or re-packet · rename ~0.5h. Cap 4h.

---

### PFX.5 — Modulation-family liveliness pass (anti-mechanical sweep, C3/C4/C7/C8)

- **ID:** PFX.5 · **branch:** `fx-quality/pfx5-modulation-liveliness` · **base:** `origin/main` · **depends-on:** PFX.1 (scorecard tells us *which* of the 13 modulation + 14 temporal effects are in the bottom bands — do those first; this packet covers the top 5 offenders, ≤4h)
- **Model:** Sonnet
- **Goal:** the modulation family is the locus of two prior complaints: C4 ("audio concept ports mediocre") and C3 ("don't just modulate shit up and down — that's not musical"). For the 5 worst-scoring modulation/temporal effects: replace bare up-down LFO sweeps with shaped motion (eased/turbulent/sample-and-hold-jittered phase — the #146 liquify "turbulent domain-warp flow" is the house pattern), ensure all oscillating params are **cycles-per-frame not Hz** (C8, grep `hz\|Hz` in PARAMS labels/units), and add preview-warmup state hints where the effect reads as static on frame 0 (C7).
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger
  test -f docs/audits/effects-quality-scorecard-*.csv || { echo "STOP: run PFX.1 first"; }
  grep -rln '"unit": "Hz"\|"unit": "hz"' backend/src/effects/fx/ | head -12
  # ^ NOT empty — verified d821ae8, exactly 9 files: am_radio, dsp_flange, dsp_phaser,
  #   feedback_phaser, resonant_paulstretch, ring_mod, sidechain_interference, tremolo, wave_distort.
  #   More/fewer files → re-baseline the C8 audit list in the PR before editing.
  ```
- **Scope (verified paths):** ≤5 effect files named by the scorecard (quote exact list in PR before editing) · **the 9 Hz-unit files above for the C8 classification pass** (audit all 9; code-change only those that are genuinely time-based) · their oracles · param-sweep exemptions if needed.
- **DO-NOT-TOUCH:** any effect not on the named-5 list (C8 relabel-only diffs exempted — a `"unit"` string change is not a behavior change) · determinism contract (`engine/determinism.py` `make_rng`) — consume it, never modify it.
- **Steps:** (1) **C8 classification of all 9 Hz files:** for each, does the Hz param drive a frame-index phase accumulator (→ CONVERT to cycles-per-frame, behavior-preserving at 30fps) or a purely spatial frequency mislabeled as Hz (→ RELABEL the unit string only)? Table with one row each: file, param, classification, action. (2) Per worst-5 effect: PFX.0 before-strip → motion reshape (replace bare up-down LFO with the #146 turbulent-domain-warp house pattern / eased / sample-and-hold-jittered phase) → cpf conversion → warmup hint (C7) → PFX.0 after-strip → oracle update.
- **TEST PLAN (named tests + behavior-keyword titles + exact commands):**
  - Per touched effect, oracle gains: `test_motion_alive_frame_diff_above_threshold_over_30_frames` (axis-c "alive" assertion: `frame_diff_mean` > 0.5 across a 30-frame window) · `test_phase_identical_at_24fps_and_60fps_metadata` (**the C8 regression guard**: same seed + same frame index → byte-identical output regardless of source fps) · `test_warmup_makes_frame0_differ_from_input` (C7: stateful effect reads as active in single-frame preview)
  - **Negative test:** `test_oscillation_is_not_a_bare_triangle_sweep` — autocorrelation of the param-driven motion signal must NOT show a single dominant fixed period with zero phase jitter (the C3 "mechanical up-down" signature); assert the shaped motion breaks pure periodicity. Run it against the BEFORE build and confirm it FAILS there (proves the assertion detects the disease).
  - Full-chain integration: each of the 5 rendered end-to-end via `run_cli_apply` on the real-footage clip; PFX.0 single-effect runs clean.
  - Commands: `cd backend && python -m pytest tests/oracles/ -k "<effect>" -x --tb=short` per effect · param sweep green · `cd backend && python -m pytest -m smoke -x --tb=short`.
- **ACCEPTANCE GATES (quantified):** 9/9 Hz files classified in the table (convert/relabel/keep-with-justification — zero unexamined) · zero Hz-labeled *frame-index* LFO params remain library-wide (grep output quoted) · 3 named tests × 5 effects + 1 negative green · 5 before/after MP4 strips in PR · backend smoke green · scorecard rows re-scored, each **+2 or better on axis (c)** (e.g. 0→2 or 1→2 with another axis up).
- **ROLLBACK:** per-effect revert commits (one commit per effect, mandated).
- **FAILURE MODES:** (a) cpf conversion silently changes existing projects' look at 30fps — conversion must be value-equivalent at 30fps (the C8 solution doc's pattern); assert with a before/after render diff · (b) "shaped" motion that's just a different fixed waveform fails C3 in spirit — the autocorrelation negative is the check · (c) warmup hints leaking state between clips — state_in/state_out contract respected, chaos-test two clips in sequence · (d) relabel-only files accidentally getting behavior edits — diff review: those 4-ish files must show string-only changes.
- **EVIDENCE:** PR link, the 9-row classification table, 5 strips, grep proof, scorecard deltas.
- **Effort:** ~4h (classification 1h, 5 effects ~35min each).

---

## 5. Sequencing & cost

```
PFX.0 harness (4h) ──► PFX.1 triage (3h Fable + ~1h user) ──► PFX.5 modulation top-5 (4h) ──► [top-10 stubs from PFX.1]
[P1.4 merges #146] ──► PFX.2 grid-moire follow-ups (3h) ──► PFX.3 fx.moire rework (4h)   [independent track, gated on P1.4]
PFX.4 datamosh authenticity (audit 2h, fix ≤2h or re-packet)                  [independent track]
```

**Total committed: ~20h** across 6 packets. The flywheel after PFX.1: every future effect PR attaches its PFX.0 single-effect contact strip as a mandatory artifact — making "visual verify caught it; numeric tests missed it" a gate instead of a postmortem.

---

## Packet thickness scorecard (pass of 2026-06-11, anchors @ `origin/main` d821ae8)

Rubric: (1) anchors git-verified · (2) full 11-field contract + model tier · (3) named tests, behavior-keyword titles, exact commands · (4) gates quantified · (5) failure modes + ≥1 negative test · (6) full-chain integration · (7) depends-on resolves.

| Packet | 1 Anchors | 2 Contract | 3 Tests | 4 Gates | 5 Neg/fail | 6 Integration | 7 Deps | Notes |
|---|---|---|---|---|---|---|---|---|
| PFX.0 | ✅ (registry 144 files, conftest helpers :100-211, `_sweep_cases` :18, pyproject:30, `backend/scripts/` exists) | ✅ (+Effort added) | ✅ 8 named tests + integration cmd | ✅ (~2,350 renders, 6 exact thresholds, 0 fatal aborts) | ✅ crash-isolation + timeout negatives | ✅ subprocess CLI→registry→encode per render | ✅ none | Thresholds per spec: BLACK <2/255 luma, NO-OP SSIM>0.995, CRASH nonzero exit |
| PFX.1 | ✅ (oracle count 126, inventory-189-vs-214 staleness confirmed) | ✅ | ✅ scripted row-count + consistency checks, exact one-liners | ✅ (rows==len(_REGISTRY), 10/10 complaints, axis-cap seeding rules) | ✅ corrupted-row must-fail check | ✅ flags.json→CSV→rethink-list chain | ✅ PFX.0 | 13-column CSV schema fixed; "sucks band" 0–4 → rethink-list artifact |
| PFX.2 | ✅ (`test_grid_moire_oracle.py` EXISTS — "create if missing" removed; P1.4 at EXECUTION-PLAN.md:107; #146 OPEN) | ✅ (+Effort) | ✅ 7 named tests incl. FFT beat + freeze | ✅ (6+1 tests, 0 PFX.0 flags, self-score ≥8) | ✅ oracle-rejects-synthetic-black negative | ✅ run_cli_apply + downstream-chain test | ✅ P1.4 hard gate (state-checked) | |
| PFX.3 | ✅ (params freq_1/2/angle/mix verified; category misc; **alias machinery corrected line 43 → registry.py:67-68**; moire oracle count = 2) | ✅ (+Effort) | ✅ 6 named tests incl. structure-correlation | ✅ (4+2 tests, 0 flags, ≥8 self-score) | ✅ flat-gray degenerate + v1-overlay-must-fail negatives | ✅ run_cli_apply + chain luma test | ✅ PFX.2 | |
| PFX.4 | ✅ (**audit pre-resolved**: `datamosh_real.py` docstring/imports verified = JPEG-crush simulation; `fx.real_datamosh` only in stale inventory; optical-flow map verified) | ✅ (+Effort) | ✅ 5 named tests incl. authentic-signature | ✅ (4-file verdict table, 3+2 tests, capped budget) | ✅ no-iframe-input + signature-discriminates negatives | ✅ run_cli_apply on high-motion clip | ✅ PFX.0 | Path (b) confirmed; frame-vs-clip contract risk named as explicit step |
| PFX.5 | ✅ (**Hz grep verified NON-empty: exactly 9 files, named**) | ✅ (+Effort) | ✅ 3 tests × 5 effects + autocorrelation check | ✅ (9/9 classified, +2 axis-c per row, 5 strips) | ✅ mechanical-sweep-detector must fail on BEFORE build | ✅ run_cli_apply ×5 + PFX.0 runs | ✅ PFX.1 | Precondition's "empty = good" was wrong — corrected to expected-9 baseline |

**Known unfixables / external blockers:** (a) `docs/EFFECTS-INVENTORY.md` stale claims (`fx.real_datamosh` name, 189 count) live in the app repo — fixed BY PFX.1/PFX.4, not by this docs pass; (b) PR #146 is still OPEN — PFX.2/PFX.3 remain gated on EXECUTION-PLAN P1.4 by design; (c) exact registered-effect count (~214) is runtime-derived (file count 144 + variant aliases) — packets assert `len(_REGISTRY) ≥ 200` at run time rather than pinning a number.
