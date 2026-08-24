# Packets — fx-afterimage

**Emitted:** 2026-07-04 by /packetize. **Plan:** `plan.md` (same dir — packets
POINT to its line-anchored normative sections; do not re-derive). **Proposal:**
`proposal.md` (T1 Verdicts LOCKED 2026-07-03 — **OD-1 superseded by the COMBO
verdict**: ONE effect, TWO engines, `style` choice param `echo`(default)|`ghost`;
OD-2..OD-5 ACCEPTED at their recommended defaults — do not re-open any of
OD-1/2/3/4/5). **Route:** `/eng` Phase 3 (small loop, not marathon — 4 packets,
single-effect scope).

**Branching rule (every packet):** cut from `origin/main` only (a parallel UAT
session may own the local checkout — never branch from it). PR-only; squash
merge; no `.github/workflows/**` edits.
**Merge gate (every packet, STRICT FULL-TIER):** full backend pytest
(`cd backend && python -m pytest -x -n auto --tb=short`) + full vitest
(`cd frontend && npx --no vitest run`, main-checkout or CI — worktree executors
cannot run vitest) → `Skill(review)` via Skill tool (ship-gate hook) → full CI
green (incl. e2e-full + sidecar where path-applicable).

**Cross-change constraints checked (per packetize contract):**
- `stores/operators.ts` / `modulation/routing.py` rebase-after-wave0 rule:
  **N/A** — no fx-afterimage packet touches either file (verified: this change
  has zero frontend file changes and zero routing-layer surface, per plan.md
  §1's explicit "No frontend file changes" note).
- browser-folders' PRESETS-node / multiwindow-stage-a's panel-stub rules:
  **N/A** — fx-afterimage has no PresetBrowser or System Monitor surface
  (proposal.md Out-of-Scope explicitly excludes the System Monitor display).
- **fx-backspin shared `DEPENDENT_PARAMS` registry: APPLIES.** Both changes
  add entries to the SAME dict at `backend/tests/test_parameter_sweep.py:67`.
  See PK.3's STOP clause below — dedupe against whichever of
  {fx-backspin, fx-afterimage} lands first. fx-backspin's own packets.md
  (`openspec/changes/fx-backspin/packets.md`, P1 STOP) carries the mirror
  clause naming this change back.
- Every new numeric param ships curve+unit metadata: enforced live by
  `backend/tests/test_effects/test_calibration.py::test_numeric_params_have_curve`
  / `::test_numeric_params_have_unit` — baked into PK.1's hard oracle. Applies
  to BOTH the new `echo`-style rows and the moved `adaptation_rate`/`strength`
  `ghost`-style rows (plan.md §2, §4.2).

---

### PK.1 — Effect core rewrite (combo dispatcher) + oracle fix — bundled, must land atomically
- **Scope:** everything in `plan.md` §1 (code surface), §2 (normative merged
  `PARAMS` table), §3 (model + implementation-note sketch resolving OD-4 to
  its recommended default (a): `mode` governs the outer composite only, the
  internal recursive accumulation is a fixed weighted sum). Concretely:
  `backend/src/effects/fx/afterimage.py` becomes a merged-`PARAMS` dispatcher —
  `style` choice (`echo` default | `ghost`) at the top; `apply()` dispatches
  `style = params.get("style", "echo")` (missing key ⇒ `echo`, the clean-break
  default for old project data, per proposal.md T1); `_apply_ghost()` is lines
  42-69 of the CURRENT file moved **verbatim, byte-for-byte** into a private
  helper (no reformatting, no clamp changes — the move itself is oracle 12 in
  plan.md §4.1a); `_apply_echo()` implements the single-buffer recursive
  echo-line model per plan.md §3's sketch, with the explicit early-return
  special-case for `feedback==0 OR opacity==0` (byte-identical passthrough,
  `state_out=None` — plan.md §3's purity-leg fix, not the sketch's naive
  version). `EFFECT_CATEGORY` `"misc"` → `"temporal"`. Module docstring
  documents OD-3's `max`/`lighten` aliasing (both call the same
  `np.maximum`/compositor `_blend_lighten` kernel — do not "fix" into two
  formulas) AND the two-engine dispatch. Bundled in the SAME packet: rewrite
  `backend/tests/oracles/test_afterimage_oracle.py` per OD-2 (swap the
  first-frame `per_pixel_l1_distance >= 2.0` assertion for
  `nth_frame_l1_distance(..., n=10)`, using the existing
  `backend/tests/oracles/conftest.py:132-137` helper — no new helper).
