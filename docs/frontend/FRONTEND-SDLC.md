# FRONTEND-SDLC — how a UI change ships

> **Status: LAW** (frontend framework F1, 2026-07-30). Generalizes the pipeline the
> `ui-foundation` change invented, so every UI change follows it instead of improvising.
> Companion: `COMPONENT-SPEC.md` (what to build with) · `RATIFIED-FOUNDATIONS.md`
> (decisions that bind everything) · `CONTRIBUTING.md` §Frontend UI Law (the one-page index).

## 1 · The pipeline (picture → shipped feature)

1. **Audit/diagnose** — ground-truth pass over the live app (screenshots, file:line cites).
2. **Proposal** — `openspec/changes/<name>/proposal.md` with Open Decisions (OD-N), each
   with a recommended default. Non-goals stated.
3. **User verdicts** — decisions locked; LOAD-BEARING design verdicts get a row in
   `RATIFIED-FOUNDATIONS.md` in the same commit.
4. **Plan** — packets with file:line ground truth, dependencies, DO-NOT-TOUCH lists.
5. **Quantified design-spec** — for value-heavy changes: every size/color/spacing a token,
   zero magic numbers.
6. **Mocks** — REAL-INVENTORY-ONLY (every element exists in code or a locked plan) and
   **REAL-DIMENSIONS-ONLY** (authored inside the app's default 1280×800 window; ratified
   2026-07-29 after the frame mock shipped at 1600px). Registry: `docs/mockups/INDEX.md`.
7. **Packets** — ≤4h one-shot units per `docs/roadmap/EXECUTION-PLAN.md` §1, each with a
   hard oracle and a UAT unit (rows + method + trap).
7½. **Cross-lane coherence check (A4):** before packets dispatch, grep every OTHER planning
   lane's proposals for the surfaces/components this change names. Any overlap gets a row in
   `docs/frontend/RECONCILIATIONS.md` (what transfers, what supersedes, who rules) BEFORE
   either side builds. (Origin: the Convention-1 rail and Rail-v12 both claimed the tool
   strip from different lanes, undetected until post-build.) Also refresh the change's
   file:line cites against current main — cites rot under intervening sweeps.
8. **Build with the visual cadence** (§2) and merge gates (§4).
9. **Live visual pass** (PUX.6 protocol) every ~5 merged UI packets.

## 2 · The visual cadence ladder (microscopic by default)

| Level | When | What | Enforced by |
|---|---|---|---|
| **L1 per-edit** | Every visual-code edit | Dev app running (hot reload); screenshot the touched surface and LOOK before the next edit | Hard rule: screenshot in the packet ledger per visual edit |
| **L2 per-packet** | Before ledger ✅ | Finished surface vs the mock, evidence attached | Packet contract (non-skippable) |
| **L3 per-push** | Automatic | Masked screenshot diffs on baselined surfaces | CI e2e job (once baselines exist — see §3) |
| **L4 per-5-packets** | Standing cadence | Short PUX.6 live pass: 5 core flows, diff vs last run | EXECUTION-PLAN rule 9 |
| **L5 exit gates** | Redesign/release end | Full-surface sweep + fresh baselines as the exit artifact | Definition of Done |

Rationale: the app degraded because nothing was looked at between big UAT marathons.
L1 costs ~15–30s per edit and catches 0-CSS markup, native-blue controls, and truncation
at birth (all real shipped bugs of exactly this class).

## 3 · Screenshot-baseline lifecycle (visual regression)

The gate never forbids change — it forbids **undeclared** change.

- **Birth:** generated ON the CI runner (hermetic fixture: 1280×800, DPR 1 — F0.2),
  masked over nondeterministic pixels (video canvas, FPS, uptime), committed like a
  lockfile. NOT before ui-foundation lands (its packets restyle the frame on purpose;
  baselines arrive as its final packet / exit artifact).
- **Steady state:** every push re-renders and diffs; identical → silent green.
- **Declared change:** a PR whose packet scope names surface X regenerates X's baseline
  in the SAME PR; the before/after diff rides the PR for owner approval.
- **Regression:** diff on an UNdeclared surface → red. Fix the scope declaration
  (consciously) or fix the CSS leak.
- **Death:** surface removed → baseline deleted in the same PR.
- **Redesign mode:** a whole-frame change suspends affected baselines at start and
  re-baselines at its exit gate.
- Rollout: main-push-only until stable two weeks → per-PR. **Auto-demote:** false
  positives blocking 2 PRs in a week → back to main-push-only (OD-2 verdict).
- Kill criterion: >30% of red runs blanket-regenerated over 60 days → the gate has no
  authority; delete it.

## 4 · The testing pyramid (shaped by what actually failed here)

| Tier | Job | Layout changes → |
|---|---|---|
| vitest component tests (bulk) | State & logic, no browser | Unaffected |
| Screenshot baselines | Tripwires, no choreography | Churn only in declaring PRs |
| OS-pointer proofs (≤10, capped) | Drag/draw ONLY — synthetic CU cannot fire those handlers (4× confirmed) | Test-id targeted; break only on real interaction change |
| Computer use | Exploration, visual judgment, chaos, acceptance | Written per-change |

**Standing prohibition: no Playwright journey suites.** The 132-test suite encoded click
choreography into a layout-blind tier — broke on every UI shift at 50–70 min per CI run.
E2E stays for launch/lifecycle/security/drag-proofs, each with a `// WHY E2E:` comment.

## 4½ · Presentation & exit rules (v4.1 amendments A1/A2/A5, 2026-07-31)

- **A1 — the owner's first look BLOCKS exit.** For any visual change-set, a live walk by the
  owner is a non-deferrable exit-gate step. If the owner is unavailable, the change-set stays
  OPEN — never close a ledger row with the human gate deferred. (Origin: the v4 exit closed
  with the walk deferred; the walk then surfaced ~17 items.)
- **A2 — row-level sweep oracles.** Any packet executing a manifest/checklist (icon sweeps,
  adoption sweeps) commits its row list AS A TEST — one assertion per row — in the same PR.
  Aggregate counts (e.g. "emoji → 0") are necessary but insufficient: three manifest rows
  escaped the v4 icon sweep under aggregate-only oracles.
- **A5 — CU-look before presenting.** Before any UI change is presented to the owner (or a
  "done" claim made), the orchestrator launches the built app and inspects the changed
  surfaces live via computer use — own eyes first, owner's second. Per-edit screenshots (L1)
  do not satisfy this; it is a per-presentation gate. (Owner instruction, 2026-07-31.)

## 5 · Traceability (the control-surface-gap cure)

Every UI PR fills the template's TRACEABILITY section: declared surfaces + **the UI entry
point that mounts the feature** (button/menu/hotkey + file:line) + a 2–3 sentence owner
WALKTHROUGH. "Backend ships, UI unreachable" is the #1 recurring failure class in three
months of UAT — this line is its standing cure.

## 6 · CI wiring constraint

`.github/workflows/**` edits require manual owner merge. Therefore every gate ships as a
**vitest-wrapped test** (rides the existing `npx vitest run` CI step — the hex-ratchet
precedent) or as a Playwright spec in the existing e2e job. Plan any true workflow edit
(e.g. widening the per-PR spec set for baselines) as an explicit owner-merge item.
