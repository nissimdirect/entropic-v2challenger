# Work Packets — Phase 8 (Tier 6: `.dna`/E2 + SG-2 + SG-6 + A2 Genoscope + E8) and Phase 9 (Tier 7: SG-9 + E7 Plugin SDK)

**Authored:** 2026-06-11 · **Base for all packets:** `origin/main` @ `d821ae8` (verified). If `origin/main` has moved when you pick a packet up, re-run that packet's PRECONDITIONS — they are the contract, not the SHA.
**Repo:** `~/Development/entropic-v2challenger` (GitHub: `nissimdirect/entropic-v2challenger`).
**Sources of truth:** `docs/roadmap/specs/entropic-spec-6-dna-format.md` (SPEC-6) · `docs/roadmap/specs/entropic-spec-3-safety-gates.md` (SPEC-3) · `docs/roadmap/plans/entropic-synth-paradigm-vision.md` (vision §6, §8, §10) · draft PR #139 (`feat/q7-dna-format`, worktree `~/Development/entropic-q7-dna`).

**Conventions for every packet:**
- Work in a fresh worktree: `git -C ~/Development/entropic-v2challenger worktree add ~/Development/creatrix-<id>-wt -b <branch> origin/main`
- Backend tests: `cd backend && python -m pytest -x -n auto --tb=short` · Frontend: `cd frontend && npx --no vitest run` (the `--no` is mandatory per repo CLAUDE.md)
- Each packet ships as its OWN PR (SPEC-3 §9: "Bundling gates with feature work increases blast radius")
- **CHERRY-PICK RULE (G5):** `feat/q7-dna-format` is **32 ahead / 16 behind** `origin/main` (merge-base `839345f`, stale). NEVER raw-merge or rebase that branch. Enumerate payload with `git log origin/main..feat/q7-dna-format --oneline`; cherry-pick only the named commit(s) onto a fresh branch.