- **Why bundled, not two packets:** plan.md §5 states explicitly "P1 and P3
  [effect rewrite / oracle fix] should not ship independently of each other —
  landing P1 alone leaves `main` red on the existing oracle." Under this
  packetize's STRICT FULL-TIER merge gate (full CI green required per merge),
  shipping them as separate PRs would force an intentional red-main window
  between merges — not permitted. One PR, one packet.
- **Non-scope:** the dedicated `backend/tests/test_afterimage.py` unit-test
  file (PK.2 — needs the real, both-branches `apply()` to write meaningful
  assertions against, but is NOT required for PK.1's own merge gate since the
  generic harness/calibration suites + the rewritten oracle already prove the
  new model is alive); `test_parameter_sweep.py` `DEPENDENT_PARAMS` entries
  (PK.3); the 4 named presets (PK.4 — persistence mechanism undecided, see
  PK.4's STOP); any `fx.backspin` file; any frontend file (none exist to
  touch — grep-confirmed zero `afterimage` hits in `frontend/src`); SG-8
  `FeatureRegistry` registration (OD-5, explicitly deferred).
- **Files:** `backend/src/effects/fx/afterimage.py` (full owner — merge, not
  delete-and-replace: existing `adaptation_rate`/`strength` PARAMS entries
  preserved byte-identical per plan.md §1/§2), `backend/tests/oracles/test_afterimage_oracle.py`
  (single-assertion swap, isolated file).
