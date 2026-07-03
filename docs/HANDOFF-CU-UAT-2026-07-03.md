# HANDOFF — Parallel CU-UAT Session (2026-07-03)

**For:** the session driving computer-use UAT on the running Creatrix app.
**From:** the docs/bugfix session (audit + fixes). **This session does NOT drive the screen.**

## 1. Where the plan is (all on `main` once PR #410 merges — docs-only)
| Doc | Role | Drive? |
|---|---|---|
| `docs/UAT-PLAN-2026-07-02-live-cu.md` | **EXECUTION plan** — Stages A–K + N/E/X/C + live UI map + salvaged key-map/riders + watchlist | ✅ primary |
| `docs/UAT-COMPREHENSIVE-AUDIT-2026-07-03.md` | DISCOVERY — 6-subsystem matrices, gap-enrichment (20 surfaces), Don-Norman + CDO passes, bug register, GO/NO-GO | read first |
| `docs/UAT-FEATURE-FLAG-AUDIT-2026-07-03.md` | per-flag round-trip protocol (Stage FLAGS) — **re-grep `frontend/src/shared/feature-flags.ts` at CU start** | ✅ Stage input |
| `docs/UAT-RESULTS-2026-07-03.md` | **RESULTS ledger — APPEND your verdicts here** | ✅ write target |
> Full tier/doc map (what's canonical vs stale): the audit's "COHESION PASS" section. The 89 KB `UAT-UIT-GUIDE.md` is baseline-but-stale (banner tells you what it does NOT cover).

## 2. Runtime + baseline corrections (read before Stage A)
- **Runtime:** local Electron build from `~/Development/entropic-v2challenger/frontend` (out/main). Store-shape changes need kill+relaunch (HMR won't rehydrate).
- **B3 layout is DEFAULT-ON** (#398 merged) — the app's default IS the B3 grid + LayerPanel. Name the `F_CREATRIX_LAYOUT` state in EVERY layout-affected verdict (A5, A7b, E, G). Compare legacy via `localStorage.setItem('entropic-disable-creatrix-layout','1')` + relaunch.
- **Shipped key-map (journeys diverge — use THESE):** `w`=lasso (not `g`), key+wand = **click-only** (no hotkey), `v`=Select (no view-cycle). Full table: plan's SALVAGED ADDENDUM. Driving with spec keys = false-fail.

## 3. Pre-classified — do NOT burn CU time hunting (file as 🐛 only if behavior differs)
- **MK.13 mode-banner** — UNSHIPPED (grep-verified zero component). Stage F.2 is DEFERRED, not a gate.
- **rubylith / matte view modes** — UNSHIPPED → J2 j2-03/j2-06 + `view:matte` chip are expected 🐛.
- **range-select cursor tool** — CUT in T5 (rangeSelectClips store action survives, no tool binding). A7c: do NOT test a range cursor tool.
- **export e2e cluster red** = TEST-ENV (security.py blocks os.tmpdir() outputs), NOT an app bug — exports to ~/Desktop are fine; do NOT down-verdict C1/C6/J5.

## 4. Bugs already IN FLIGHT — do NOT re-file (fixes under validation this session)
| Bug | What | PR |
|---|---|---|
| #29 (P0) | ripple/split don't rebase clip-transform automation | #411 |
| #30/B7 (P0) | loadProject dirty-gate stub → Welcome/recent bypass + corrupt-load toasts | #413 |
| #28/C15 | modulation clamps non-[0,1] params to [0,1]; depth range mismatch | #414 |
| E18 | MIDImix factory profile orphaned (no UI) | #412 |
| AA.3-B | audio-follower lanes + export SR parity | #415 |
> These 6 are validated-then-merged by THIS session. If you observe them live, note "matches known #NN (fix in flight)" — don't open a new task. The full flagged register (silent no-ops, freeze-mutation gaps, export-not-pressure-gated…) is task #31 + the audit — verify-don't-refile.

## 5. Coordination (two sessions, one repo)
- **Do NOT `git pull` the canonical source checkout** while a CU pass runs — a source pull triggers Vite HMR mid-pass. Docs-only merges are safe.
- This session merges ONLY docs + the 6 validated fix PRs (server-side, no app). It will not touch your running runtime.
- Never pkill-by-name (both sessions run python/node).

## 6. GO/NO-GO (from the audit, spans all four layers)
GO needs: the register bugs fixed/accepted; cross-cutting gates (parity, automation coherence, no-silent-data-loss, composability, caps, master) spot-checked; G1/G7/G5/G10 spot-checks; DN2/DN4.2 zero-FAIL; CD focus-visible recorded; UIT-guide retry-list triaged. **A green happy-path with a failing parity/data-loss/composability case is a NO-GO.**

## 7. Plan integrity
Plan file last commit: `0fc33f6` on branch `docs/uat-comprehensive-audit` → merging to main via PR #410.

---

## 8. OPEN ITEMS LEDGER (complete — nothing lives only in a session task-tracker)
Snapshot 2026-07-03 after the automation/master-bus campaign + audit landed on main.

**Campaign = DONE and on main:** automation suite (AA.1–AA.6), audio-follower lanes (AA.3-B),
Master-Out Bus (M.1–M.3), B3 layout (default-ON), whole-app UAT audit + plan + this handoff. All 5
audit-found bugs (#28/C15, #29, #30/B7, E18) fixed, independently validated (bug reproduced-on-main,
then fixed), and merged.

**Open — for the CU / next session:**
| # | Item | Where it lives | Owner |
|---|---|---|---|
| #1 | Run CU-UAT Stages A–K + N/E/X/C | `UAT-PLAN-2026-07-02-live-cu.md` + this handoff | CU session |
| #31 | Flagged findings register (silent no-ops = Nielsen-1 feedback fails, freeze-vs-chain-mutation gap, device-group dangling ids, no server-side double-bake lock, export NOT pressure-gated → parity risk, text no-wrap, silent font fallback, MIDI-learn no arm-timeout, eyedropper black fallback, F7 routing-cycle guard gap, F2 hardware-CC-vs-automation-record) | `UAT-COMPREHENSIVE-AUDIT-2026-07-03.md` (FLAGGED register) | verify-then-fix |
| #26 | sg3-aborted lanes filtered in preview but NOT export bake (preview≠export) | plan watchlist L306 | fix |
| #27 | quarantined 'master-pinned-last' timeline-ui test — re-enable order-independently | plan watchlist L308 | test |
| #15 | e2e-full suite broadly red = TEST-ENV (security.py blocks os.tmpdir() exports), NOT app bug; smoke is the merge gate | plan watchlist L307 + salvaged addendum | test-infra; needs a dedicated app/Playwright session (opens windows) |
| #7 | Q7 harness: verdict gate never measures under load (runner.py:190 vs :205) — Q7 track, NOT this campaign | THIS ledger (only durable record) | Q7 session |

**Needs the repo owner (cannot be agent-merged):**
| PR | Why blocked |
|---|---|
| #416 | perf(tests) LayerTap routing-budget harness — **touches `.github/workflows/`**, so workflow-change-guard requires MANUAL merge via the GitHub UI. Validated + smoke-green + MERGEABLE; one click. Opt-in/nightly, nothing depends on it. |

**Design/UX backlog (from the Don-Norman + CDO expert passes, not bugs):** modifier-consistency sweep,
the three-"freeze" naming collision, focus-visible 8-state gap, hit-target measurements — all in the
audit's EXPERT PASS sections, feeding Stage E's ranked papercut list.