**Tier gating (vision §8 table):** Tier 6 hard-blocks on SG-2 (ships inside E2), SG-6, SG-7 (✅ merged #149). A2 build (not spike/spec) additionally depends on Q7 REAL verdict (G1, user-blocked) + B1 (✅ #148) + A4 (✅ #162). Tier 7 hard-blocks on SG-9. The `.dna` format itself is **independent** (SPEC-6 §12) and can start any time.

---

## P8.1 — DECISION: reconcile draft-#139 `.dna` binary format + budget shape against SPEC-6

- **ID:** P8.1 · **branch:** `docs/dec-dna-001-format-reconcile` · **base:** `origin/main`
- **depends-on:** none (first packet; everything in P8 downstream of it)
- **goal:** A signed-off decision record resolving the two material divergences between the shipped draft code and SPEC-6, so build packets don't implement two formats.
  - **Divergence 1 — header:** draft #139 `codec.py:39` uses `MAGIC = b"DNA1"` + uint32-LE gzip length; SPEC-6 §3.1 specifies 8-byte magic `ENTR\1DNA` + version:u8 + flags:u8 (bit 0 = Ed25519-signed) + 6 reserved bytes.
  - **Divergence 2 — budget shape:** draft `budget.py` uses capability-requirements (`estimated_memory_mb`, `estimated_gpu_textures`, `estimated_grains`, `requires_l_backbones`, `min_apple_silicon_tier`); SPEC-6 §5 specifies versioned ceilings (`budget.schema_version`, `max_grain_count`, `max_recursion_depth`, `max_vram_bytes`, `max_cpu_ms_per_frame`, `max_chain_length`, `max_field_resolution_px`, `max_total_edges`).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-q7-dna log -1 --format=%h%s 9ab2ea4   # expect: 9ab2ea4 "[q7] feat: PR #21 .dna patch format scaffold + SG-2 budget (21 tests)"
  git -C ~/Development/entropic-q7-dna show 9ab2ea4:backend/src/dna/codec.py | grep -n 'MAGIC = b"DNA1"'   # expect line 39
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna    # expect EMPTY (dna/ not on main)
  ```
- **scope (VERIFIED paths):** writes ONLY `docs/decisions/DEC-DNA-001-format-reconcile.md` (new file; `docs/decisions/` exists on main).
- **DO-NOT-TOUCH:** any code; `feat/q7-dna-format` branch; SPEC-6 itself.
- **steps:** (1) Read SPEC-6 §3/§5 + `9ab2ea4` diff side-by-side. (2) Write decision doc with a recommendation (default recommendation: **SPEC-6 wins on header** — version/flags bytes are needed for signing + format evolution; **both budget shapes ship** — SPEC-6 `max_*` ceilings as the normative `budget` block, draft `estimated_*`/`requires_*` retained as a sibling `requirements` block since they answer a different question: "can this device run it" vs "what may this patch consume"). (3) Present both options + recommendation to user; record the user's choice verbatim. (4) Update SPEC-6 addendum section if the choice deviates from spec.
- **TEST PLAN:** n/a (docs). `ls docs/decisions/DEC-DNA-001-format-reconcile.md` exists; doc contains a "Decision" section with exactly one chosen option and the user's confirmation quoted.
- **ACCEPTANCE GATES:** decision doc merged; every downstream P8 packet's header/budget references resolve to one format.
- **ROLLBACK:** revert the docs commit.
- **EVIDENCE:** PR link + user confirmation message quoted in the doc.
- **Effort:** ~1h.

---

## P8.2 — Cherry-pick `.dna` scaffold (draft #139 payload) onto fresh branch ⚠ RISK:HIGH

- **ID:** P8.2 · **branch:** `feat/dna-scaffold` · **base:** `origin/main`
- **depends-on:** P8.1
- **goal:** The 4-file payload of draft #139 (`backend/src/dna/{__init__,codec,budget}.py` + 21 tests, 611 insertions) lands on a fresh branch from current main, tests green, draft #139 closed with a pointer.
- **RISK:HIGH** — stale merge-base hazard (`feedback_cherry-pick-stale-scaffold-branches.md`): the branch is 16 behind main; a raw merge would falsely revert ~16 commits of merged work (A4/A5/C4 spectral, SG gates).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && git fetch origin
  git rev-list --count origin/main..feat/q7-dna-format    # expect 32 (±0 unless branch touched)
  git rev-list --count feat/q7-dna-format..origin/main    # expect 16+ (confirms staleness — cherry-pick only)
  git show --stat --format="" 9ab2ea4 | tail -5            # expect exactly 4 files: backend/src/dna/{__init__,codec,budget}.py + backend/tests/test_q7_benchmark/test_dna_format.py
  git ls-tree origin/main backend/src/dna                  # expect EMPTY
  ```
- **scope (VERIFIED paths):** `backend/src/dna/__init__.py`, `backend/src/dna/codec.py`, `backend/src/dna/budget.py` (all new), test file **relocated** from `backend/tests/test_q7_benchmark/test_dna_format.py` → `backend/tests/test_dna/test_dna_format.py` (the `test_q7_benchmark/` dir does not exist on main and must not be created for non-q7 code).
- **DO-NOT-TOUCH:** anything outside `backend/src/dna/` + `backend/tests/test_dna/`; do not bring any other commit from `feat/q7-dna-format`; do not modify `zmq_server.py` yet (no IPC wiring in this packet).
- **steps:** (1) `git worktree add ~/Development/creatrix-p82-wt -b feat/dna-scaffold origin/main`. (2) `git cherry-pick 9ab2ea4`. (3) Resolve conflicts if any (expected: none — files are new). (4) `git mv backend/tests/test_q7_benchmark/test_dna_format.py backend/tests/test_dna/test_dna_format.py` (+ `__init__.py` if needed). (5) Fix imports/markers so the suite collects under main's pytest config (`pyproject.toml` testpaths=`tests`). (6) Run full backend suite. (7) Open PR; comment on draft #139 linking the fresh PR; close #139 after merge.
- **TEST PLAN:**
  ```
  cd backend && python -m pytest tests/test_dna/test_dna_format.py -v --tb=short   # 21/21 pass, incl. test names: round-trip, unknown-field preservation x2 round-trips, bad-magic, truncated header/payload, DNAVersionError
  cd backend && python -m pytest -x -n auto --tb=short                              # full suite, zero regressions
  ```
- **ACCEPTANCE GATES:** 21/21 dna tests green on fresh branch; full backend suite green; PR diff contains ONLY the 4 files (+ test `__init__`); CI green.
- **ROLLBACK:** `git revert` the merge commit — `backend/src/dna/` is self-contained with zero callers at this point.
- **EVIDENCE:** PR link; pytest output pasted; `git log origin/main..feat/dna-scaffold --oneline` showing the single cherry-picked commit (+fixups).
- **Effort:** ~2h.

---

## P8.3 — `.dna` header conformance per DEC-DNA-001

- **ID:** P8.3 · **branch:** `feat/dna-header-v1` · **base:** `origin/main` (after P8.2 merges)
- **depends-on:** P8.1, P8.2
- **goal:** `codec.py` implements the decided header (default: SPEC-6 §3.1 — magic `ENTR\1DNA` (8B) + version u8 (`0x01`) + flags u8 (bit0=signed) + 6 reserved bytes + gzipped JSON), with a one-time migration reader for any `DNA1`-format files written by the scaffold.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna/codec.py   # must EXIST (P8.2 merged)
  grep -n "Decision" docs/decisions/DEC-DNA-001-format-reconcile.md                          # decision recorded
  ```
- **scope (VERIFIED paths):** `backend/src/dna/codec.py`, `backend/tests/test_dna/test_dna_format.py` (extend), new `backend/tests/test_dna/test_dna_header.py`.
- **DO-NOT-TOUCH:** `budget.py` (that's P8.4); any frontend; `zmq_server.py`.
- **steps:** (1) Implement decided header layout in `read_dna`/`write_dna`. (2) Reader accepts legacy `DNA1` magic → parses + flags `legacy_header=True` (write path always emits new header). (3) Flags bit0 reserved-but-unset until P8.7. (4) Reject version bytes > supported with `DNAVersionError`. (5) Fuzz the first 16 bytes (truncation at every offset).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_dna/ -v` — named tests: `test_header_magic_entr1dna`, `test_legacy_dna1_readable`, `test_version_byte_unsupported_raises`, `test_flags_bit0_roundtrip`, `test_truncation_at_each_header_offset`. Full suite green.
- **ACCEPTANCE GATES:** SPEC-6 acceptance item "Magic bytes + version header read/write correct" checked; legacy scaffold files still load; all dna tests green.
- **ROLLBACK:** revert PR; format has no external consumers yet.
- **EVIDENCE:** PR + pytest output + hexdump of a written sample file showing the 16-byte header.
- **Effort:** ~3h.

---

## P8.4 — SG-2 budget descriptor v1.0.0 (versioned ceilings + apply-time validator + writer auto-compute)

- **ID:** P8.4 · **branch:** `feat/dna-sg2-budget` · **base:** `origin/main` (after P8.3)
- **depends-on:** P8.1, P8.2, P8.3
- **goal:** SG-2 lands per SPEC-6 §5 + DEC-DNA-001: versioned `budget` block with `schema_version` + the 7 `max_*` keys; `validate_patch_budget(patch, system)` returns violations list; consent-bypass records a project flag; writer auto-computes minimum budget and forbids loosening (user may only tighten). Draft `estimated_*` fields handled per DEC-DNA-001.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna/budget.py   # EXISTS
  grep -n "max_grain_count" docs/roadmap/specs/entropic-spec-6-dna-format.md                  # spec keys present
  ```
- **scope (VERIFIED paths):** `backend/src/dna/budget.py` (rewrite), new `backend/src/dna/validators.py` (SPEC-6 §9: apply-time validators — budget + non-finite-numeric rejection + raw-size cap <50MB pre-parse), `backend/tests/test_dna/test_budget.py`, `backend/tests/test_dna/test_validators.py`.
- **DO-NOT-TOUCH:** frontend; IPC; signing.
- **steps:** (1) `BudgetDescriptor` v1.0.0 with `schema_version` + 7 ceilings; unknown future budget keys preserved verbatim (forward compat, SPEC-6 §4.1.6). (2) `validate_patch_budget` per SPEC-6 §5.3 pseudocode. (3) NaN/Inf rejection at load (SPEC-6 §8 row 5). (4) 50MB raw-size cap before gzip-decompress AND before JSON parse (zip-bomb guard: also cap decompressed size, suggest 200MB). (5) Writer-side `compute_minimum_budget(project)` + tighten-only override.
- **TEST PLAN:** `cd backend && python -m pytest tests/test_dna/ -v` — named tests (SPEC-6 §10.4): `test_apply_rejected_when_grain_count_exceeds_budget`, `test_apply_bypassable_with_user_consent`, `test_writer_auto_computes_minimum_budget`, plus `test_unknown_budget_keys_preserved`, `test_nonfinite_numeric_rejected_at_load`, `test_raw_size_cap_rejects_oversized`, `test_decompressed_size_cap` (zip bomb).
- **ACCEPTANCE GATES:** SPEC-6 acceptance items "SG-2 budget validator rejects out-of-budget patches" + security rows 1/4/5 covered by named tests; full backend suite green.
- **ROLLBACK:** revert PR (still zero production callers until P8.9/P8.10 UI).
- **EVIDENCE:** PR + pytest output naming all 7 tests.
- **Effort:** ~4h.

---

## P8.5 — Unknown-fields preservation + migrations + cross-version compat

- **ID:** P8.5 · **branch:** `feat/dna-compat` · **base:** `origin/main` (after P8.4)
- **depends-on:** P8.3, P8.4
- **goal:** SPEC-6 §4 in full: `_unknown` shadow maps on every section (Lane/ModEdge/Effect/Operator/Macro/Budget/top-level), `_legacy` shadow on migrated fields, versioned migration registry (`migrations.py`), byte-identical round-trip, defaults for missing fields (`binding_rule`→`broadcast`, `direction`→1, `domain`→`t` per SPEC-6 §4.2.1), unknown-binding-rule read policy (warn + evaluate-as-broadcast + preserve original, §4.1.5).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && python3 -c "import gzip"   # stdlib sanity
  git ls-tree origin/main backend/src/dna/validators.py                 # P8.4 merged
  git grep -n "binding_rule" origin/main -- frontend/src/shared/types.ts | head -3   # SPEC-2 schema on main (shipped #148) — field names must match .dna sections
  ```
- **scope (VERIFIED paths):** new `backend/src/dna/migrations.py`, new `backend/src/dna/reader.py` + `backend/src/dna/writer.py` (split read/write out of `codec.py` per SPEC-6 §9 inventory, or keep in codec.py if <400 lines — implementer's call, record in PR body), `backend/tests/test_dna/test_compat.py`, fixture patches under `backend/tests/test_dna/fixtures/*.dna`.
- **DO-NOT-TOUCH:** frontend; budget semantics (done in P8.4).
- **steps:** (1) `_unknown` shadow per section, round-tripped on save. (2) Migration registry keyed by `schema_version` with sample-patch fixtures per version. (3) Defaults table. (4) Unknown-enum read policy. (5) Byte-identity round-trip test (modulo signature block).
- **TEST PLAN:** named tests from SPEC-6 §10.1–10.3: `test_round_trip_preserves_byte_identity`, `test_round_trip_with_unknown_field_preserved`, `test_v30_reader_loads_v35_authored_patch_with_warnings`, `test_unknown_binding_rule_treats_as_broadcast_with_warning`, `test_v30_patch_loads_in_v35`, `test_legacy_field_renames_preserved_in_shadow`. `cd backend && python -m pytest tests/test_dna/ -v` all green + full suite.
- **ACCEPTANCE GATES:** SPEC-6 acceptance items: round-trip byte-identity ✓, unknown fields preserved ✓, forward compat ✓, backward compat via migration ✓.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + pytest output + a fixture `.dna` with injected future field shown surviving 2 round-trips.
- **Effort:** ~4h.

---

## P8.6 — CI lint: `scripts/lint_dna_schema.py` (5 rules) + workflow wiring

- **ID:** P8.6 · **branch:** `ci/dna-lint` · **base:** `origin/main` (after P8.5)
- **depends-on:** P8.5
- **goal:** The no-regression enforcement (SPEC-6 §6): Lint-1 schema additions optional · Lint-2 `_unknown` map never removed · Lint-3 enum additions require migration test + changelog · Lint-4 `dna_schema.json` change requires `schema_version` bump same-PR · Lint-5 every schema version has migration fn + old-patch load test. Wired into CI.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree --name-only origin/main .github/workflows   # expect ONLY test.yml — add dna-lint as a new job/workflow, do not rewrite test.yml wholesale
  git ls-tree origin/main backend/src/dna/migrations.py                                           # P8.5 merged
  ```
- **scope (VERIFIED paths):** new `scripts/lint_dna_schema.py` (repo-root `scripts/` exists on main), new `backend/src/dna/dna_schema.json` (canonical schema, SPEC-6 §9), new `.github/workflows/dna-lint.yml` (NOTE: per the user's standing rule, **workflow files must be merged manually by the user via GitHub UI** — flag this in the PR body), `backend/tests/test_dna/test_lint_rules.py` (lint self-tests with synthetic diffs).
- **DO-NOT-TOUCH:** `.github/workflows/test.yml` beyond (optionally) nothing — prefer a separate workflow file; `backend/src/dna/*.py` runtime code.
- **steps:** (1) Implement the 5 checks operating on `git diff origin/main...HEAD` + repo state. (2) Fixture-based self-tests: a synthetic diff adding a required field must fail Lint-1, etc. (3) Workflow runs lint on PRs touching `backend/src/dna/**` or `frontend/src/shared/types.ts`. (4) Exit non-zero fails CI.
- **TEST PLAN:** named tests (SPEC-6 §10.6): `test_lint_fails_on_required_new_field`, `test_lint_fails_on_enum_value_without_migration_test`, `test_lint_passes_on_optional_additive_change`, `test_lint_fails_on_schema_change_without_version_bump`. Manual: `python3 scripts/lint_dna_schema.py --base origin/main` exits 0 on clean tree.
- **ACCEPTANCE GATES:** all 5 rules implemented + self-tested; lint runs in CI on a probe PR and is observed both failing (synthetic violation commit, then dropped) and passing.
- **ROLLBACK:** delete workflow file (user-merged) + revert script PR; no runtime impact.
- **EVIDENCE:** PR + CI run links showing one red (probe) and one green run.
- **Effort:** ~4h.

---

## P8.7 — Ed25519 signing (optional, flags bit0)

- **ID:** P8.7 · **branch:** `feat/dna-signing` · **base:** `origin/main` (after P8.3)
- **depends-on:** P8.3 (flags byte); independent of P8.4–P8.6
- **goal:** `backend/src/dna/signing.py`: sign-on-export (opt-in), verify-on-import; signature block appended after gzip body; flags bit0 set; tamper → verification failure surfaced as a warning (signing OPTIONAL at Tier 6 per SPEC-6 §2; becomes mandatory only for Tier 7 marketplace per SG-9 — P9.4 reuses this module).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger show origin/main:backend/pyproject.toml | grep -c cryptography   # expect 0 → this packet ADDS the dependency; if non-zero, re-read before adding
  git ls-tree origin/main backend/src/dna/codec.py    # P8.2/P8.3 merged
  ```
- **scope (VERIFIED paths):** new `backend/src/dna/signing.py`, `backend/pyproject.toml` (add `cryptography>=43` to `dependencies` — **Infra Change Gate:** note the new dep in PR body; only consumer is `dna/`), `backend/src/dna/codec.py` (read/write signature block when bit0 set), `backend/tests/test_dna/test_signing.py`. Key storage: `~/.creatrix/keys/dna_ed25519` (0600) — generate-on-first-sign.
- **DO-NOT-TOUCH:** frontend; budget/migrations.
- **steps:** (1) Keypair gen + storage. (2) Sign gzip-body bytes (not header) → 64-byte sig + 32-byte pubkey appended. (3) Verify on read when bit0 set; bad sig → `signature_valid=False` on patch object + warning (do NOT hard-reject at Tier 6). (4) Round-trip preserves signature unless content changed (resign prompt deferred to UI packet).
- **TEST PLAN:** named tests: `test_sign_then_verify_ok`, `test_tampered_body_fails_verify`, `test_unsigned_file_bit0_clear`, `test_signed_roundtrip_preserves_signature`, `test_key_file_permissions_0600`. Full backend suite green (new dep installed: `cd backend && pip install -e ".[dev]"`).
- **ACCEPTANCE GATES:** SPEC-6 acceptance "Optional Ed25519 signing + verification works"; dependency addition called out in PR body with dependency map.
- **ROLLBACK:** revert PR; remove dep.
- **EVIDENCE:** PR + pytest output + `ls -l ~/.creatrix/keys/` permissions shown.
- **Effort:** ~3h.

---

## P8.8 — Auto-remap engine (backend, pure functions)

- **ID:** P8.8 · **branch:** `feat/dna-remap` · **base:** `origin/main` (after P8.5)
- **depends-on:** P8.5
- **goal:** SPEC-6 §7 remap table as a pure backend module: given (patch, project-state snapshot) → remap proposal {auto-applied | needs-user-choice | skipped} per target, no UI (UI consumes it in P8.9).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna/reader.py backend/src/dna/migrations.py   # P8.5 merged (or codec.py if not split — check P8.5 PR body)
  git grep -n "class Track\|interface Track" origin/main -- frontend/src/shared/types.ts | head -2                          # track shape for remap targets
  ```
- **scope (VERIFIED paths):** new `backend/src/dna/remap.py`, `backend/tests/test_dna/test_remap.py`.
- **DO-NOT-TOUCH:** frontend; zmq_server.py (IPC lands with P8.9).
- **steps:** (1) Effect-ID remap: single matching-type effect → auto-remap with mapping report. (2) Track remap: compatible-type selected track → propose; else enumerate candidates. (3) Multiple plausible → return choice list. (4) No match → skip + warning. All outcomes serializable for IPC.
- **TEST PLAN:** named tests (SPEC-6 §10.5): `test_single_plausible_remap_auto_applied_with_notification`, `test_multi_remap_prompts_user`, `test_no_match_skips_with_warning`, plus `test_remap_report_serializable`.
- **ACCEPTANCE GATES:** SPEC-6 acceptance "Auto-remap works for plausible mismatches" (backend half); full suite green.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + pytest output.
- **Effort:** ~3h.

---

## P8.9 — Patch IMPORT path: IPC + `PatchImportDialog` + drag-drop

- **ID:** P8.9 · **branch:** `feat/dna-import-ui` · **base:** `origin/main` (after P8.4, P8.5, P8.8)
- **depends-on:** P8.4, P8.5, P8.8 (P8.7 optional — verify-if-signed)
- **goal:** User can apply a `.dna`: File menu + drag-drop → IPC `dna_import` → validators (SG-2 + size caps) → remap proposal → `PatchImportDialog.tsx` shows budget verdict + remap UI → apply writes into stores via existing actions. Budget violation → toast with violations + "Apply anyway" consent (SPEC-6 §5.3).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "elif cmd ==" origin/main -- backend/src/zmq_server.py | head -3   # IPC dispatch pattern exists
  git ls-tree origin/main backend/src/dna/remap.py backend/src/dna/validators.py                                        # P8.4 + P8.8 merged
  git grep -rn "dangerouslySetInnerHTML" origin/main -- frontend/src/renderer/components | wc -l                        # expect 0 — keep it that way (toast XSS rule)
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py` (add `dna_import` command following the existing `elif cmd ==` dispatch + `_handle_*` pattern, e.g. `audio_meter` at :342/:1028), new `frontend/src/renderer/components/dna/PatchImportDialog.tsx`, IPC relay typing (follow existing command plumbing in `frontend/src/main/` + `frontend/src/shared/types.ts`), `frontend/src/__tests__/components/dna-import.test.tsx`, `backend/tests/test_dna/test_ipc_import.py`.
- **DO-NOT-TOUCH:** export path (P8.10); undo internals — wrap store mutations with existing `undoable()` from `stores/undo.ts` (history-buffer rule); no new Zustand store unless ≤1 existing store fits poorly (record in PR body).
- **steps:** (1) Backend handler: read → validate (size caps BEFORE decompress) → budget check → remap report → return proposal; apply step is a second IPC call with user's remap/consent choices. (2) Dialog: violations list, remap checkboxes (SPEC-6 §7), preview-before-commit. (3) File menu entry + drag-drop onto app window. (4) Toasts per toast conventions (`source` field required). **Gate 14 wiring check:** entry AND cancel paths; legacy/empty project load.
- **TEST PLAN:**
  ```
  cd backend && python -m pytest tests/test_dna/test_ipc_import.py -v    # named: test_import_returns_proposal, test_import_rejects_oversize, test_apply_with_consent_flag_recorded
  cd frontend && npx --no vitest run src/__tests__/components/dna-import.test.tsx   # named: shows violations, remap choice round-trips, cancel leaves stores untouched
  cd frontend && npx --no vitest run   # full frontend suite
  ```
- **ACCEPTANCE GATES:** SPEC-6 acceptance "Patch import UI accessible from File menu + drag-drop"; import <1s for typical patch (time it in test with a fixture); applying a patch is one undo entry.
- **ROLLBACK:** revert PR — IPC command removal is safe (no other callers; verify `git grep -rn "dna_import"` before revert).
- **EVIDENCE:** PR + both test outputs + screen recording or screenshot of dialog applying a fixture patch (Live Runtime Check: name the runtime path).
- **Effort:** ~4h.

---

## P8.10 — Patch EXPORT path: IPC + `PatchExportDialog` + budget editor

- **ID:** P8.10 · **branch:** `feat/dna-export-ui` · **base:** `origin/main` (after P8.9)
- **depends-on:** P8.4, P8.5, P8.9 (shares IPC plumbing); P8.7 for "sign this patch" checkbox
- **goal:** User exports current project's recipe as `.dna`: `dna_export` IPC serializes effect graph + operators + mod_edges + lanes + macros (NO source content, SPEC-6 §2); budget auto-computed, user may tighten only; optional sign checkbox.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "dna_import" origin/main -- backend/src/zmq_server.py   # P8.9 merged
  git grep -n "modRoutes" origin/main -- frontend/src/shared/types.ts | head -2                              # INJ-1 field name (Pad.mappings→modRoutes shipped #152) — export must use modRoutes
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py` (`dna_export` handler), new `frontend/src/renderer/components/dna/PatchExportDialog.tsx`, `frontend/src/__tests__/components/dna-export.test.tsx`, `backend/tests/test_dna/test_ipc_export.py`.
- **DO-NOT-TOUCH:** import path; project save format (`.entropic`/project-persistence) — `.dna` is a separate artifact.
- **steps:** (1) Serializer maps live project state → `.dna` sections (omit sources/history/identity per SPEC-6 §2 table). (2) Budget auto-compute via P8.4. (3) Dialog: name/description/author, budget editor (tighten-only), sign toggle. (4) Round-trip test: export → import into empty project → chain shape equal.
- **TEST PLAN:** backend named: `test_export_omits_source_content`, `test_export_budget_reflects_project`, `test_export_import_roundtrip_chain_equal`; frontend named: budget editor cannot loosen, dialog writes file via save-path validation (`file-handlers.ts` prefix rules). Full suites green.
- **ACCEPTANCE GATES:** SPEC-6 acceptance "Patch export UI accessible + lets user set budget"; export <1s typical; exported fixture committed as test fixture for future migration tests (Lint-5 feed).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + test outputs + a real exported `.dna` attached to the PR.
- **Effort:** ~4h.

---

## P8.11 — SG-6: cooperative cancellation contract (library + contract tests)

- **ID:** P8.11 · **branch:** `feat/sg6-cancellation` · **base:** `origin/main`
- **depends-on:** none (independent; REQUIRED before P8.14 A2 build)
- **goal:** The SG-6 contract from vision §10: a reusable `CancelToken` primitive — long-running workers yield a cancel-check every N frames/iterations; UI Stop propagates with a hard 5s deadline (worker that doesn't yield within 5s is forcibly terminated + logged). SPEC-3 §6 deferred the SG-6 spec "until Genoscope starts" — this packet IS that start; it includes a 1-page contract doc.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -rn "SG-6" origin/main -- docs | head -3        # confirm no existing SG-6 implementation doc on main
  git grep -rln "CancelToken\|cancel_token" origin/main -- backend/src | head -3                  # expect EMPTY — greenfield
  ```
- **scope (VERIFIED paths):** new `backend/src/cancellation.py` (token + deadline supervisor; threading + multiprocessing variants), new `backend/tests/test_cancellation.py`, new `docs/decisions/DEC-SG6-001-cancellation-contract.md` (API surface, N-frames default, enforcement point, owner — the four columns SPEC-3 uses for each gate).
- **DO-NOT-TOUCH:** existing render/export paths (adoption is opt-in per-worker, wired when A2/Genoscope and long exports adopt it); zmq_server.py.
- **steps:** (1) `CancelToken.check()` raising `CancelledError`; `CancelToken.cancel()` thread/process-safe. (2) Deadline supervisor: cancel → wait ≤5s → SIGTERM the worker process + structured log. (3) Decorator/helper `yield_every(n)` for frame loops. (4) Contract doc.
- **TEST PLAN:** `cd backend && python -m pytest tests/test_cancellation.py -v` — named: `test_cancel_within_deadline_clean_exit`, `test_non_yielding_worker_terminated_at_5s`, `test_cancel_check_every_n_frames`, `test_multiprocessing_token_propagates`, `test_cancel_idempotent`. The 5s test must use a real subprocess (no mock-only timing).
- **ACCEPTANCE GATES:** all contract tests green incl. real-subprocess kill; doc merged; ROADMAP SG-6 row flips ❌→✅(lib).
- **ROLLBACK:** revert PR — zero callers.
- **EVIDENCE:** PR + pytest output showing the timed 5s termination test.
- **Effort:** ~4h.

---

## P8.12 — A2 Genoscope SPIKE → measured feasibility report (research-class, spike #1 of chain)

- **ID:** P8.12 · **branch:** `spike/genoscope-feasibility` · **base:** `origin/main`
- **depends-on:** P8.11 (uses CancelToken in the harness); NOT blocked on Q7 verdict (uses synthetic fitness)
- **goal:** **A written feasibility report with measured numbers** — not "research genetic algorithms". Deliverable: `docs/decisions/DEC-A2-001-genoscope-spike.md` answering, with measurements on this Mac: (a) genome encoding — can a patch (effect graph + mod_edges + lanes, SPEC-2 schema shapes) round-trip through a flat genome and back, for ≥20 of the 214 registered effects? (b) throughput — evaluations/sec for pop=64 with a synthetic fitness (frame-render of a 360p still through a 3-effect chain), measured; (c) projected wall-clock for pop 64 × 100 gens at that throughput; (d) memory ceiling for 64 concurrent candidate chains; (e) mutation/crossover operator inventory over the real effect registry (param-perturb, effect-swap, edge-rewire, chain-splice) with closure rules; (f) cancellation: harness aborts cleanly via SG-6 token mid-generation.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -rli "genoscope" origin/main -- backend/src frontend/src | wc -l   # expect 0 — greenfield
  git ls-tree origin/main backend/src/cancellation.py                                                                # P8.11 merged
  cd ~/Development/entropic-v2challenger/backend && python -c "from effects.registry import *" 2>&1 | head -1        # adjust import to actual registry module; STOP if effects registry not importable headless
  ```
- **scope (VERIFIED paths):** spike code quarantined under new `backend/scripts/genoscope_spike/` (pattern: `backend/scripts/demo_trilogy/` exists on main for exactly this kind of runner) + the report doc. Spike code is throwaway-grade but committed for reproducibility.
- **DO-NOT-TOUCH:** `backend/src/**` (no production modules from a spike); frontend.
- **steps:** (1) Minimal genome codec for a patch subset. (2) GA loop (pop 64, tournament select, the 4 operator types) against synthetic fitness. (3) Run 10 generations, record throughput/memory (use `resource.getrusage`). (4) Abort test via CancelToken. (5) Write report with the 6 measured answers + a GO/NO-GO-shaped recommendation for spec scope.
- **TEST PLAN:** `python backend/scripts/genoscope_spike/run_spike.py --pop 64 --gens 10 --report docs/decisions/DEC-A2-001-genoscope-spike.md` completes; report file exists AND contains all 6 sections with numeric measurements (grep check: `grep -cE "evals/sec|MB|seconds" docs/decisions/DEC-A2-001-genoscope-spike.md` ≥ 3).
- **ACCEPTANCE GATES:** report merged with all 6 measured answers; explicit recommendation sentence; no production-path file touched (`git diff --stat origin/main` shows only `backend/scripts/genoscope_spike/` + the doc).
- **ROLLBACK:** delete spike dir + doc (single revert).
- **EVIDENCE:** PR + the report's measurement tables.
- **Effort:** ~4h. **RISK:HIGH** (research-class: numbers may come back infeasible — that is a valid, acceptance-passing outcome).

---

## P8.13 — A2 Genoscope SPEC (spike #2 of chain)

- **ID:** P8.13 · **branch:** `docs/spec-8-genoscope` · **base:** `origin/main`
- **depends-on:** P8.12 (consumes its measurements); informed by Q7 status (G1) — spec must define BOTH the multi-modal fitness (DINOv2+CLIP+CLAP+optical-flow+palette+edge-PSD per vision A2 row) and a degraded non-latent fitness (palette + edge-PSD + optical-flow only) so A2 isn't 100% hostage to Q7
- **goal:** `docs/roadmap/specs/entropic-spec-8-genoscope.md` in the established SPEC-N format (decision recap → schema → file-by-file inventory with line estimates → test plan with named tests → acceptance criteria checklist → risks), covering: genome codec, operator set + closure rules, fitness stack (full + degraded), generation loop + SG-6 integration, output as editable project (vision: "output editable `.entropic`") AND as `.dna` (E2), UI surface sketch (reference-clip drop → evolve → pick-from-grid), budget/SG-2 interaction, perf targets from P8.12 measurements.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  test -f docs/decisions/DEC-A2-001-genoscope-spike.md && grep -c "evals/sec" docs/decisions/DEC-A2-001-genoscope-spike.md   # spike report exists with measurements
  ```
- **scope:** the spec doc only. **DO-NOT-TOUCH:** code.
- **steps:** draft → run `/review` (doc mode) → CTO + Red Team pass (same protocol SPEC-6 §1 cites) → user sign-off → merge.
- **TEST PLAN:** n/a (docs). Structural check: spec contains "Acceptance criteria" checklist with ≥10 boxes, "File-by-file inventory" table, and a "Build packet decomposition" section enumerating the P8.14+ packets (each ≤4h) — that decomposition is the deliverable that makes the build one-shottable.
- **ACCEPTANCE GATES:** spec merged after multi-perspective review; every build packet in its decomposition names verified paths; degraded-fitness mode specified so Tier-6 work can proceed pre-Q7.
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + review-agent verdicts linked in PR body.
- **Effort:** ~4h.

---

## P8.14 — A2 Genoscope BUILD seed: genome codec + generation loop (headless) ⚠ RISK:HIGH

- **ID:** P8.14 · **branch:** `feat/genoscope-core-1` · **base:** `origin/main`
- **depends-on:** P8.11 (SG-6), P8.13 (spec) — **STOP if spec not merged**; full multi-modal fitness additionally blocked on Q7 REAL verdict (G1) — this packet ships the degraded-fitness path only
- **goal:** First production slice per SPEC-8's packet decomposition (expected shape: `backend/src/genoscope/{genome,operators,evolve}.py` + degraded fitness + SG-6 cancellation + headless CLI `python -m genoscope.evolve --ref <img> --pop 64 --gens 20`). The SPEC-8 decomposition section overrides this sketch — re-read it at pickup.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  test -f docs/roadmap/specs/entropic-spec-8-genoscope.md
  grep -n "Build packet decomposition" docs/roadmap/specs/entropic-spec-8-genoscope.md
  git ls-tree origin/main backend/src/cancellation.py
  ```
- **scope:** per SPEC-8 decomposition packet 1; quarantined under `backend/src/genoscope/` (new package, zero imports from zmq_server until a later UI packet). **DO-NOT-TOUCH:** zmq_server.py, frontend, render pipeline.
- **TEST PLAN:** per SPEC-8 named tests; minimum bar: genome round-trip property test (hypothesis), operator closure tests, 5-gen smoke with cancellation abort, deterministic-seed reproducibility test.
- **ACCEPTANCE GATES:** SPEC-8 packet-1 boxes checked; full backend suite green; runtime of 5-gen smoke within 2× of spike projection (else file finding against SPEC-8).
- **ROLLBACK:** revert PR (package has no callers).
- **EVIDENCE:** PR + pytest + CLI run transcript.
- **Effort:** ≤4h (bounded by spec decomposition). Subsequent A2 build packets are authored inside SPEC-8 — do not invent them ad hoc (cron-drift rule).

---

## P8.15 — E8 Vibe-to-Patch SPIKE → fusion-fitness report (research-class)

- **ID:** P8.15 · **branch:** `spike/e8-vibe-fitness` · **base:** `origin/main`
- **depends-on:** P8.13 (fitness interface defined there); **HARD-BLOCKED on Q7 REAL verdict** for the embedding heads (CLIP text/image, CLAP audio live only on q7 branches — `git grep -l "clip" origin/main -- backend/src` is empty). If Q7 = NO-GO, this packet is cancelled (documented fallback: A2 ships degraded fitness only).
- **goal:** Measured report `docs/decisions/DEC-E8-001-fusion-fitness.md`: can clip + still + text + audio + existing-patch + latent-point inputs be normalized into ONE fitness scalar (vision E8 row)? Measure: per-head encode latency on this Mac, cross-modal score correlation on a 10-example probe set (does text "warm grainy dusk" rank a warm grainy render above a cold clean one for ≥8/10 hand-built pairs?), fusion weighting strategy comparison (mean vs learned-free rank fusion).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  test -f ~/.entropic/q7-report.json && python3 -c "import json;d=json.load(open('$HOME/.entropic/q7-report.json'));print(d.get('verdict'))"   # must print TIER_5_GO from a REAL run — the existing mock verdict does NOT satisfy this (G1); STOP otherwise
  ls docs/roadmap/specs/entropic-spec-8-genoscope.md
  ```
- **scope:** `backend/scripts/e8_spike/` + report doc only. **DO-NOT-TOUCH:** production packages.
- **steps:** (1) Cherry-pick the CLIP/CLAP encode commits from q7 branches into the spike dir ONLY if needed (note: cherry-pick rule applies — enumerate via `git log origin/main..<branch> --oneline` in `~/Development/entropic-q7-clip` / `entropic-q7-clap`). (2) Build 10 probe pairs. (3) Measure + report.
- **TEST PLAN:** report exists, contains the ≥8/10 ranking result (pass/fail explicitly stated), latency table per head.
- **ACCEPTANCE GATES:** report merged with measured verdict; E8 SPEC packet (P8.16, authored then) is GO/NO-GO'd by it.
- **ROLLBACK:** delete spike dir + doc.
- **EVIDENCE:** PR + ranking-table from the report.
- **Effort:** ~4h. **RISK:HIGH** (user-blocked precondition + research-class).
- **Follow-on (do not pre-author):** P8.16 = E8 SPEC (`entropic-spec-9-vibe-to-patch.md`, same structural checks as P8.13); E8 build packets live inside that spec.

---
---

## Phase 9 — Tier 7: SG-9 + E7 Plugin SDK

E7 is 2XL with deps B1 (✅ #148) + 🚧SG-9 (vision E7 row). SG-9: "per-plugin CPU/RAM/disk/FD/IPC quotas; Ed25519-signed default; unsigned = explicit opt-in with red-flag UI" (vision §10). Both are research-class → spike→spec→build chains. **Do not start P9 build packets before Tier 6 E2 has merged** — the SDK's patch interchange rides on `.dna`.

## P9.1 — E7/SG-9 SPIKE: macOS subprocess sandbox + quota feasibility (research-class)

- **ID:** P9.1 · **branch:** `spike/e7-sandbox-quotas` · **base:** `origin/main`
- **depends-on:** none technically; sequenced after Phase 8 core (P8.2–P8.10)
- **goal:** Measured report `docs/decisions/DEC-E7-001-sandbox-spike.md` answering on macOS (the only target platform): (a) RAM quota — does `resource.setrlimit(RLIMIT_AS/RLIMIT_DATA)` actually constrain a numpy-allocating child on this macOS version? (known flaky on Darwin — measure, don't assume); (b) CPU quota — RLIMIT_CPU vs supervisor-side `psutil`-style polling: which kills a busy-loop plugin within 2× its quota?; (c) FD quota — RLIMIT_NOFILE behavior; (d) disk quota — enforcement options (chroot-like sandbox-exec profile vs supervisor du-polling), pick one with measurement; (e) IPC quota — msgs/sec cap on a ZMQ pair (the app already speaks ZMQ — `backend/src/zmq_server.py`); (f) `sandbox-exec` (Seatbelt) viability + deprecation status on current macOS; (g) frame-payload transport cost: shared-memory vs pipe for 1080p RGBA between host and plugin process, ms/frame measured.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  sw_vers -productVersion    # record in report; quota behavior is OS-version-specific
  cd ~/Development/entropic-v2challenger/backend && python3 -c "import resource, multiprocessing; print('ok')"
  git grep -rln "sandbox\|setrlimit" origin/main -- backend/src | wc -l   # expect 0 — greenfield
  ```
- **scope:** `backend/scripts/e7_spike/` (quarantined) + report doc. **DO-NOT-TOUCH:** production packages; `.mcp.json`/settings (no infra changes from a spike).
- **steps:** one micro-benchmark per question (a)–(g); each prints a PASS/FAIL/number; report aggregates with a recommended enforcement matrix (which mechanism per quota class).
- **TEST PLAN:** `python backend/scripts/e7_spike/run_all.py` completes; report contains 7 sections each with a measured number or explicit FAIL; recommendation matrix present.
- **ACCEPTANCE GATES:** report merged; every SG-9 quota class has a chosen mechanism with evidence; transport recommendation (shm vs pipe) has ms/frame numbers.
- **ROLLBACK:** delete spike dir + doc.
- **EVIDENCE:** PR + measurement tables.
- **Effort:** ~4h. **RISK:HIGH** (Darwin rlimit semantics are the known unknown; a mostly-FAIL report forces a supervisor-polling design — still a pass for the packet).

---

## P9.2 — E7 Plugin SDK SPEC (spike #2 of chain)

- **ID:** P9.2 · **branch:** `docs/spec-10-plugin-sdk` · **base:** `origin/main`
- **depends-on:** P9.1; E2 `.dna` merged (P8.2–P8.10) — plugin params/axis-caps must speak the same schema (SPEC-2 axes + binding rules, SPEC-6 interchange)
- **goal:** `docs/roadmap/specs/entropic-spec-10-plugin-sdk.md` (SPEC-N format): plugin manifest (param schema + axis-caps + basis + render contract per vision E7 row), process lifecycle (spawn/handshake/heartbeat/kill — mirror the existing sidecar watchdog pattern: 1s heartbeat, 3-miss restart), IPC protocol (ZMQ, token-auth like existing `_token` field), quota enforcement matrix FROM P9.1's measured recommendation, signing/trust model stub (full UX in P9.4), versioning vs `.dna` schema, hello-world plugin walkthrough, **build packet decomposition (each ≤4h)**.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  test -f docs/decisions/DEC-E7-001-sandbox-spike.md && grep -c "recommendation" docs/decisions/DEC-E7-001-sandbox-spike.md
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna   # E2 merged
  ```
- **scope:** spec doc only. **DO-NOT-TOUCH:** code.
- **steps:** draft → `/review` + CTO + Red Team (SG-9 is a security boundary — Red Team pass is mandatory, not optional) → user sign-off.
- **TEST PLAN:** structural: acceptance checklist ≥12 boxes; quota matrix cites P9.1 numbers; decomposition section enumerates P9.5+ build packets with verified-path placeholders.
- **ACCEPTANCE GATES:** merged post-review; Red Team findings addressed inline.
- **ROLLBACK:** revert docs commit.
- **EVIDENCE:** PR + review verdicts.
- **Effort:** ~4h.

---

## P9.3 — SG-9 quota enforcement library ⚠ RISK:HIGH

- **ID:** P9.3 · **branch:** `feat/sg9-quotas` · **base:** `origin/main`
- **depends-on:** P9.1 (mechanism choices), P9.2 (API surface)
- **goal:** `backend/src/plugin_host/quotas.py`: per-process CPU/RAM/disk/FD/IPC quota supervisor implementing exactly the P9.1-chosen mechanism per class; violation → plugin process terminated + structured event; reuses P8.11 `CancelToken` deadline supervisor for the kill path.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  test -f docs/roadmap/specs/entropic-spec-10-plugin-sdk.md
  git ls-tree origin/main backend/src/cancellation.py
  grep -n "enforcement matrix\|Enforcement matrix" docs/decisions/DEC-E7-001-sandbox-spike.md
  ```
- **scope (paths per SPEC-10; sketch):** new `backend/src/plugin_host/{__init__,quotas}.py`, `backend/tests/test_plugin_host/test_quotas.py`. **DO-NOT-TOUCH:** zmq_server.py (host wiring is a later SPEC-10 packet); frontend.
- **steps:** per SPEC-10 decomposition. Every quota class gets a real-subprocess violation test (busy-loop for CPU, balloon-alloc for RAM, fd-spam for FD, write-loop for disk, msg-flood for IPC).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_plugin_host/ -v` — named: `test_cpu_quota_kills_busyloop`, `test_ram_quota_kills_balloon`, `test_fd_quota_enforced`, `test_disk_quota_enforced`, `test_ipc_rate_capped`, `test_violation_event_structured`. These MUST use real subprocesses (no mocks — Darwin semantics are the point).
- **ACCEPTANCE GATES:** all 6 real-subprocess tests green on this Mac; kill latency ≤2× quota per P9.1 target; full suite green.
- **ROLLBACK:** revert PR (no callers until host packet).
- **EVIDENCE:** PR + pytest output with timings.
- **Effort:** ~4h. **RISK:HIGH** (OS-dependent behavior; CI runners may differ from user's Mac — mark Darwin-only tests with a skip-guard + run locally, paste output).

---

## P9.4 — SG-9 signing + trust UX (Ed25519 default; unsigned = red-flag opt-in)

- **ID:** P9.4 · **branch:** `feat/sg9-signing-trust` · **base:** `origin/main`
- **depends-on:** P8.7 (signing module), P9.2 (trust model section)
- **goal:** Plugin packages are Ed25519-signed by default (reuse `backend/src/dna/signing.py` primitives — extract shared core to `backend/src/crypto/ed25519.py` if needed, record in PR body); loading an unsigned/bad-sig plugin requires explicit per-plugin opt-in through a red-flag dialog (frontend), persisted consent, revocable in settings.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna/signing.py   # P8.7 merged
  test -f docs/roadmap/specs/entropic-spec-10-plugin-sdk.md
  ```
- **scope (paths per SPEC-10; sketch):** `backend/src/plugin_host/trust.py`, frontend red-flag dialog component + settings surface per SPEC-10, tests both sides. **DO-NOT-TOUCH:** quota code (P9.3).
- **steps:** per SPEC-10 decomposition; consent storage under `~/.creatrix/` (0700, same pattern as `diagnostics-handlers.ts` mkdir mode).
- **TEST PLAN:** backend named: `test_signed_plugin_loads_silently`, `test_tampered_plugin_rejected`, `test_unsigned_requires_consent`, `test_consent_persisted_and_revocable`; frontend: red-flag dialog renders warning copy, decline path loads nothing. Full suites green.
- **ACCEPTANCE GATES:** unsigned plugin can NEVER load without recorded consent (negative test proves it); SPEC-10 trust boxes checked.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + test outputs + dialog screenshot.
- **Effort:** ~4h.

---

## P9.5 — E7 BUILD seed: plugin host harness + hello-world plugin

- **ID:** P9.5 · **branch:** `feat/plugin-host-core-1` · **base:** `origin/main`
- **depends-on:** P9.2 (spec), P9.3 (quotas), P9.4 (trust)
- **goal:** First SPEC-10 build slice: host spawns a sandboxed hello-world plugin (identity frame transform), full lifecycle (manifest validate → trust check → spawn under quotas → handshake → process one frame via the P9.1-chosen transport → clean shutdown), headless integration test. UI/browser surfacing is a later SPEC-10 packet.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/plugin_host/quotas.py backend/src/plugin_host/trust.py
  grep -n "Build packet decomposition" docs/roadmap/specs/entropic-spec-10-plugin-sdk.md
  ```
- **scope:** per SPEC-10 packet-1 (sketch: `backend/src/plugin_host/host.py`, `examples/plugins/hello_identity/` with manifest + plugin.py, integration test). **DO-NOT-TOUCH:** zmq_server.py dispatch, effects registry, frontend.
- **TEST PLAN:** per SPEC-10; minimum: `test_hello_plugin_full_lifecycle` (real subprocess, frame in == frame out), `test_quota_violation_during_render_kills_plugin`, `test_unsigned_hello_blocked_without_consent`. Full backend suite green.
- **ACCEPTANCE GATES:** SPEC-10 packet-1 boxes; lifecycle test runs in <10s; subsequent E7 packets authored in SPEC-10 only (no ad-hoc continuation).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + integration test transcript.
- **Effort:** ≤4h (bounded by spec decomposition).

---

## Dependency graph (phase 8-9)

```
P8.1 ──► P8.2 ──► P8.3 ──► P8.4 ──► P8.5 ──► P8.6
                    │                  └──► P8.8 ──► P8.9 ──► P8.10
                    └──► P8.7 ─────────────────────────┘ (sign toggle)
P8.11 ──► P8.12 ──► P8.13 ──► P8.14 (build; degraded fitness)
              (Q7 REAL verdict ⏸ user) ──► P8.15 ──► [P8.16 spec → E8 builds]
P8.2–P8.10 + P9.1 ──► P9.2 ──► P9.3 ──► P9.5
                 P8.7 ────────► P9.4 ──► P9.5
```

**User-blocked items (⏸):** P8.15 (and full-fitness A2) on Q7 REAL benchmark run; `.github/workflows/dna-lint.yml` merge in P8.6 (workflow files = manual user merge).