- **Depends:** none — dispatchable now (cut from `origin/main`). **Blocks:**
  PK.2, PK.3, PK.4 (all need PK.1's merged `PARAMS`/`apply()` to exist).
- **Risk:** STD. Rewrites a LIVE registered effect and adds a two-engine
  dispatcher, plus the OD-4 diminish-formula/mode-scope ambiguity means the
  echo path may need a second implementation pass once oracles run — genuine
  design risk, not mechanical. Not HIGH: blast radius is contained to two
  files with zero external callers (grep-confirmed: no frontend reference,
  no fixture/preset JSON references either param set, `registry.py`'s
  import/registration is unchanged) — unlike a shared hot-path or trust-
  boundary packet, a mistake here cannot silently corrupt other effects'
  output.
- **Hard oracle:**
  - `cd backend && python -m pytest tests/test_effect_harness.py -k afterimage -x --tb=short`
    green — `fx.afterimage` auto-parametrizes into `TestEffectSurvival`,
    `TestEffectDeterminism`, `TestEffectStateful`, `test_timing_budget_1080p`
    (<500ms) with zero new harness code (registry-driven).
  - `cd backend && python -m pytest tests/test_effects/test_calibration.py -k afterimage -x --tb=short`
    green — every float/int param in the MERGED dict (both `echo`-style rows
    AND moved `adaptation_rate`/`strength`) carries `curve`+`unit`;
    `test_effect_at_defaults/_min/_max` pass (defaults exercise `echo` only,
    per plan.md §4.2 — expected, not a gap at this packet).
  - `cd backend && python -m pytest tests/oracles/test_afterimage_oracle.py -x --tb=short`
    green POST-packet. **Anti-dead-flag:** run this SAME command against
    `origin/main` (pre-packet) first and capture that it is RED (the existing
    `per_pixel_l1_distance >= 2.0` first-frame assertion fails by construction
    once frame-0 is a hard passthrough) — include both outputs in the PR body.
  - `grep -n "def _apply_ghost" backend/src/effects/fx/afterimage.py` shows
    the moved block; a manual byte-diff of the moved lines against
    `git show origin/main:backend/src/effects/fx/afterimage.py` lines 42-69
    (documented in PR body) confirms zero formula changes — this is the
    cheap pre-check; PK.2's oracle 12 is the strong (test-enforced) version.
  - Before touching any file, capture a baseline: `cd backend && python -m
    pytest -n auto --tb=line -q > /tmp/afterimage_baseline.txt; tail -8
    /tmp/afterimage_baseline.txt` and paste the failing-test names into the PR
    body. As of this packetize pass (2026-07-04, HEAD 52b8151) that baseline is
    2 pre-existing, unrelated failures — `test_zmq_commands.py::test_export_start_passes_valid_performance_payload`
    and `::test_export_start_without_performance_is_legacy` — NOT the
    `fx.copy_machine.feedback_amount` unit issue named in the prior draft
    (that landed in PR #408/#418 and no longer reproduces; verified via `git
    log -- backend/src/effects/fx/copy_machine.py` and by re-running
    `test_numeric_params_have_unit`/`test_numeric_params_have_curve`, both
    currently green). Do NOT run this baseline with `-x` — it would halt on
    the first unrelated ZMQ failure before ever reaching afterimage-relevant
    tests. After PK.1's changes, re-run the same command and diff the
    failing-test sets: the post-change failing set must equal the baseline set
    exactly (no new entries, no removed entries beyond what PK.1 legitimately
    fixes). Any NEW failing test not in the baseline is a fx-afterimage
    regression and blocks the packet; the 2 baseline ZMQ failures are out of
    file-ownership scope — do not fix them here.
- **Test plan:** no new test FILE in this packet (PK.2 owns that); this
  packet's correctness is proven by the generic harness/calibration suites
  (already parametrize every registered effect) plus the rewritten oracle
  file. Layer: backend integration (harness) + backend unit (calibration) +
  backend oracle (CLI-render regression).
- **Trust-boundary rule:** N/A for this packet — `fx.afterimage` has no
  external-input trust boundary (params arrive through the same
  already-validated effect-chain param path every other effect uses; no new
  deserializer, no new IPC surface). Do not add speculative validation.
- **STOP:**
  - If the OD-4(a) reading (mode governs ONLY the outer composite; the
    internal recursive accumulation is a fixed weighted sum) fails to
    reproduce any of the 6 named oracles once real test cases exist
    (impulse spacing, geometric diminish, purity, etc. — the full set lives
    in PK.2, but a quick manual smoke during PK.1 build may surface this
    early), STOP and report — do not silently switch to reading (b)
    (proposal.md OD-4 names this exact ambiguity as requiring oracle-driven
    resolution, not implementer preference).
  - If `backend/src/effects/fx/afterimage.py:42-69` on current `main` has
    drifted from what plan.md quotes (parallel sessions may be active),
    STOP and re-verify the ghost-model source lines before moving them.
  - PR body MUST include the T1 combo carryover note: "Old projects (no
    `style` param) default to `echo` — acceptable clean-break per
    `openspec/project.md`'s no-backwards-compat convention." (proposal.md
    T1 Verdicts; plan.md §6 flags this so it isn't dropped between plan and
    execution.)
- **Executor brief:** Sonnet. Inline verbatim: (1) Core Rule 1 — "Read files
  before editing — never Edit without prior Read"; (2) Gate 6 (Reproduce) —
  "fixing a bug → RUN the failing code first, capture the actual error/stack
  trace... You need the real output" (applies to capturing the pre-packet RED
  oracle output before writing the fix); (3) House Landmine — "Every
  float/int param declares BOTH `curve` and `unit`." Last line: return PR # +
  the pre/post oracle command outputs (harness, calibration, oracle
  before-red/after-green, full-suite red-count).

### PK.2 — Dedicated unit test file (`backend/tests/test_afterimage.py`, new)
- **Scope:** everything in `plan.md` §4.1 (11 `echo`-style oracles: bypass
  purity, echo-energy monotonic in feedback, echo-energy monotonic in
  opacity, echo spacing == `delay_frames` exactly via impulse test,
  per-recursion diminish matches `opacity·feedback^n`, `echo_transform`
  compounds geometrically, `color_drift` rotates per echo, `tint` never
  touches the current frame, `threshold` gates echo seeding, determinism
  (regression-only, generic layer already covers it), state bounded ring≤30)
  PLUS §4.1a (oracle 12: `ghost`-style byte-identical-to-pre-refactor
  regression via a hand-copied 4-line reference formula inlined in the test
  file — NOT re-derived from prose; oracle 13: style-switch default/clean-
  break boundary, both the missing-key case and the unrecognized-value case).
  Modeled on `backend/tests/test_copy_machine.py`'s pattern (direct
  multi-frame `apply()` sequences, ring/state introspection — e.g. its
  `test_ring_is_capped` at line 563).
- **Non-scope:** any production code change (this packet is additive-test
  only); the calibration/harness generic layers (already exist, PK.1's
  oracle); the parameter-sweep `DEPENDENT_PARAMS` entries (PK.3).
- **Files:** `backend/tests/test_afterimage.py` (new, full owner).
- **Depends:** PK.1 (needs the real, both-branches `apply()` to write
  meaningful assertions against — plan.md's suggested order). **Blocks:**
  none. Parallel-safe with PK.3 and PK.4 (disjoint files).
- **Risk:** LOW — additive test file, no production code touched.
- **Hard oracle:**
  - `cd backend && python -m pytest tests/test_afterimage.py -x --tb=short`
    — **anti-dead-flag:** `python -m pytest --collect-only -k afterimage
    tests/test_afterimage.py` on pre-packet `main` collects 0 tests (file
    does not exist); post-packet, ≥13 tests collected (11 echo + 2
    combo), all green.
  - Oracle 4 (impulse spacing) specifically: assert the first visible echo
    appears at EXACTLY `frame_index == delay_frames` frames after the
    impulse — off-by-one must fail this test, not pass it silently.
  - Oracle 12 specifically: the inlined 4-line reference formula (hand-
    copied from the pre-refactor `backend/src/effects/fx/afterimage.py`
    lines 43-69 read during PK.1, quoted in plan.md §4.1a: `adaptation =
    adaptation + adaptation_rate * (rgb - adaptation)`; `diff = adaptation -
    rgb`; `afterimage = 0.5 + diff`; `result = rgb * (1.0 - strength) +
    afterimage * strength`) must match `_apply_ghost`'s real output
    bit-for-bit across defaults / both-at-min / both-at-max / a 5-frame
    carried-state sequence — any mismatch means PK.1's "verbatim move"
    claim was false and PK.1 must be revisited, not this test loosened.
- **Test plan:** backend unit tier — this packet IS the test plan (new file,
  13 test cases minimum, per plan.md §4.1/§4.1a enumeration).
- **STOP:** if any of the 13 oracles cannot be made to pass without changing
  PK.1's model equation (i.e. the sketch in plan.md §3 is provably wrong for
  some oracle), STOP and report back to PK.1's scope rather than weakening
  the oracle's assertion to fit a broken implementation.
- **Executor brief:** Sonnet. Inline verbatim: (1) Core Rule 6 — "Test
  before shipping — run it, don't just write it"; (2) Gate 5 (Tests) — "unit
  tier for logic/validation... write tests at the RIGHT LAYER"; (3) the
  oracle-12 verbatim-move rule from plan.md §4.1a — "hand-copied reference
  implementation directly in the test file (copied from this read, not
  re-derived from the prose model)". Last line: return PR # + the
  collect-only before/after counts + the 13-oracle pass table.

### PK.3 — Parameter-sweep `DEPENDENT_PARAMS` registration audit — cross-change shared file
- **Scope:** everything in `plan.md` §4.3, both inertness classes: (a)
  frame-0 inertness WITHIN `echo` style — verify empirically against PK.1's
  real `apply()` whether the existing blanket `("fx.afterimage",)`-style
  entry in `STATEFUL_FRAME0` (`backend/tests/test_parameter_sweep.py`, ~line
  289, current comment: "needs buffer history or sidechain") remains correct
  for the new model (plan.md's own analysis: likely YES, keep the blanket
  entry, since every echo param is frame-0-inert under the sketch — confirm,
  don't assume); (b) cross-style inertness (NEW, T1 combo) — register
  `("fx.afterimage", "adaptation_rate")` and `("fx.afterimage", "strength")`
  in `DEPENDENT_PARAMS` (they show `diff==0.0` when swept because the
  dispatcher never reads them while `style="echo"`, the sweep's default),
  each with a rationale comment matching house convention (mirror the
  `("fx.copy_machine", "cell_size")`-under-`machine="toner"` comment style,
  `test_parameter_sweep.py:170-176`); confirm `style` ITSELF is NOT added to
  `DEPENDENT_PARAMS` (sweeping `echo`→`ghost` must show a real diff — the two
  engines produce different math; suppressing this would hide a real bug).
- **Non-scope:** any production code change; `test_afterimage.py` (PK.2).
- **Files:** `backend/tests/test_parameter_sweep.py` — **cross-change file**,
  shared with `fx-backspin`'s P1 (same `DEPENDENT_PARAMS` dict at `:67`).
- **Depends:** PK.1 (needs the real merged `PARAMS` dict to know which
  entries are actually needed). **Blocks:** none. Parallel-safe with PK.2 and
  PK.4 (disjoint files).
- **Risk:** LOW — additive `DEPENDENT_PARAMS` entries with documented
  reasons, following house convention; no production code touched.
- **Hard oracle:**
  - `cd backend && python -m pytest tests/test_parameter_sweep.py -k afterimage -x --tb=short`
    green, zero unexplained skips or failures.
  - **Anti-dead-flag:** capture the PRE-packet run of the same command
    (post-PK.1, pre-PK.3) showing `adaptation_rate`/`strength` sweep cases
    FAIL or report `diff==0.0` unexpectedly (they are live params that
    should show impact under a naive sweep run at `style` default, but the
    dispatcher never reaches them) — then show it PASS once the
    `DEPENDENT_PARAMS` entries are added.
  - Both directions accounted for: entries exist for BOTH ghost-under-echo-
    default (`adaptation_rate`, `strength`) AND any echo param confirmed
    frame-0-inert per (a) above — not just one direction.
- **Test plan:** the existing parametrized sweep suite IS the test; no new
  test file. Evidence = before/after command output in PR body.
- **STOP — DEPENDENT_PARAMS dedupe (fx-backspin cross-change):** before
  editing `backend/tests/test_parameter_sweep.py`, run
  `git log --oneline -- backend/tests/test_parameter_sweep.py` and
  `grep -n "DEPENDENT_PARAMS" backend/tests/test_parameter_sweep.py`. If
  fx-backspin's P1 already landed and converted the ad-hoc `set` at `:67`
  into a formalized registry module, CONSUME that module (import + register
  fx-afterimage's keys through it) — do NOT rebuild the ad-hoc set. If
  fx-afterimage lands first, add the 2-key entry as today's plain-set
  convention (no registry module invented) so fx-backspin's packet has a
  concrete precedent to either extend or formalize (mirrors fx-backspin
  `packets.md` P1's identical clause, naming this change back).
- **Executor brief:** Sonnet. Inline verbatim: (1) the DEPENDENT_PARAMS
  dedupe STOP clause above (paste verbatim, do not paraphrase); (2) house
  convention — "each new entry needs a comment explaining WHY, matching
  house convention, not a bare tuple" (plan.md §4.3(b)); (3) Core Rule 1 —
  read before edit. Last line: return PR # + before/after sweep command
  output + confirmation of which dedupe branch was taken (consumed existing
  registry vs. added ad-hoc entries first).

### PK.4 — Ship 4 named presets (`vaporwave`/`smear`/`stutter`/`ink_ghost`) — STOP-gated escalation
- **Scope:** author the 4 named presets exactly as tabulated in plan.md §2
  ("Presets (ship verbatim)" table: `vaporwave` delay_frames=6/feedback=0.85/
  opacity=0.8/mode=screen/color_drift=+14°/echo_transform=blur/
  transform_amount=0.2; `smear` 1/0.9/0.9/max/0/none/n·a; `stutter`
  12/0.7/1/lighten/0/none/n·a; `ink_ghost` 2/0.8/0.7/min/0/none/n·a) — BUT
  **only after** the STOP below is resolved.
- **Non-scope:** inventing a NEW preset-persistence mechanism unilaterally.
  This packetize pass re-verified plan.md §2's own flag this session:
  `grep -rn "PRESETS\b" backend/src/effects/fx/*.py` finds ZERO instances of
  a per-effect `PRESETS` dict pattern anywhere in the effects tree (only an
  unrelated `ANIMATION_PRESETS` list in `backend/src/engine/text_renderer.py`,
  a different subsystem). `fx.copy_machine.py` — the file plan.md names as
  the pattern to follow "if it ships presets at all" — does NOT ship
  presets. There is no house convention for this in the effects layer today.
- **Files:** none pre-determined — location depends on the STOP's
  resolution. Do not create a new file/dict pattern speculatively.
- **Depends:** PK.1 (needs the final `echo`-style `PARAMS` shape to validate
  preset values against min/max ranges). **Blocks:** none. Parallel-safe
  with PK.2/PK.3 up to the point of the STOP.
- **Risk:** LOW as scoped (the packet's own action, on hitting the STOP, is
  to halt and report — no risky code is written without a decision). If the
  STOP resolves toward adopting a new pattern, risk should be re-assessed at
  that time by whoever re-scopes the follow-up packet.
- **Hard oracle:** N/A until the STOP resolves — there is no code to run an
  oracle against yet. Once a persistence pattern is chosen, the oracle must
  include: all 4 presets apply without error at `frame_index` 0 and 10;
  preset param values fall within each param's declared `min`/`max` (a
  mechanical check against PK.1's `PARAMS` dict); non-black/non-trivial
  output for each (mirrors `wave0-prerouted-presets` PK.3's "non-black
  assertion + hash stability" pattern).
- **Test plan:** deferred to the follow-up packet once the STOP resolves.
- **STOP (immediate — this is the packet's actual first action):** before
  writing any code, confirm with the user or orchestrator which pattern to
  use. Two concrete, already-precedented options exist in this same repo,
  named here so the decision is fast, not open-ended:
  (a) **Adopt the `fx.backspin` `preset`-choice-param + frontend-cascade
  pattern** (see `openspec/changes/fx-backspin/plan.md` §1, `proposal.md`
  OD-3 — the ONLY directly analogous, already-decided precedent, shipped
  same-day in a sibling change): add a `preset` choice param to
  `fx.afterimage`'s `PARAMS` (`vaporwave`/`smear`/`stutter`/`ink_ghost`/
  `custom`) and a cascade write in the frontend transaction layer. This
  would be a NEW design decision for `fx.afterimage` specifically — the
  T1 Verdicts section did not resolve it, and `fx.afterimage` has **no**
  frontend file today (proposal.md Out-of-Scope explicitly rejects new UI
  beyond the generic `ParamPanel`), so adopting (a) would reopen that
  Non-Goal ("no change to the frontend beyond whatever the generic
  param-schema renderer already does automatically") — flag this tension
  explicitly when escalating.
  (b) **Some other mechanism** (e.g. a plain module-level `PRESETS` dict
  exposed via `list_all()` for a future generic preset-picker UI, or a
  `.glitchpreset`-style JSON per `wave0-prerouted-presets`' whole-chain
  preset schema) — not precedented at the per-effect level today; would be
  genuinely new plumbing.
  (c) **Defer preset shipping to a follow-up change** — ship the `echo`/
  `ghost` engines now (PK.1-3), track the 4 named presets as a tracked
  follow-up once (a) vs (b) is decided.
  Do NOT build ad hoc. This mirrors plan.md §6's own unresolved item,
  carried forward rather than silently dropped or silently invented.
- **Executor brief:** Sonnet. Inline verbatim: (1) Core Rule 3 — "Do what
  was asked, nothing more — no bonus features" (do not invent a persistence
  format to "just get it done"); (2) the STOP options (a)/(b)/(c) above,
  pasted verbatim into the escalation message; (3) Core Rule 1 — read
  before edit (re-run the grep in the STOP before reporting, in case a
  pattern landed on `main` since this packetize pass). Last line: return
  EITHER the escalation report (grep re-run output + the 3 options,
  awaiting a decision — no PR) OR, if a decision was already made available
  before dispatch, PR # + preset-validation oracle output.

---

## Single-flight map
| File | Packets | Order |
|---|---|---|
| `backend/src/effects/fx/afterimage.py` | PK.1 only | n/a (single owner) |
| `backend/tests/oracles/test_afterimage_oracle.py` | PK.1 only | n/a (single owner, bundled with the effect rewrite to avoid a red-main window) |
| `backend/tests/test_afterimage.py` | PK.2 only (new file) | n/a (single owner) |
| `backend/tests/test_parameter_sweep.py` | PK.3 (this change) + `fx-backspin` P1 (cross-change) | whichever change lands first builds/extends the ad-hoc `DEPENDENT_PARAMS` set; the other consumes per PK.3's dedupe STOP |
| (undetermined — preset persistence) | PK.4, contingent on STOP resolution | after PK.1; may retroactively touch `afterimage.py` if option (a) is chosen — re-open single-flight with PK.1's owner at that time |

No other file is touched by 2+ packets within this change.

## Coverage check (plan.md + proposal.md → packets)
- Merged `PARAMS`/`apply()` dispatcher, `style` discriminator, ghost-model
  verbatim move, `EFFECT_CATEGORY` change, OD-3 max/lighten aliasing
  docstring, OD-4(a) model resolution → **PK.1**.
- OD-2 oracle rewrite (`nth_frame_l1_distance`) → **PK.1** (bundled, per its
  "why bundled" note — cannot ship independently without a red-main window).
- 11 `echo`-style oracles + oracle 12 (ghost byte-identical) + oracle 13
  (style-switch default/clean-break) → **PK.2**.
- Calibration compliance (`curve`+`unit` on every numeric param, both
  engines) → **PK.1**'s hard oracle (generic layer, no new test needed per
  plan.md §4.2).
- Harness/smoke layer (survival, determinism, timing budget) → **PK.1**'s
  hard oracle (generic layer, registry-driven, no new test needed per
  plan.md §4.5).
- Parameter-sweep frame-0 inertness (within `echo`) + cross-style inertness
  (`adaptation_rate`/`strength` under `echo` default) → **PK.3**.
- 4 named presets (`vaporwave`/`smear`/`stutter`/`ink_ghost`) → **PK.4**,
  STOP-gated (no existing persistence precedent — plan.md §2/§6 flagged this
  as unresolved; not silently dropped, not silently invented).
- OD-5 (local ring cap ≤30, SG-8 registration deferred) → covered by PK.1's
  implementation of the ring cap; the deferred SG-8 registration itself is
  explicitly **out of scope** per proposal.md's Out-of-Scope list — no
  packet builds it, matching the proposal's own descope.
- BDD "Feature 12" reference (plan.md §4.6) → **NOT packetized.** This
  packetize pass re-ran the search plan.md called for
  (`find . -iname '*.feature'` repo-wide, excluding vendored trees) and
  found zero `.feature` files and zero "Feature 12" text anywhere in the
  repo. Unlike `fx-backspin` (which has a P5 BDD packet against its own
  sibling-suite convention, itself unverified — see that packets.md P5's
  STOP), `fx-afterimage`'s source spec explicitly does NOT carry BDD
  scenarios for this effect specifically (plan.md §4.6, quoted: "no
  `.feature` file or Given/When/Then text was found... flag back to the
  orchestrator to locate `Feature 12` before packetize, rather than
  inventing Gherkin text here"). Flagged to the orchestrator as an
  unresolved cross-change question (is "BDD Feature 12" a real artifact
  that exists somewhere neither change's planning pass searched, or a
  stale reference?) rather than silently dropped or fabricated by this
  packetizer. If `fx-backspin`'s P5 successfully locates a real sibling BDD
  convention, a fast-follow packet can extend it to `fx-afterimage`;
  until then, this is an explicit, named gap — not a silent one.
- Non-Goals from `proposal.md` (fx.backspin itself, frontend UI beyond
  generic ParamPanel, presetSchemaVersion bump, SG-8 unification) →
  **explicitly descoped by the proposal itself** — no packet covers them;
  nothing silently narrowed beyond what T1 already locked.

Nothing in `plan.md` or `proposal.md` is silently narrowed: every in-scope
item maps to a packet or an explicitly named, reasoned gap (BDD reference,
preset persistence) that is flagged forward rather than dropped.

## Ledger
| Packet | Status | PR | Oracle evidence |
|--------|--------|----|-----------------|
| PK.1 | ⬜ | — | — |
| PK.2 | ⬜ | — | — |
| PK.3 | ⬜ | — | — |
| PK.4 | ⬜ | — | — |

> **REF (non-normative, added 2026-08-23):** implementation reference patterns for this change: `docs/plans/noise-canvas-implementation-references.md` §fx-afterimage — consult before the first packet; locked contracts in THIS file win on any conflict.
