# Effects-Quality Workstream — Audit + Improvement Packets

**Date:** 2026-06-11 · **App:** Creatrix (entropic-v2challenger) · **Scope:** the ~214-effect backend library (`backend/src/effects/fx/`)
**Signal:** user verdict **"moire sucks."** Per `user-profile.md:69`, *"kind of sucks" = complete rejection — don't iterate, rethink the approach.* Grid Moire shipped in PR [#123](https://github.com/nissimdirect/entropic-v2challenger/pull/123) as a grid overlay; the rework to true interference moiré + black-render fix + two independent liquify meshes is **open PR [#146](https://github.com/nissimdirect/entropic-v2challenger/pull/146)** (`feat/grid-moire-real`, base `main`, backend smoke 6267 passed). Key process lesson from the #146 body: **"Visual verify caught it; numeric tests missed it."** That sentence is the reason this workstream exists — 12K+ backend tests and 126 oracle validators prove effects *run*; nothing proves they *look good*.

---

## 1. Prior-feedback mining — every concrete complaint found

| # | Complaint | Source | Quality class |
|---|-----------|--------|---------------|
| C1 | **"moire sucks"** — Grid Moire v1 (#123) is a grid *overlay*, not interference; renders **near-black at high interference** (moire=gridA*gridB, frame mean ~0.06 vs fixed ~70). | Current session signal + PR #146 body | Authenticity + edge behavior (black frames) |
| C2 | **Datamosh is a simulation, not the real technique.** "Real datamosh = I-frame removal from compressed bitstream. Entropic's approach = optical flow simulation (calcOpticalFlowFarneback)." Meta-learning #4: *"Real-world techniques > simulations — when possible, implement the actual technique, not just a visual approximation."* A REAL H.264 NAL-splice engine was built (`core/real_datamosh.py`, v1-era) — verify it survived the v2 port (`fx.real_datamosh` is in the inventory; confirm it is bitstream-real, not a second simulation). | `memory/datamosh-learnings.md` (lines 10–22, 86–116, 138) | Authenticity |
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
- **Goal:** one command renders **every registered effect** × {default params, per-param min, per-param max} against 2–3 reference clips into tiled contact-sheet PNGs + short MP4 strips, so user + Fable can visually score all ~214 effects in one sitting. This is the tooling that would have caught C1 before ship.
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
- **Scope (verified paths):** NEW `backend/scripts/contact_sheet.py` (+ `backend/scripts/__init__.py` if missing) · NEW `backend/tests/test_contact_sheet_harness.py` · output dir `~/Development/creatrix-fx-renders/<date>/` (gitignored; **never** `/tmp`).
- **DO-NOT-TOUCH:** `backend/src/effects/**` (zero effect changes in this packet) · `backend/src/engine/**` · `frontend/**` · existing tests · `.github/workflows/**`.
- **Steps:**
  1. Reference clips: reuse the oracle ffmpeg generators from `backend/tests/oracles/conftest.py` (`testsrc`, `mandelbrot`) and add one **real-footage** clip (high-motion, faces/texture — moiré and datamosh class effects are invisible on synthetic testsrc; C2's tutorials: "works much better with lots of movement"). 320×240, 2s, 30fps to keep the full run under ~30 min.
  2. Enumerate `_REGISTRY`; for each effect render via `run_cli_apply`-style subprocess (clean state, crash isolation): (i) defaults, (ii) each numeric/bool/choice param at min and max with others default — reuse `_sweep_cases()` logic from `test_parameter_sweep.py`.
  3. From each output: grab frames 0 / 15 / 45 → tile into one PNG row per variant; group rows per effect; emit one contact sheet per category + an `index.html` linking sheets and the raw MP4s (for axis-c animation judgment).
  4. Auto-flag column: compute `first_frame_bgr_mean`, `laplacian_variance`, `frame_diff_mean`, NaN check, and L1-vs-input per render; flag **black (mean<10), blank (var<5), no-op (L1<1.0), static-when-stateful (frame_diff≈0), crashed, timeout**. These are rubric axes (b)/(c)/(d) as numbers — the human judges (a)/(e).
  5. `--effect ID` filter flag for single-effect re-runs (used by every later packet for before/after artifacts).
- **TEST PLAN:** unit-test the tiler + flag thresholds on synthetic frames (pure functions, no ffmpeg); integration: run harness with `--effect fx.grid_moire --effect fx.moire --effect fx.color_invert` and assert sheets exist, grid_moire-v1-on-main gets auto-flagged dark at max interference (known-bad fixture proves the flagger works); chaos: effect that raises → row marked CRASHED, run continues.
- **ACCEPTANCE GATES:** full-library run completes (crashes isolated, not fatal) · contact sheets exist for ≥ registry count minus explicitly skipped (list skips with reasons) · known-bad detection: v1 grid_moire flagged · backend smoke green — the ONE pinned command: `cd backend && python -m pytest -m smoke -x --tb=short` (marker verified on origin/main at `backend/pyproject.toml:30`: "smoke: fast unit tests with no I/O, no ZMQ, no filesystem") · **visual artifact:** the codec_archaeology contact sheet itself attached to PR.
- **ROLLBACK:** `git worktree remove ../creatrix-fx-quality --force; git branch -D fx-quality/pfx0-contact-sheet-harness` — new files only, zero blast radius.
- **EVIDENCE:** PR with harness + tests, run log (count rendered/flagged/crashed, wall time), one attached contact sheet, list of auto-flagged effects.

---

### PFX.1 — Full-library triage session (score all ~214 against the rubric)

- **ID:** PFX.1 · **branch:** `fx-quality/pfx1-triage-scorecard` (docs/data only) · **base:** `origin/main` · **depends-on:** PFX.0 merged + one full harness run on disk
- **Model:** Fable (rubric scoring requires visual + calibration judgment; the rest of the workstream defaults to Sonnet)
- **Goal:** every effect scored 0–10 on the rubric → ranked fix-list. Output: `docs/audits/EFFECTS-QUALITY-SCORECARD-<date>.md` (one row per effect: 5 axis scores, verdict band, one-line diagnosis, complaint cross-refs C1–C10) + refreshed effect count in `docs/EFFECTS-INVENTORY.md` header.
- **PRECONDITIONS:** `ls ~/Development/creatrix-fx-renders/<date>/index.html` (harness output exists; missing → STOP, run PFX.0 first) · auto-flag JSON from PFX.0 parses.
- **Scope (verified paths):** `docs/audits/` (new file) · `docs/EFFECTS-INVENTORY.md` (count/status columns only).
- **DO-NOT-TOUCH:** all source code. **This is a stock-take, not a fix session** (`feedback_stock-take-not-fix.md`): enumerate + queue only; fixes go to PFX.2+ packets.
- **Steps:** (1) seed axis-b/c/d scores from PFX.0 auto-flags; (2) Fable first-pass visual scoring from contact sheets, axes (a)+(e) judged per category with the rubric's Grid Moire calibration; (3) user pass on the bottom two bands only (~30–60 min of their time — contact sheets exist precisely so this is cheap); (4) per `feedback_no-yellows-binary-verdicts.md`: no partial statuses — each effect lands in exactly one band; (5) emit ranked fix-list: rework-or-cut band first, ordered by (category visibility × score deficit); write one improvement packet stub per top-10 item, appended to this file.
- **TEST PLAN:** N/A (docs) — but scorecard must cover `len(_REGISTRY)` rows exactly; CI-side `grep -c` row count vs registry count quoted in EVIDENCE.
- **ACCEPTANCE GATES:** scorecard rows == registry count · every C1–C10 complaint mapped to ≥1 scored effect or explicitly closed · ranked fix-list with effort estimates · top-10 packet stubs appended here.
- **ROLLBACK:** revert the docs commit.
- **EVIDENCE:** scorecard PR; tally line "X ship / Y fix-list / Z rework-or-cut of N total".

---

### PFX.2 — Grid Moire v2 FOLLOW-UPS ONLY (#146 merge owned by EXECUTION-PLAN P1.4)

- **ID:** PFX.2 · **branch:** `fx-quality/pfx2-grid-moire-followups` · **base:** `origin/main` · **depends-on:** **EXECUTION-PLAN P1.4 (#146 merged — P1.4 is the SOLE merge owner; this packet never merges #146)**; PFX.0 helpful for the artifact but not required
- **Model:** Sonnet
- **Goal:** ship #146's declared follow-ups on top of the already-merged v2 (black-render fix, true interference, two independent liquify meshes): **transparency-overlay + freeze mode, explicit wrap toggle**, and an updated oracle that encodes the rubric (brightness-preservation is already in #146's +10 acceptance tests).
- **PRECONDITIONS (HARD GATE):**
  ```bash
  cd ~/Development/entropic-v2challenger
  test "$(gh pr view 146 --repo nissimdirect/entropic-v2challenger --json state --jq .state)" = "MERGED" || { echo "STOP: #146 not merged — P1.4 owns the merge; do not merge it from this packet"; exit 1; }
  git log origin/main --oneline -1   # record base SHA
  ```
- **Scope (verified paths):** `backend/src/effects/fx/grid_moire.py` · `backend/tests/oracles/test_grid_moire_oracle.py` (exists? if not, create — verify with `ls backend/tests/oracles/ | grep grid_moire`) · `backend/tests/test_parameter_sweep.py` exemptions already in #146.
- **DO-NOT-TOUCH:** `fx/moire.py` (that's PFX.3) · registry mechanics · any other effect · frontend.
- **Steps:** (1) cut follow-up branch from post-#146 main; add `overlay_mode` (interference replaces vs composites over source) + `freeze` (halt scroll/liquify phase) + explicit `wrap` toggle; (2) extend oracle: brightness-preservation across full param grid (the C1 bug-catcher), visible-beat assertion (FFT peak at difference frequency, not just "output changed"), determinism, no-NaN at extremes.
- **TEST PLAN:** oracle suite for grid_moire green · param sweep green with documented exemptions · PFX.0 single-effect run: no auto-flags at any param extreme.
- **ACCEPTANCE GATES:** follow-up PR: oracle validators pass · **before/after visual artifact** (v1-on-#123-parent vs v2 contact-sheet rows, gray frame + real clip) in PR body · backend smoke green · rubric self-score ≥8 recorded in scorecard.
- **ROLLBACK:** follow-ups are one revert.
- **EVIDENCE:** the precondition's MERGED output, follow-up PR link, artifact images, oracle test names.

---

### PFX.3 — `fx.moire`: same disease, same cure (sine-grating overlay → image-coupled interference)

- **ID:** PFX.3 · **branch:** `fx-quality/pfx3-moire-image-coupled` · **base:** `origin/main` (after PFX.2 merge) · **depends-on:** PFX.2 (reuses its interference + brightness-preservation patterns)
- **Model:** Sonnet
- **Goal:** `backend/src/effects/fx/moire.py` (category `misc`) currently blends two *synthetic* sine gratings over the frame — an overlay, exactly C1's failure mode in different clothes. Rework: derive one grating from **image structure** (luma-quantized bands or edge-field phase) so the beat pattern responds to content; keep params (`freq_1`, `freq_2`, `angle`, `mix`) but make each visibly distinct across range; decide overlap story vs grid_moire (sine-interference vs mesh-interference — document the distinction in EFFECTS-INVENTORY or merge one into the other as a variant; merging requires a deprecation alias in `registry.py`, which has alias machinery at line 43).
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  grep -n "EFFECT_CATEGORY" backend/src/effects/fx/moire.py    # expect "misc"; different → re-read file before editing
  ls backend/tests/oracles/ | grep -c moire                    # note existing oracle count for moire family
  git log origin/main --oneline -- backend/src/effects/fx/moire.py | head -3   # nobody else mid-flight on it; recent foreign commits → STOP, check parallel sessions
  ```
- **Scope (verified paths):** `backend/src/effects/fx/moire.py` · new/updated `backend/tests/oracles/test_moire_oracle.py` · `docs/EFFECTS-INVENTORY.md` row.
- **DO-NOT-TOUCH:** `grid_moire.py` · registry beyond an alias if merging · all other effects.
- **Steps:** prototype image-coupled grating (≤1h spike, judge via PFX.0 single-effect run before committing to it — "sucks" band means rethink, not polish) → implement → brightness-preserving blend per #146's pattern → oracle with beat-visibility + brightness + param-distinctness assertions → before/after artifact.
- **TEST PLAN:** oracle green · param sweep green · PFX.0 run: no black/blank/no-op flags across param grid · chain test: moire → color effect downstream still receives usable luma range (axis e).
- **ACCEPTANCE GATES:** oracle validators pass · before/after contact-sheet rows in PR · rubric self-score ≥8 · backend smoke green.
- **ROLLBACK:** single-file revert (plus alias removal if added).
- **EVIDENCE:** PR link, artifact, scorecard delta row.

---

### PFX.4 — Datamosh authenticity audit (real technique vs optical-flow simulation)

- **ID:** PFX.4 · **branch:** `fx-quality/pfx4-datamosh-authenticity` · **base:** `origin/main` · **depends-on:** PFX.0 (artifacts); independent of PFX.2/3
- **Model:** Sonnet
- **Goal:** resolve C2 for v2/Creatrix. v1 had both a simulation (`effects/destruction.py` optical flow) and a REAL H.264 NAL-splice engine (`core/real_datamosh.py`, 7 modes, all tested). The v2 inventory lists both `fx.datamosh` and `fx.real_datamosh` — **audit whether v2's `real_datamosh` is actually bitstream-real or a renamed simulation**, then (a) if real: verify output quality on high-motion footage + document the real-vs-simulated distinction in EFFECTS-INVENTORY + expose the authentic modes (freeze_through/pframe_extend/donor per datamosh-learnings); (b) if simulated: port the v1 NAL-splice engine behind the existing effect contract (if the port exceeds 4h, this packet delivers the audit verdict + a follow-up packet spec instead — scope is capped).
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger && git fetch origin
  grep -rn "real_datamosh" backend/src/effects/ | head           # effect exists; empty → STOP, inventory is stale, report
  grep -rln "calcOpticalFlow\|optical_flow" backend/src/effects/fx/ | head   # map which moshes are simulations
  ls backend/tests/oracles/ | grep -i datamosh                   # existing oracle coverage
  # v1 engine recoverable? (Gate 19 discipline — check refs before assuming gone)
  find ~/Development -maxdepth 3 -name "real_datamosh.py" 2>/dev/null | head
  ```
- **Scope (verified paths):** `backend/src/effects/fx/` datamosh-family files (exact list from the grep above, quoted in PR) · their oracles · `docs/EFFECTS-INVENTORY.md` authenticity column.
- **DO-NOT-TOUCH:** engine render pipeline · ffmpeg invocation layers used by other effects · frontend.
- **Steps:** read both effect files end-to-end → verdict table (technique, real/simulated, modes present vs datamosh-learnings table) → high-motion footage render via PFX.0 (synthetic testsrc hides mosh quality — C2: "motion is king") → implement (a) or (b) → oracle asserting the *authentic signature* (e.g., freeze_through: pixels without new color data persist across the removed-I-frame boundary), not just "output differs".
- **TEST PLAN:** datamosh-family oracles green · determinism preserved (seeded, frame-index based — C8 check while in there) · PFX.0 flags clean · 4h cap enforced: timebox the port decision at 1h of reading.
- **ACCEPTANCE GATES:** authenticity verdict table in PR (per effect: real/simulated/hybrid + evidence lines) · oracle validators pass · before/after (or simulated-vs-real side-by-side) visual artifact on high-motion clip · backend smoke green.
- **ROLLBACK:** per-file revert; audit-only outcome has zero code risk.
- **EVIDENCE:** verdict table, PR link, artifact, EFFECTS-INVENTORY diff.

---

### PFX.5 — Modulation-family liveliness pass (anti-mechanical sweep, C3/C4/C7/C8)

- **ID:** PFX.5 · **branch:** `fx-quality/pfx5-modulation-liveliness` · **base:** `origin/main` · **depends-on:** PFX.1 (scorecard tells us *which* of the 13 modulation + 14 temporal effects are in the bottom bands — do those first; this packet covers the top 5 offenders, ≤4h)
- **Model:** Sonnet
- **Goal:** the modulation family is the locus of two prior complaints: C4 ("audio concept ports mediocre") and C3 ("don't just modulate shit up and down — that's not musical"). For the 5 worst-scoring modulation/temporal effects: replace bare up-down LFO sweeps with shaped motion (eased/turbulent/sample-and-hold-jittered phase — the #146 liquify "turbulent domain-warp flow" is the house pattern), ensure all oscillating params are **cycles-per-frame not Hz** (C8, grep `hz\|Hz` in PARAMS labels/units), and add preview-warmup state hints where the effect reads as static on frame 0 (C7).
- **PRECONDITIONS:**
  ```bash
  cd ~/Development/entropic-v2challenger
  test -f docs/audits/EFFECTS-QUALITY-SCORECARD-*.md || { echo "STOP: run PFX.1 first"; }
  grep -rln '"unit": "Hz"\|"unit": "hz"' backend/src/effects/fx/ | head    # C8 candidates; empty = good, packet shrinks
  ```
- **Scope (verified paths):** ≤5 effect files named by the scorecard (quote exact list in PR before editing) · their oracles · param-sweep exemptions if needed.
- **DO-NOT-TOUCH:** any effect not on the named-5 list · determinism contract (`engine/determinism.py` `make_rng`) — consume it, never modify it.
- **Steps:** per effect: PFX.0 before-strip → motion reshape → cpf audit → warmup hint → PFX.0 after-strip → oracle update (frame_diff_mean > threshold across a 30-frame window = "alive"; phase determinism at two fake fps values = C8 regression guard).
- **TEST PLAN:** per-effect oracle green · determinism tests green · param sweep green · before/after MP4 strips for all 5.
- **ACCEPTANCE GATES:** oracle validators pass for all touched effects · 5 before/after animation strips in PR · zero Hz-labeled frame-index LFO params remain library-wide (grep output quoted) · backend smoke green · scorecard rows re-scored, each +2 or better on axis (c).
- **ROLLBACK:** per-effect revert commits (one commit per effect, mandated).
- **EVIDENCE:** PR link, 5 strips, grep proof, scorecard deltas.

---

## 5. Sequencing & cost

```
PFX.0 harness (4h) ──► PFX.1 triage (3h Fable + ~1h user) ──► PFX.5 modulation top-5 (4h) ──► [top-10 stubs from PFX.1]
[P1.4 merges #146] ──► PFX.2 grid-moire follow-ups (3h) ──► PFX.3 fx.moire rework (4h)   [independent track, gated on P1.4]
PFX.4 datamosh authenticity (audit 2h, fix ≤2h or re-packet)                  [independent track]
```

**Total committed: ~20h** across 6 packets. The flywheel after PFX.1: every future effect PR attaches its PFX.0 single-effect contact strip as a mandatory artifact — making "visual verify caught it; numeric tests missed it" a gate instead of a postmortem.
