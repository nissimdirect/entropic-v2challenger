# [LOCKED DECISION 2026-06-11: Tier 7 (P9.*) demoted to IF-EVER, gated on a second user existing. .dna simplified — JSON + schema lints; signing/SG-9 quotas dropped. P8.6/P8.7 signing packets and P9.3/P9.4 are SUSPENDED.]

> **Reconciliation note (thickness pass 2026-06-11):** the locked decision is internally inconsistent on one point — it KEEPS "JSON + schema lints" but lists P8.6 (the schema-lint packet) in the suspension sentence. P8.6 contains zero signing content (its 5 rules are pure schema lints, SPEC-6 §6.1); the only signing packet in Phase 8 is **P8.7**. Resolution applied here: **P8.6 = LIVE**, **P8.7 = ⛔ SUSPENDED**, **all P9.\* = ⛔ SUSPENDED (IF-EVER)**. If the user intended P8.6 suspended too, flip its banner — nothing downstream of P8.6 depends on it. Signing fallout propagated in place: P8.3 flags bit0 is retired (reserved-must-be-zero), P8.9 drops verify-if-signed, P8.10 drops the sign checkbox, P8.5 byte-identity is unconditional (no signature block exists). The "simplified — JSON" clause is fed into P8.1 as a third header option (Option C, no binary preamble).

# Work Packets — Phase 8 (Tier 6: `.dna`/E2 + SG-2 + SG-6 + A2 Genoscope + E8) and Phase 9 (Tier 7: SG-9 + E7 Plugin SDK)

**Authored:** 2026-06-11 · **Base for all packets:** `origin/main` @ `d821ae8` (verified). If `origin/main` has moved when you pick a packet up, re-run that packet's PRECONDITIONS — they are the contract, not the SHA.
**Repo:** `~/Development/entropic-v2challenger` (GitHub: `nissimdirect/entropic-v2challenger`).
**Sources of truth:** `docs/roadmap/specs/entropic-spec-6-dna-format.md` (SPEC-6) · `docs/roadmap/specs/entropic-spec-3-safety-gates.md` (SPEC-3) · `docs/roadmap/plans/entropic-synth-paradigm-vision.md` (vision §6, §8, §10) · draft PR #139 (`feat/q7-dna-format`, worktree `~/Development/entropic-q7-dna`).

**Conventions for every packet:**
- Work in a fresh worktree: `git -C ~/Development/entropic-v2challenger worktree add ~/Development/creatrix-<id>-wt -b <branch> origin/main`
- Backend tests: `cd backend && python -m pytest -x -n auto --tb=short` · Frontend: `cd frontend && npx --no vitest run` (the `--no` is mandatory per repo CLAUDE.md)
- Each packet ships as its OWN PR (SPEC-3 §9: "Bundling gates with feature work increases blast radius")
- **CHERRY-PICK RULE (G5):** `feat/q7-dna-format` is **32 ahead / 16 behind** `origin/main` (merge-base `839345f`, stale — all three numbers re-verified 2026-06-11). NEVER raw-merge or rebase that branch. Enumerate payload with `git log origin/main..feat/q7-dna-format --oneline`; cherry-pick only the named commit(s) onto a fresh branch.
- **Packet contract (11 fields + metadata):** every LIVE packet carries ① ID/branch/base ② depends-on ③ goal ④ PRECONDITIONS ⑤ scope (VERIFIED paths) ⑥ DO-NOT-TOUCH ⑦ steps ⑧ TEST PLAN (named tests with behavior-keyword titles + exact commands) ⑨ ACCEPTANCE GATES (quantified) ⑩ ROLLBACK ⑪ EVIDENCE — plus `Effort` and `Model` metadata. **Model tiers:** `sonnet` = mechanical/spec-bound execution; `opus` = design judgment, concurrency/timing, security-sensitive validation, or cross-layer integration.
- **Negative-test floor:** every LIVE code packet ships ≥1 negative test against malformed/hostile input (corrupt gzip, truncated magic, unknown schema version, budget-exceeding patch, …) — named in its TEST PLAN. Docs packets satisfy this with a mandatory "Rejected options" section.

**Tier gating (vision §8 table):** Tier 6 hard-blocks on SG-2 (ships inside E2), SG-6, SG-7 (✅ merged #149). A2 build (not spike/spec) additionally depends on Q7 REAL verdict (G1, user-blocked) + B1 (✅ #148) + A4 (✅ #162). Tier 7 hard-blocks on SG-9 — ⛔ moot while Tier 7 is suspended. The `.dna` format itself is **independent** (SPEC-6 §12) and can start any time.

---

## P8.1 — DECISION: reconcile draft-#139 `.dna` binary format + budget shape against SPEC-6

- **ID:** P8.1 · **branch:** `docs/dec-dna-001-format-reconcile` · **base:** `origin/main` · **Model:** opus (decision work — weighs format evolution vs simplicity under a locked constraint)
- **depends-on:** none (first packet; everything in P8 downstream of it)
- **goal:** A signed-off decision record resolving the two material divergences between the shipped draft code and SPEC-6, so build packets don't implement two formats. **Locked constraint (header of this file): signing is dropped — no option may be justified by signing support, and flags bit0 (Ed25519) is retired in all options.**
  - **Divergence 1 — header:** three options, not two:
    - **Option A (draft #139):** `codec.py:39` `MAGIC = b"DNA1"` (4 B) + uint32-LE gzip length + gzip body. Implementation delta: 0 LOC (it's what's shipped in `9ab2ea4`).
    - **Option B (SPEC-6 §3.1):** 8-byte magic `ENTR\1DNA` + version:u8 (`0x01`) + flags:u8 (all bits reserved-must-be-zero now that signing is dropped) + 6 reserved bytes = fixed 16-byte preamble + gzip body. Implementation delta: ~60 LOC in `codec.py` + ~6 test edits.
    - **Option C ("simplified — JSON" per locked decision):** no custom preamble — the file IS gzipped JSON; detection via gzip magic `1f 8b` + `schema_version` in body; `gunzip` makes patches diffable (kills SPEC-6 §13 risk row "Gzip + binary header makes diffing patches harder"). Implementation delta: about −40 LOC.
  - **Divergence 1 decision matrix (the doc MUST contain this, filled and scored 0–2 per cell):** criteria = ① format-revision detection without parsing body (A:1, B:2, C:1) ② implementation delta vs shipped draft (A:2, B:0, C:1) ③ diffability/tooling (A:0, B:0, C:2) ④ file-type detection independent of extension (A:2, B:2, C:1 — gzip magic is generic). Highest total wins; tie → smaller implementation delta. The pre-scored matrix above is the default recommendation input; the implementer re-scores and the user decides. **Signing is NOT a criterion (locked).**
  - **Divergence 2 — budget shape:** draft `budget.py:9-13` uses 5 capability-requirement fields (`estimated_memory_mb`, `estimated_gpu_textures`, `estimated_grains`, `requires_l_backbones`, `min_apple_silicon_tier`); SPEC-6 §5.2 specifies versioned ceilings (`budget.schema_version` + exactly 7 `max_*` keys in v1.0.0: `max_grain_count`, `max_recursion_depth`, `max_vram_bytes`, `max_cpu_ms_per_frame`, `max_chain_length`, `max_field_resolution_px`, `max_total_edges`).
  - **Divergence 2 decision criterion (explicit):** a key earns a place in the normative `budget` block iff it is **machine-checkable at apply time against patch content + system context** (SPEC-6 §5.3 contract). All 7 `max_*` keys pass. The draft's `estimated_*` keys are author-side claims (not enforceable → fail); `requires_l_backbones`/`min_apple_silicon_tier` are device-capability predicates (checkable against system only → different block). Default recommendation: SPEC-6 `budget` block is normative; the 5 draft fields survive as a sibling `requirements` block ("can this device run it" vs "what may this patch consume").
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-q7-dna log -1 --format="%h %s" 9ab2ea4   # expect: 9ab2ea4 "[q7] feat: PR #21 .dna patch format scaffold + SG-2 budget (21 tests)"
  git -C ~/Development/entropic-q7-dna show 9ab2ea4:backend/src/dna/codec.py | grep -n 'MAGIC = b"DNA1"'   # expect line 39 (verified 2026-06-11)
  git -C ~/Development/entropic-q7-dna show 9ab2ea4:backend/src/dna/budget.py | grep -c "estimated_\|requires_l\|min_apple"   # expect ≥5 (the 5 draft fields)
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna    # expect EMPTY (dna/ not on main — verified)
  ```
- **scope (VERIFIED paths):** writes ONLY `docs/decisions/DEC-DNA-001-format-reconcile.md` (new file; `docs/decisions/` exists on main — verified via `git ls-tree origin/main docs/decisions`).
- **DO-NOT-TOUCH:** any code; `feat/q7-dna-format` branch; SPEC-6 itself (except the addendum step below if the choice deviates).
- **steps:** (1) Read SPEC-6 §3/§5 + `9ab2ea4` diff side-by-side. (2) Write the doc: both decision matrices filled, one `CHOSEN:` line per divergence, a **Rejected options** section stating why each loser lost (this is the docs-packet negative-coverage requirement). (3) Present options + recommendation to user; record the user's choice **verbatim**. (4) If the choice deviates from SPEC-6, add an addendum section to SPEC-6 in the same PR (this is the one sanctioned SPEC-6 edit).
- **TEST PLAN (docs — all grep-checkable):**
  ```
  test -f docs/decisions/DEC-DNA-001-format-reconcile.md
  grep -c "^CHOSEN:" docs/decisions/DEC-DNA-001-format-reconcile.md          # expect exactly 2 (one per divergence)
  grep -ci "rejected option" docs/decisions/DEC-DNA-001-format-reconcile.md  # expect ≥2
  grep -c "| Criterion\|| criterion" docs/decisions/DEC-DNA-001-format-reconcile.md   # expect ≥1 (scored matrix present)
  grep -ci "user confirm" docs/decisions/DEC-DNA-001-format-reconcile.md     # expect ≥1 (verbatim user quote present)
  ```
- **ACCEPTANCE GATES:** decision doc merged with exactly 2 `CHOSEN:` lines + filled matrices + rejected-options rationale + verbatim user confirmation; every downstream P8 packet's header/budget references resolve to one format; if Option C chosen, P8.3's "Option C variant" paragraph governs that packet.
- **FAILURE MODES:** user picks against the recommendation → fine, record verbatim + SPEC-6 addendum (step 4); user unavailable → packet parks UNMERGED (a decision doc without the user quote fails the grep gate — do not merge a "provisional" decision).
- **ROLLBACK:** revert the docs commit.
- **EVIDENCE:** PR link + the grep outputs above pasted + user confirmation message quoted in the doc.
- **Effort:** ~1.5h.

---

## P8.2 — Cherry-pick `.dna` scaffold (draft #139 payload) onto fresh branch ⚠ RISK:HIGH

- **ID:** P8.2 · **branch:** `feat/dna-scaffold` · **base:** `origin/main` · **Model:** sonnet (mechanical cherry-pick + relocation; zero design decisions — those were P8.1)
- **depends-on:** P8.1
- **goal:** The 4-file payload of draft #139 lands on a fresh branch from current main, tests green, draft #139 closed with a pointer. Payload (verified 2026-06-11 via `git show --stat 9ab2ea4`): `backend/src/dna/__init__.py` (32 L), `backend/src/dna/budget.py` (92 L), `backend/src/dna/codec.py` (180 L), `backend/tests/test_q7_benchmark/test_dna_format.py` (307 L) = **611 insertions, 21 tests**.
- **RISK:HIGH** — stale merge-base hazard (`feedback_cherry-pick-stale-scaffold-branches.md`): the branch is 16 behind main; a raw merge would falsely revert ~16 commits of merged work (A4/A5/C4 spectral, SG gates).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && git fetch origin
  git rev-list --count origin/main..feat/q7-dna-format    # expect 32 (±0 unless branch touched)
  git rev-list --count feat/q7-dna-format..origin/main    # expect 16+ (confirms staleness — cherry-pick only)
  git show --stat --format="" 9ab2ea4 | tail -5            # expect exactly the 4 files above, 611 insertions
  git ls-tree origin/main backend/src/dna                  # expect EMPTY
  git show 9ab2ea4:backend/tests/test_q7_benchmark/test_dna_format.py | grep -c "^def test_"   # expect 21
  ```
- **scope (VERIFIED paths):** `backend/src/dna/__init__.py`, `backend/src/dna/codec.py`, `backend/src/dna/budget.py` (all new), test file **relocated** from `backend/tests/test_q7_benchmark/test_dna_format.py` → `backend/tests/test_dna/test_dna_format.py` (the `test_q7_benchmark/` dir does not exist on main and must not be created for non-q7 code). **Relocation is import-safe (verified):** the test file bootstraps `sys.path` via `Path(__file__).resolve().parents[2] / "src"` — `tests/test_dna/` sits at the same depth as `tests/test_q7_benchmark/`, so `parents[2]` still resolves to `backend/`; no import edits required.
- **DO-NOT-TOUCH:** anything outside `backend/src/dna/` + `backend/tests/test_dna/`; do not bring any other commit from `feat/q7-dna-format`; do not modify `zmq_server.py` yet (no IPC wiring in this packet).
- **steps:** (1) `git worktree add ~/Development/creatrix-p82-wt -b feat/dna-scaffold origin/main`. (2) `git cherry-pick 9ab2ea4`. (3) Resolve conflicts if any (expected: none — all 4 files are new on main). (4) `git mv backend/tests/test_q7_benchmark/test_dna_format.py backend/tests/test_dna/test_dna_format.py` (+ `__init__.py` if main's other test dirs carry one — match the sibling convention). (5) Confirm collection under main's pytest config (`pyproject.toml:25` `testpaths=["tests"]`; `:27` addopts `-m 'not perf' -n auto --dist loadfile --reruns=2`). (6) Run full backend suite. (7) Open PR; comment on draft #139 linking the fresh PR; close #139 after merge.
- **TEST PLAN (the 21 payload tests, by name — verified against `9ab2ea4`):**
  - Codec (13): `test_magic_bytes`, `test_schema_version_is_1_0_0`, `test_write_and_read_minimal_patch`, `test_round_trip_preserves_complex_graph`, `test_round_trip_preserves_lanes_and_params`, `test_unknown_top_level_fields_preserved_round_trip`, `test_writer_emits_required_fields`, `test_unsupported_version_raises`, `test_bad_magic_raises`, `test_truncated_header_raises`, `test_truncated_payload_raises`, `test_corrupt_gzip_raises`, `test_non_object_json_raises`
  - Budget (8): `test_default_budget_shape`, `test_validate_budget_minimal`, `test_validate_budget_with_l_backbones`, `test_validate_budget_unknown_backbone_raises`, `test_validate_budget_unknown_tier_raises`, `test_validate_budget_negative_memory_raises`, `test_validate_budget_non_dict_raises`, `test_budget_round_trip_through_dna`
  - **Negative coverage (already in payload — do not drop during relocation):** `test_bad_magic_raises`, `test_truncated_header_raises`, `test_truncated_payload_raises`, `test_corrupt_gzip_raises`, `test_non_object_json_raises`.
  ```
  cd backend && python -m pytest tests/test_dna/test_dna_format.py -v --tb=short -p no:randomly --reruns=0   # 21/21 pass in ONE clean run (no rerun masking)
  cd backend && python -m pytest -x -n auto --tb=short                                                        # full suite, zero regressions
  ```
- **ACCEPTANCE GATES:** 21/21 dna tests green on fresh branch **with `--reruns=0`** (the repo default `--reruns=2` must not be what makes them pass); full backend suite green; PR diff contains ONLY the 4 files (+ optional test `__init__.py`); CI green.
- **FAILURE MODES:** (a) cherry-pick conflict ⇒ someone created `backend/src/dna/` since verification — STOP, re-run preconditions; (b) collection error from `tests/conftest.py` (it imports `zmq_server` at module level — verified) ⇒ environment problem, not payload problem: full suite must already pass on clean main first; (c) flaky pass only via reruns ⇒ fails the `--reruns=0` gate, investigate before merge.
- **ROLLBACK:** `git revert` the merge commit — `backend/src/dna/` is self-contained with zero callers at this point (`git grep -rn "from dna\|import dna" backend/src | grep -v "^backend/src/dna"` must be empty at merge time).
- **EVIDENCE:** PR link; pytest output pasted (both commands); `git log origin/main..feat/dna-scaffold --oneline` showing the single cherry-picked commit (+fixups).
- **Effort:** ~2h.

---

## P8.3 — `.dna` header conformance per DEC-DNA-001

- **ID:** P8.3 · **branch:** `feat/dna-header-v1` · **base:** `origin/main` (after P8.2 merges) · **Model:** sonnet (binary layout is fully specified by DEC-DNA-001; no judgment calls)
- **depends-on:** P8.1, P8.2
- **goal:** `codec.py` implements the DEC-DNA-001 header (default Option B: SPEC-6 §3.1 — magic `ENTR\1DNA` (8 B) + version u8 (`0x01`) + flags u8 + 6 reserved bytes = **exactly 16-byte preamble** + gzipped JSON), with a one-time migration reader for any `DNA1`-format files written by the scaffold. **Signing dropped (locked):** the flags byte is reserved-must-be-zero on write; NO bit is assigned.
- **Option C variant (applies only if DEC-DNA-001 chose Option C):** this packet instead REMOVES the binary preamble — file = gzipped JSON, detection = gzip magic `1f 8b` + body `schema_version`; the test plan below swaps to `test_gzip_magic_detected`, `test_legacy_dna1_readable`, `test_body_schema_version_governs`, truncation fuzz over the first 4 bytes. Everything else (negative tests, gates) unchanged.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna/codec.py   # must EXIST (P8.2 merged)
  grep -c "^CHOSEN:" docs/decisions/DEC-DNA-001-format-reconcile.md                          # expect 2 (decision recorded)
  ```
- **scope (VERIFIED paths):** `backend/src/dna/codec.py`, `backend/tests/test_dna/test_dna_format.py` (extend), new `backend/tests/test_dna/test_dna_header.py`.
- **DO-NOT-TOUCH:** `budget.py` (that's P8.4); any frontend; `zmq_server.py`.
- **steps:** (1) Implement decided header layout in `read_dna`/`write_dna`. (2) Reader accepts legacy `DNA1` magic → parses + sets `legacy_header=True` on the patch object (write path always emits the new header — reading then re-saving a legacy file upgrades it). (3) Flags byte: write `0x00` always; on read, ANY set bit → structured warning (`unknown_flags=0xNN`) + body still parses (forward compat — a future version may assign bits). (4) Version byte: accept `0x01` only; `0x02`–`0xFF` → `DNAVersionError` naming both versions in the message. (5) Truncation fuzz: a valid file cut at EVERY offset 0–15 (16 cases, parametrized) → `DNAFormatError`, never an unhandled exception. (6) Corrupt-body case: valid 16-byte header + non-gzip garbage body → `DNAFormatError` (not `OSError`/`EOFError` leaking through).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_dna/ -v --reruns=0` — named tests:
  - `test_header_magic_entr1dna` — written file starts with the exact 8 bytes `45 4e 54 52 01 44 4e 41`
  - `test_header_is_exactly_16_bytes` — gzip body begins at offset 16
  - `test_legacy_dna1_readable_and_flagged` — scaffold-era `DNA1` file loads, `legacy_header=True`
  - `test_version_byte_unsupported_raises` — version `0x02` → `DNAVersionError`
  - `test_flags_nonzero_warns_not_crashes` — flags `0x01`/`0x80` → warning recorded, patch loads (**negative**)
  - `test_write_emits_zero_flags` — every written file has flags byte `0x00`
  - `test_truncation_at_each_header_offset` — parametrized ×16, all raise `DNAFormatError` (**negative**)
  - `test_corrupt_gzip_after_valid_header_raises_format_error` (**negative**)
  - Full suite green.
- **ACCEPTANCE GATES:** SPEC-6 acceptance item "Magic bytes + version header read/write correct" checked; legacy scaffold files still load; all 8 named tests + the 21 P8.2 tests green with `--reruns=0`; hexdump evidence shows the 16-byte preamble.
- **FAILURE MODES:** legacy `DNA1` files in the wild beyond test fixtures — none expected (format never shipped to users; scaffold lived only on a draft branch), so the migration reader is belt-and-suspenders, not a data-loss risk; if DEC-DNA-001 chose Option A, this packet collapses to steps 3–6 only (flags/version/truncation hardening on the draft header) — record which case applied in the PR body.
- **ROLLBACK:** revert PR; format has no external consumers yet.
- **EVIDENCE:** PR + pytest output + `hexdump -C sample.dna | head -2` showing the 16-byte header.
- **Effort:** ~3h.

---

## P8.4 — SG-2 budget descriptor v1.0.0 (versioned ceilings + apply-time validator + writer auto-compute)

- **ID:** P8.4 · **branch:** `feat/dna-sg2-budget` · **base:** `origin/main` (after P8.3) · **Model:** opus (trust-boundary validation — every numeric crosses a deserialization boundary; clamp/guard design per `feedback_numeric-trust-boundary.md`)
- **depends-on:** P8.1, P8.2, P8.3
- **goal:** SG-2 lands per SPEC-6 §5 + DEC-DNA-001: versioned `budget` block with `schema_version` + the 7 `max_*` keys; `validate_patch_budget(patch, system)` returns a violations list; consent-bypass records a project flag; writer auto-computes minimum budget and forbids loosening (user may only tighten). Draft `estimated_*` fields handled per DEC-DNA-001 (default: sibling `requirements` block).
- **Budget field ranges (v1.0.0 — every key type+range checked at load; out-of-range or non-finite → validation error, never a clamp-and-continue):**
  | Key | Type | Valid range | Range anchor |
  |---|---|---|---|
  | `max_grain_count` | int | 1 – 100 000 | granulator MAX_GRAINS ceiling class |
  | `max_recursion_depth` | int | 1 – 16 | feedback/fusion nesting sanity bound |
  | `max_vram_bytes` | int | 2²⁰ (1 MiB) – 2³⁶ (64 GiB) | unified-memory Macs cap |
  | `max_cpu_ms_per_frame` | float | (0, 10 000] | 10 s/frame = pathological but expressible |
  | `max_chain_length` | int | 1 – 10 | `MAX_CHAIN_DEPTH = 10` at `backend/src/engine/pipeline.py:24` (verified) — budget may not exceed what the pipeline enforces |
  | `max_field_resolution_px` | int | 16 – 16 384 | texture-size class |
  | `max_total_edges` | int | 1 – 4 096 | mod-routing tensor sanity bound |
- **Size caps (quantified):** raw `.dna` file ≤ **50 MB** before decompress AND before JSON parse (SPEC-6 §8 row 4); decompressed stream capped at **200 MB** — abort mid-decompress when exceeded (zip-bomb guard), do NOT decompress-then-measure.
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna/budget.py   # EXISTS
  grep -n "max_grain_count" docs/roadmap/specs/entropic-spec-6-dna-format.md                  # spec keys present (SPEC-6 §5.2)
  git -C ~/Development/entropic-v2challenger grep -n "MAX_CHAIN_DEPTH = " origin/main -- backend/src/engine/pipeline.py   # expect :24 value 10 — range-table anchor
  ```
- **scope (VERIFIED paths):** `backend/src/dna/budget.py` (rewrite), new `backend/src/dna/validators.py` (SPEC-6 §9: apply-time validators — budget + non-finite-numeric rejection + size caps), `backend/tests/test_dna/test_budget.py`, `backend/tests/test_dna/test_validators.py`.
- **DO-NOT-TOUCH:** frontend; IPC; the 5 P8.2 codec negative tests (they must keep passing unmodified).
- **steps:** (1) `BudgetDescriptor` v1.0.0 with `schema_version` + 7 ceilings + the range table above; unknown future budget keys preserved verbatim (forward compat, SPEC-6 §4.1.6). (2) `validate_patch_budget` per SPEC-6 §5.3 pseudocode — returns ALL violations, not first-hit. (3) NaN/Inf rejection at load for every numeric in the body, not just budget keys (SPEC-6 §8 row 5). (4) Size caps as quantified above. (5) Writer-side `compute_minimum_budget(project)` + tighten-only override (attempt to loosen → `ValueError` naming the key).
- **TEST PLAN:** `cd backend && python -m pytest tests/test_dna/ -v --reruns=0` — named tests:
  - SPEC-6 §10.4 trio: `test_apply_rejected_when_grain_count_exceeds_budget` (**negative — the budget-exceeding patch**), `test_apply_bypassable_with_user_consent`, `test_writer_auto_computes_minimum_budget`
  - `test_validator_returns_all_violations_not_first` — patch violating 3 ceilings → 3 violations listed
  - `test_unknown_budget_keys_preserved` — future key `max_latent_dim` round-trips verbatim
  - `test_budget_key_out_of_range_rejected` — parametrized over all 7 keys × {below-min, above-max} = 14 cases (**negative**)
  - `test_nonfinite_numeric_rejected_at_load` — NaN and Inf in params AND in budget (**negative**)
  - `test_raw_size_cap_rejects_oversized` — 50 MB+1 file refused pre-parse (**negative**)
  - `test_decompressed_size_cap_aborts_midstream` — 1 MB gzip expanding past 200 MB aborts without allocating 200 MB (assert peak RSS delta < 250 MB) (**negative**)
  - `test_tighten_only_override_rejects_loosening` (**negative**)
- **ACCEPTANCE GATES:** SPEC-6 acceptance item "SG-2 budget validator rejects out-of-budget patches" + security rows 1/4/5 covered by named tests; all 7 keys have both range-edge negative cases; full backend suite green.
- **FAILURE MODES:** range table proves too tight in practice → ranges live in ONE constants block with the table in its docstring, changing them is a one-line PR + Lint-4 schema-version bump; `estimated_grain_count()`/`estimated_vram_bytes()` estimators are heuristics — violations text must say "estimated", and consent-bypass exists precisely because estimates can be wrong.
- **ROLLBACK:** revert PR (still zero production callers until P8.9/P8.10 UI).
- **EVIDENCE:** PR + pytest output naming all tests above (≥10 named, ≥6 negative).
- **Effort:** ~4h.

---

## P8.5 — Unknown-fields preservation + migrations + cross-version compat

- **ID:** P8.5 · **branch:** `feat/dna-compat` · **base:** `origin/main` (after P8.4) · **Model:** opus (compat semantics are the subtlest part of SPEC-6 — shadow-map identity, migration ordering, unknown-enum policy)
- **depends-on:** P8.3, P8.4
- **goal:** SPEC-6 §4 in full: `_unknown` shadow maps on every section (Lane/ModEdge/Effect/Operator/Macro/Budget/top-level = 7 shadow sites), `_legacy` shadow on migrated fields, versioned migration registry (`migrations.py`), byte-identical round-trip (**unconditional** — signing dropped, so no "modulo signature" carve-out), defaults for missing fields (`binding_rule`→`broadcast`, `direction`→1, `domain`→`t` per SPEC-6 §4.2.1), unknown-binding-rule read policy (warn + evaluate-as-broadcast + preserve original, §4.1.5).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  cd ~/Development/entropic-v2challenger && python3 -c "import gzip"   # stdlib sanity
  git ls-tree origin/main backend/src/dna/validators.py                 # P8.4 merged
  git grep -n "bindingRule: BindingRule" origin/main -- frontend/src/shared/axis-binding.ts   # expect :59 (SPEC-2 schema on main, shipped #148; enum values incl. 'broadcast' at :33 — .dna section field names must match. NOTE: NOT in types.ts — earlier draft of this packet pointed at the wrong file)
  git grep -n "TIER_1_BINDING_RULES" origin/main -- frontend/src/shared/axis-binding.ts        # expect :67 — the tier-gated enum the unknown-rule policy degrades to
  ```
- **scope (VERIFIED paths):** new `backend/src/dna/migrations.py`, new `backend/src/dna/reader.py` + `backend/src/dna/writer.py` (split read/write out of `codec.py` per SPEC-6 §9 inventory, or keep in codec.py if <400 lines — implementer's call, record in PR body), `backend/tests/test_dna/test_compat.py`, fixture patches under `backend/tests/test_dna/fixtures/*.dna`.
- **Fixture set (minimum 4, committed binary + a `make_fixtures.py` regenerator):** ① `v1_minimal.dna` (current schema, smallest valid patch) ② `v1_unknown_fields.dna` (future field injected at every shadow site — all 7) ③ `v999_future_major.dna` (synthetic `schema_version: "999.0.0"`) ④ `v1_unknown_binding_rule.dna` (`binding_rule: "painted_future"` on one edge).
- **DO-NOT-TOUCH:** frontend; budget semantics (done in P8.4).
- **steps:** (1) `_unknown` shadow per section (all 7 sites), round-tripped on save. (2) Migration registry keyed by `schema_version`, applied oldest→newest, each step pure `(dict) -> dict`; original field values preserved in `_legacy` (SPEC-6 §4.2.2 "never destructive"). (3) Defaults table per §4.2.1. (4) Unknown-enum read policy per §4.1.5. (5) Byte-identity round-trip test. (6) Future-MAJOR policy: `schema_version` with major > supported → `DNAVersionError` with a clean message (SPEC-6 §3.3 "major bump = breaking; never silent") — minor/patch bumps load with warnings.
- **TEST PLAN:** `cd backend && python -m pytest tests/test_dna/ -v --reruns=0` — named tests (SPEC-6 §10.1–10.3 + negatives):
  - `test_round_trip_preserves_byte_identity` — load fixture ① → save → `filecmp` byte-equal
  - `test_round_trip_with_unknown_field_preserved` — fixture ② survives **2** consecutive round-trips at all 7 shadow sites
  - `test_v30_reader_loads_v35_authored_patch_with_warnings` — minor-version-future patch loads, warnings list non-empty
  - `test_unknown_binding_rule_treats_as_broadcast_with_warning` — fixture ④: evaluates as `broadcast`, original string preserved on re-save (**negative**)
  - `test_v30_patch_loads_in_v35` — migration applies, defaults filled (`binding_rule`→`broadcast`, `direction`→1, `domain`→`t`)
  - `test_legacy_field_renames_preserved_in_shadow`
  - `test_future_major_schema_version_raises_clean_error` — fixture ③ → `DNAVersionError`, message names both versions, no traceback leak (**negative — the unknown-schema-version case**)
  - `test_migration_chain_applies_in_order` — synthetic 2-step chain v0.9→v1.0→v1.1 applied oldest-first
  - Full suite green.
- **ACCEPTANCE GATES:** SPEC-6 acceptance items: round-trip byte-identity ✓ (unconditional), unknown fields preserved ✓ (×7 sites), forward compat ✓, backward compat via migration ✓; future-major rejection is a hard error, minor is warn-and-load; all 4 fixtures committed with regenerator script.
- **FAILURE MODES:** byte-identity breaks on dict-ordering — writer must serialize with stable key order (`sort_keys` or insertion-preserving round-trip, pick one and test it); gzip mtime header breaks byte-identity — write with `mtime=0`; migration squash debt is accepted (SPEC-6 §13 row 2) — out of scope here.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + pytest output + fixture ② shown surviving 2 round-trips (hexdiff empty).
- **Effort:** ~4h.

---

## P8.6 — CI lint: `scripts/lint_dna_schema.py` (5 rules) + workflow wiring

> **STATUS: LIVE.** The locked-decision header lists "P8.6/P8.7 signing packets" as suspended, but this packet contains no signing content and the same decision explicitly KEEPS "schema lints" — see the reconciliation note at the top of this file. If the user overrules, flip this banner to ⛔ SUSPENDED; nothing downstream depends on P8.6.

- **ID:** P8.6 · **branch:** `ci/dna-lint` · **base:** `origin/main` (after P8.5) · **Model:** sonnet (rule definitions are fully enumerated in SPEC-6 §6.1; diff-parsing is mechanical)
- **depends-on:** P8.5
- **goal:** The no-regression enforcement — **exactly 5 rules** (SPEC-6 §6.1): **Lint-1** schema additions optional · **Lint-2** `_unknown` map never removed from any reader · **Lint-3** enum additions require migration test + changelog (covers exactly these 5 enums: `BindingRule`, `Axis`, `InterpolationMode`, `OperatorType`, `BlendMode`) · **Lint-4** `dna_schema.json` change requires `schema_version` bump same-PR · **Lint-5** every schema version has migration fn + old-patch load test. Wired into CI. (None of the 5 rules reference signing — the locked decision's signing drop changes nothing here.)
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree --name-only origin/main .github/workflows   # expect ONLY test.yml (verified 2026-06-11) — add dna-lint as a NEW workflow file, do not rewrite test.yml
  git ls-tree origin/main backend/src/dna/migrations.py                                           # P8.5 merged
  ```
- **scope (VERIFIED paths):** new `scripts/lint_dna_schema.py` (repo-root `scripts/` exists on main — verified), new `backend/src/dna/dna_schema.json` (canonical schema, SPEC-6 §9), new `.github/workflows/dna-lint.yml` (NOTE: per the user's standing rule, **workflow files must be merged manually by the user via GitHub UI** — flag this in the PR body), `backend/tests/test_dna/test_lint_rules.py` (lint self-tests with synthetic diffs).
- **DO-NOT-TOUCH:** `.github/workflows/test.yml`; `backend/src/dna/*.py` runtime code.
- **steps:** (1) Implement the 5 checks operating on `git diff origin/main...HEAD` + repo state; each check returns `(rule_id, file, line, message)` tuples; runner prints all violations (not first-hit) and exits non-zero on any. (2) Fixture-based self-tests: one synthetic violating diff per rule (5 fixtures) + clean-diff fixtures. (3) Workflow runs lint on PRs touching `backend/src/dna/**`, `frontend/src/shared/types.ts`, or `frontend/src/shared/axis-binding.ts` (the file that actually holds `BindingRule` — verified). (4) Exit non-zero fails CI.
- **TEST PLAN:** `cd backend && python -m pytest tests/test_dna/test_lint_rules.py -v --reruns=0` — **≥7 named tests, every rule has a failing (negative) self-test:**
  - Lint-1: `test_lint_fails_on_required_new_field` (**negative**) + `test_lint_passes_on_optional_additive_change`
  - Lint-2: `test_lint_fails_on_unknown_map_removal` (**negative**)
  - Lint-3: `test_lint_fails_on_enum_value_without_migration_test` (**negative**)
  - Lint-4: `test_lint_fails_on_schema_change_without_version_bump` (**negative**)
  - Lint-5: `test_lint_fails_on_version_bump_without_migration_fn` (**negative**)
  - Runner: `test_lint_reports_all_violations_not_first_hit`
  - Manual: `python3 scripts/lint_dna_schema.py --base origin/main` exits 0 on a clean tree; exits non-zero with rule IDs printed on the synthetic-violation fixtures.
- **ACCEPTANCE GATES:** 5/5 rules implemented, each with ≥1 failing self-test (5 negative tests minimum); lint observed in CI on a probe PR both RED (synthetic violation commit, then dropped) and GREEN; `--base` flag works so the lint is also runnable locally pre-push.
- **FAILURE MODES:** TS-type diff parsing is heuristic (regex over `.ts` diffs, not a TS AST) — acceptable for v1; false-positive escape hatch: `# dna-lint: ignore <rule-id> <reason>` comment, which the lint counts and reports (so ignores are visible in CI output, never silent).
- **ROLLBACK:** delete workflow file (user-merged) + revert script PR; no runtime impact.
- **EVIDENCE:** PR + CI run links showing one red (probe) and one green run + pytest output naming the 7 tests.
- **Effort:** ~4h.

---

## P8.7 — Ed25519 signing (optional, flags bit0) — ⛔ SUSPENDED

> **⛔ SUSPENDED (LOCKED DECISION 2026-06-11: signing dropped).** Do not build. Body below is preserved un-thickened for if-ever revival (revival trigger: a second user / patch-sharing actually existing). Knock-on suspensions: P9.4 depends on this packet and is equally suspended; P8.9 no longer verifies signatures; P8.10 has no sign checkbox; P8.3 writes the flags byte as zero with no bit assigned.

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

- **ID:** P8.8 · **branch:** `feat/dna-remap` · **base:** `origin/main` (after P8.5) · **Model:** sonnet (SPEC-6 §7 is a 4-row decision table; the work is faithful translation + determinism)
- **depends-on:** P8.5
- **goal:** SPEC-6 §7 remap table as a pure backend module: given (patch, project-state snapshot) → remap proposal {auto-applied | needs-user-choice | skipped} per target, no UI (UI consumes it in P8.9).
- **Plausibility rules (quantified — these ARE the spec for "plausible"):** an effect target is plausible iff its `type` string equals the patch reference's effect type (registry IDs from `backend/src/effects/registry.py` `_REGISTRY` keys); a track target is plausible iff its media kind is compatible. Outcome thresholds: exactly **1** plausible candidate → auto-remap + notification; **2–20** → choice list, ordered deterministically (chain position, then track index); **>20** → choice list truncated to 20 + `truncated: true` flag; **0** → skip + warning. Same (patch, snapshot) input → byte-identical proposal (no randomness, no dict-order dependence).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger ls-tree origin/main backend/src/dna/migrations.py   # P8.5 merged (reader.py too if P8.5 split codec — check P8.5 PR body)
  git grep -n "interface Track" origin/main -- frontend/src/shared/types.ts                       # expect :57 (verified) — track shape for remap targets
  git grep -n "_REGISTRY: dict" origin/main -- backend/src/effects/registry.py                    # expect :8 (verified) — effect-type universe
  ```
- **scope (VERIFIED paths):** new `backend/src/dna/remap.py`, `backend/tests/test_dna/test_remap.py`.
- **DO-NOT-TOUCH:** frontend; zmq_server.py (IPC lands with P8.9).
- **steps:** (1) Effect-ID remap per the quantified rules above, with mapping report (`old_ref → new_ref` pairs). (2) Track remap: compatible-type selected track → propose; else enumerate candidates. (3) Choice-list path with deterministic ordering + truncation flag. (4) No match → skip + warning naming the unresolvable reference. (5) All outcomes serializable to plain JSON (dataclass → dict, no custom types) for IPC.
- **TEST PLAN:** `cd backend && python -m pytest tests/test_dna/test_remap.py -v --reruns=0` — named tests:
  - SPEC-6 §10.5 trio: `test_single_plausible_remap_auto_applied_with_notification`, `test_multi_remap_prompts_user`, `test_no_match_skips_with_warning` (**negative — unresolvable reference degrades, never raises**)
  - `test_unregistered_effect_type_skips_with_warning` — patch references an effect type absent from `_REGISTRY` (**negative**)
  - `test_choice_list_deterministic_order` — same input twice → identical proposal
  - `test_choice_list_truncates_at_20_with_flag`
  - `test_remap_report_serializable` — `json.dumps(proposal)` round-trips
- **ACCEPTANCE GATES:** SPEC-6 acceptance "Auto-remap works for plausible mismatches" (backend half); all 4 SPEC-6 §7 table rows covered by a named test; determinism test green; full suite green.
- **FAILURE MODES:** type-equality matching may be too strict (e.g. renamed effects) — aliasing is SPEC-6 §4.2.3's deprecated-effect mechanism, NOT remap's job; do not blur the two. Proposal for a 500-effect project must compute in <100 ms (it's dict lookups — assert in the determinism test with a perf guard).
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + pytest output naming all 7 tests.
- **Effort:** ~3h.

---

## P8.9 — Patch IMPORT path: IPC + `PatchImportDialog` + drag-drop

- **ID:** P8.9 · **branch:** `feat/dna-import-ui` · **base:** `origin/main` (after P8.4, P8.5, P8.8) · **Model:** opus (cross-layer integration: IPC + dialog + store mutation + undo semantics; Gate 14 wiring risk lives here)
- **depends-on:** P8.4, P8.5, P8.8 (~~P8.7 verify-if-signed~~ — removed, signing dropped per locked decision; files with non-zero flag bits import with the P8.3 warning, nothing more)
- **goal:** User can apply a `.dna`: File menu + drag-drop → IPC `dna_import` → validators (SG-2 + size caps) → remap proposal → `PatchImportDialog.tsx` shows budget verdict + remap UI → second IPC call `dna_import_apply` with the user's remap/consent choices → writes into stores via existing actions. Budget violation → toast with violations + "Apply anyway" consent (SPEC-6 §5.3).
- **"Typical patch" fixture (the perf yardstick, committed):** 10 effects + 32 mod_edges + 8 lanes + 2 macros, file ≤100 KB. "Import <1 s" means: `dna_import` (read+validate+remap proposal) round-trip ≤1000 ms on this fixture, asserted in the backend test, measured around the handler (not the dialog).
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "elif cmd ==" origin/main -- backend/src/zmq_server.py | head -3   # IPC dispatch pattern exists (first hits :246/:249/:267 — verified)
  git ls-tree origin/main backend/src/dna/remap.py backend/src/dna/validators.py                                        # P8.4 + P8.8 merged
  git grep -rn "dangerouslySetInnerHTML" origin/main -- frontend/src/renderer/components | wc -l                        # expect 0 (verified) — keep it that way (toast XSS rule)
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py` (add `dna_import` + `dna_import_apply` commands following the existing `elif cmd ==` dispatch + `_handle_*` pattern — reference implementation `audio_meter` at :342/:1028, verified), new `frontend/src/renderer/components/dna/PatchImportDialog.tsx`, IPC relay typing (follow existing command plumbing in `frontend/src/main/zmq-relay.ts` + `frontend/src/shared/types.ts`), `frontend/src/__tests__/components/dna-import.test.tsx`, `backend/tests/test_dna/test_ipc_import.py`.
- **DO-NOT-TOUCH:** export path (P8.10); undo internals — wrap store mutations with existing `undoable()` from `stores/undo.ts` (history-buffer rule; pre-generate UUIDs BEFORE the `undoable()` call per `undo.ts:5`); no new Zustand store unless ≤1 existing store fits poorly (record in PR body).
- **steps:** (1) Backend `dna_import`: read → size caps BEFORE decompress → budget check → remap report → return proposal (NO mutation). (2) Backend `dna_import_apply`: proposal id + user's remap/consent choices → validated again → apply. (3) Dialog: violations list, remap checkboxes (SPEC-6 §7), preview-before-commit; cancel path discards the proposal. (4) File menu entry + drag-drop onto app window (`.dna` extension filter). (5) Toasts per toast conventions (`source` field required for IPC error toasts). **Gate 14 wiring check (evidence in PR body):** entry AND cancel paths exercised; import into empty project AND into a populated legacy project; dialog unmount mid-proposal leaks nothing.
- **TEST PLAN:**
  ```
  cd backend && python -m pytest tests/test_dna/test_ipc_import.py -v --reruns=0
  cd frontend && npx --no vitest run src/__tests__/components/dna-import.test.tsx
  cd frontend && npx --no vitest run   # full frontend suite
  ```
  Backend named tests: `test_import_returns_proposal_without_mutating`, `test_import_rejects_oversize` (**negative**), `test_import_corrupt_gzip_returns_structured_error_not_crash` — corrupt fixture through the REAL IPC handler → `ok:false` + error code, sidecar stays alive (**negative**), `test_import_budget_violation_lists_all_violations` (**negative**), `test_apply_with_consent_flag_recorded`, `test_apply_without_consent_on_violating_patch_refused` (**negative**), `test_import_typical_fixture_under_1000ms` (perf gate).
  Frontend named tests: `test_dialog_shows_violations_list`, `test_remap_choice_roundtrips_to_apply_call`, `test_cancel_leaves_stores_untouched`, `test_apply_creates_single_undo_entry`.
- **ACCEPTANCE GATES:** SPEC-6 acceptance "Patch import UI accessible from File menu + drag-drop"; perf test green (≤1000 ms on the committed fixture); applying a patch is exactly ONE undo entry (named test); corrupt-file negative test proves the sidecar survives hostile input; both suites green.
- **FAILURE MODES:** drag-drop and File-menu paths diverging (one validated, one not) — both MUST funnel into the same `dna_import` handler, assert in code review; proposal staleness (project edited between propose and apply) — `dna_import_apply` re-validates against current state and returns a fresh-proposal-required error rather than applying stale remaps.
- **ROLLBACK:** revert PR — IPC command removal is safe (no other callers; verify `git grep -rn "dna_import"` before revert).
- **EVIDENCE:** PR + both test outputs + screen recording or screenshot of dialog applying the fixture patch (Live Runtime Check: name the runtime path in the "try it" message).
- **Effort:** ~4h.

---

## P8.10 — Patch EXPORT path: IPC + `PatchExportDialog` + budget editor

- **ID:** P8.10 · **branch:** `feat/dna-export-ui` · **base:** `origin/main` (after P8.9) · **Model:** opus (closes the whole E2 chain — the round-trip integration test here is the proof the previous 7 packets compose)
- **depends-on:** P8.4, P8.5, P8.9 (shares IPC plumbing); ~~P8.7 sign checkbox~~ — removed, signing dropped per locked decision
- **goal:** User exports current project's recipe as `.dna`: `dna_export` IPC serializes effect graph + operators + mod_edges + lanes + macros (NO source content, SPEC-6 §2); budget auto-computed, user may tighten only. **This packet also ships the chain-closing integration test: UI export → file on disk → import → identical render hash.**
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -n "dna_import" origin/main -- backend/src/zmq_server.py   # P8.9 merged
  git grep -n "modRoutes" origin/main -- frontend/src/shared/types.ts                                         # expect :344 (verified) — INJ-1 field name (Pad.mappings→modRoutes shipped #152); export must use modRoutes
  git grep -n "is allowed" origin/main -- frontend/src/main/file-handlers.ts | head -2                        # save-path validation exists (verified :20-22) — export writes go through it
  ```
- **scope (VERIFIED paths):** `backend/src/zmq_server.py` (`dna_export` handler), new `frontend/src/renderer/components/dna/PatchExportDialog.tsx`, `frontend/src/__tests__/components/dna-export.test.tsx`, `backend/tests/test_dna/test_ipc_export.py`, new `backend/tests/test_dna/test_roundtrip_integration.py`.
- **DO-NOT-TOUCH:** import path internals (consume `dna_import`/`dna_import_apply` as-is — if they need changes, that's a P8.9 bug, file it); project save format (`.entropic`/project-persistence) — `.dna` is a separate artifact.
- **steps:** (1) Serializer maps live project state → `.dna` sections (omit sources/history/identity per SPEC-6 §2 table — the test asserts the omission, not just the inclusion). (2) Budget auto-compute via P8.4. (3) Dialog: name/description/author, budget editor (tighten-only). (4) File write through `file-handlers.ts` path validation (no raw `fs` writes from renderer). (5) **Round-trip integration test (rubric: full chain):** build a seeded project state (3 effects + 4 mod_edges + 2 lanes, fixed-seed source frames) → render frames {0, N/2, N−1} through `apply_chain` → SHA-256 each RGB buffer → `dna_export` → file → `dna_import` + `dna_import_apply` into an EMPTY project → re-render same frame indices on the same source → **all 3 hashes byte-identical**. Runs through the real IPC handlers (ZMQ in-proc or handler-level invocation), not by calling codec functions directly.
- **TEST PLAN:**
  ```
  cd backend && python -m pytest tests/test_dna/test_ipc_export.py tests/test_dna/test_roundtrip_integration.py -v --reruns=0
  cd frontend && npx --no vitest run src/__tests__/components/dna-export.test.tsx
  cd frontend && npx --no vitest run   # full frontend suite
  ```
  Backend named tests: `test_export_omits_source_content` — exported JSON contains zero source paths/frames/embedded media (**negative-by-assertion**), `test_export_budget_reflects_project`, `test_export_import_roundtrip_render_hash_identical` (the chain-closer above), `test_export_then_reexport_byte_identical` (export → import → export → byte-equal, exercises P8.5 round-trip through the full stack), `test_export_typical_project_under_1000ms` (perf gate, same yardstick class as P8.9).
  Frontend named tests: `test_budget_editor_cannot_loosen` (**negative**), `test_export_writes_via_validated_save_path`, `test_dialog_cancel_writes_nothing` (**negative**).
- **ACCEPTANCE GATES:** SPEC-6 acceptance "Patch export UI accessible + lets user set budget"; **render-hash round-trip test green — this is the E2 chain's definition of done**; export ≤1000 ms on the typical fixture; one exported `.dna` committed as a version-pinned fixture for future migration tests (Lint-5 feed); both suites green.
- **FAILURE MODES:** render-hash mismatch from nondeterministic effects (time-seeded noise etc.) — the integration test must pin every seed/param; if an effect is irreducibly nondeterministic, swap it out of the test chain and note which (the test exists to catch serialization loss, not effect nondeterminism); hash mismatch from float param truncation in JSON — serialize params with full `repr` precision, asserted by `test_export_then_reexport_byte_identical`.
- **ROLLBACK:** revert PR.
- **EVIDENCE:** PR + test outputs (round-trip hash test highlighted) + a real exported `.dna` attached to the PR.
- **Effort:** ~4h.

---

## P8.11 — SG-6: cooperative cancellation contract (library + contract tests)

- **ID:** P8.11 · **branch:** `feat/sg6-cancellation` · **base:** `origin/main` · **Model:** opus (concurrency + signal handling + timing-sensitive tests — the classic flaky-test minefield)
- **depends-on:** none (independent; REQUIRED before P8.14 A2 build)
- **goal:** The SG-6 contract from vision §10 ("workers yield cancel-check every N frames; UI Stop propagates with 5s deadline" — vision line 217, N left unquantified there; **this packet pins it**): a reusable `CancelToken` primitive + deadline supervisor + a 1-page contract doc. SPEC-3 §6 deferred the SG-6 spec "until Genoscope starts" (SPEC-3:397) — this packet IS that start.
- **Contract defaults (quantified — recorded in DEC-SG6-001 as THE numbers):**
  | Parameter | Default | Meaning |
  |---|---|---|
  | `check_every_n_frames` | **8** | worker calls `token.check()` at least once per 8 frames/iterations |
  | `max_check_interval_ms` | **250** | AND at least every 250 ms wall-clock (whichever comes first — covers slow frames) |
  | `stop_deadline_ms` | **5000** | cancel → worker must exit within 5 s |
  | `kill_escalation` | SIGTERM at 5 s, **SIGKILL at 5 s + 2 s grace** | non-yielding worker is terminated, then force-killed |
  | structured log fields | `pid`, `deadline_ms`, `frames_completed`, `signal_used` | every forced termination logged |
- **PRECONDITIONS (mismatch → STOP):**
  ```
  git -C ~/Development/entropic-v2challenger grep -rn "SG-6" origin/main -- docs | head -3        # expect EMPTY (verified 2026-06-11) — no SG-6 implementation doc on main
  git grep -rln "CancelToken\|cancel_token" origin/main -- backend/src | head -3                  # expect EMPTY (verified) — greenfield
  ```
- **scope (VERIFIED paths):** new `backend/src/cancellation.py` (token + deadline supervisor; threading + multiprocessing variants), new `backend/tests/test_cancellation.py`, new `docs/decisions/DEC-SG6-001-cancellation-contract.md` (API surface, the defaults table above, enforcement point, owner — the four columns SPEC-3 uses for each gate).
- **DO-NOT-TOUCH:** existing render/export paths (adoption is opt-in per-worker, wired when A2/Genoscope and long exports adopt it); zmq_server.py.
- **steps:** (1) `CancelToken.check()` raising `CancelledError`; `CancelToken.cancel()` thread/process-safe; `yield_every(n=8)` helper for frame loops that also honors `max_check_interval_ms`. (2) Deadline supervisor: cancel → wait ≤5 s for clean exit → SIGTERM → 2 s grace → SIGKILL + structured log. (3) Contract doc with the defaults table. (4) Timing tests with explicit tolerance windows (below) — no `sleep`-and-hope assertions.
- **TEST PLAN:** `cd backend && python -m pytest tests/test_cancellation.py -v --reruns=0` — named tests (**the timed ones MUST use real subprocesses — Darwin signal semantics are the point; no mock clocks for the kill path**):
  - `test_cancel_within_deadline_clean_exit` — worker with `yield_every(8)` over 10 ms synthetic frames exits within **500 ms** of cancel (8 frames × 10 ms × safety factor; quantifies "cooperative is fast")
  - `test_non_yielding_worker_terminated_at_5s` — busy-loop worker that never calls `check()`: cancel at t₀, assert SIGTERM'd with **4.5 s ≤ elapsed ≤ 6.5 s** (real subprocess, wall-clock; window absorbs CI scheduling jitter) (**negative — the worker that ignores the contract**)
  - `test_sigterm_ignored_escalates_to_sigkill` — worker traps SIGTERM and keeps looping: assert SIGKILL'd by **t₀ + 5 s + 2 s grace + 1 s tolerance ≤ 8 s** and the structured log records `signal_used=SIGKILL` (**negative**)
  - `test_cancel_check_every_n_frames` — 100-frame worker with `yield_every(8)` → token records **≥12** checks (⌈100/8⌉)
  - `test_max_check_interval_fires_on_slow_frames` — 1 frame/s worker still checks at ≥3 Hz via the 250 ms interval rule
  - `test_multiprocessing_token_propagates` — cancel set in parent visible in child within 250 ms
  - `test_cancel_idempotent` — double-cancel, cancel-after-exit: no error, no double-kill
  - `test_forced_termination_logged_structured` — log line parses as JSON with all 4 fields
- **ACCEPTANCE GATES:** all 8 named tests green with `--reruns=0` (timing tests must pass on a single run — a rerun-masked timing test is a failed gate); doc merged with the defaults table; ROADMAP SG-6 row flips ❌→✅(lib).
- **FAILURE MODES:** CI runner slower than this Mac → the tolerance windows above are sized for that (±1.5 s on the 5 s deadline); if a window still flakes, widen the window in ONE constants block and note it in DEC-SG6-001 — do not add reruns; SIGKILL'd workers can leak temp files → supervisor logs `frames_completed` so the caller can clean partial output (cleanup itself is the adopting worker's contract, documented in DEC-SG6-001).
- **ROLLBACK:** revert PR — zero callers.
- **EVIDENCE:** PR + pytest output showing the three timed tests with their measured elapsed times printed.
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
  cd ~/Development/entropic-v2challenger/backend && python3 -c "import sys; sys.path.insert(0,'src'); from effects.registry import _REGISTRY, register; print(len(_REGISTRY))"   # PINNED (verified 2026-06-11): registry = backend/src/effects/registry.py — `_REGISTRY: dict[str, dict]` at :8, `def register(effect_id, fn, params, name, category)` at :38. STOP if not importable headless or count < 200
  ```
- **scope (VERIFIED paths):** spike code quarantined under new `backend/scripts/genoscope_spike/` (pattern: `backend/scripts/demo_trilogy/` exists on main for exactly this kind of runner) + the report doc. Spike code is throwaway-grade but committed for reproducibility.
- **DO-NOT-TOUCH:** `backend/src/**` (no production modules from a spike); frontend.
- **steps:** (1) Minimal genome codec for a patch subset. (2) GA loop (pop 64, tournament select, the 4 operator types) against synthetic fitness. (3) Run 10 generations, record throughput/memory (use `resource.getrusage`). (4) Abort test via CancelToken. (5) Write report with the 6 measured answers + a GO/NO-GO-shaped recommendation for spec scope.
- **TEST PLAN (grep-checkable spike deliverable):** `python backend/scripts/genoscope_spike/run_spike.py --pop 64 --gens 10 --report docs/decisions/DEC-A2-001-genoscope-spike.md` completes; then:
  ```
  grep -c "^## (" docs/decisions/DEC-A2-001-genoscope-spike.md            # expect exactly 6 — sections "## (a)".."## (f)"
  grep -cE "[0-9]+(\.[0-9]+)? (evals/sec|MB|s\b|seconds)" docs/decisions/DEC-A2-001-genoscope-spike.md   # expect ≥ 3 — real measured numbers, not prose
  grep -cE "^RECOMMENDATION: (GO|NO-GO|GO-WITH-SCOPE-CUTS)" docs/decisions/DEC-A2-001-genoscope-spike.md # expect exactly 1
  ```
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
- **PRECONDITIONS (mismatch → STOP):** run phase-7's canonical G-CHECK verbatim (quoted below), then check the spec exists:
  ```bash
  python3 - <<'EOF'
  import json, pathlib, sys
  p = pathlib.Path.home() / ".entropic" / "q7-report.json"
  if not p.exists():
      sys.exit("STOP: REAL Q7 verdict file missing at ~/.entropic/q7-report.json. Run P7.0.")
  d = json.loads(p.read_text())
  if d.get("backend") == "mock":
      sys.exit("STOP: verdict file is from the MOCK backend. Not acceptable. Run P7.0.")
  state = d.get("verdict", {}).get("state")
  if state != "TIER_5_GO":
      sys.exit(f"STOP: verdict is {state!r}. Phase 7 is gated. See P7.0N (NO-GO branch).")
  print(f"GATE OK: TIER_5_GO on backend={d['backend']} p95={d['verdict']['canonical_p95_ms']}ms")
  EOF
  ls docs/roadmap/specs/entropic-spec-8-genoscope.md
  ```
- **scope:** `backend/scripts/e8_spike/` + report doc only. **DO-NOT-TOUCH:** production packages.
- **steps:** (1) Cherry-pick the CLIP/CLAP encode commits from q7 branches into the spike dir ONLY if needed (note: cherry-pick rule applies — enumerate via `git log origin/main..<branch> --oneline` in `~/Development/entropic-q7-clip` / `entropic-q7-clap`). (2) Build 10 probe pairs. (3) Measure + report.
- **TEST PLAN (grep-checkable spike deliverable):**
  ```
  test -f docs/decisions/DEC-E8-001-fusion-fitness.md
  grep -cE "^RANKING: (PASS|FAIL) [0-9]+/10" docs/decisions/DEC-E8-001-fusion-fitness.md   # expect exactly 1 — the ≥8/10 cross-modal ranking verdict, stated as a machine-readable line
  grep -cE "[0-9]+(\.[0-9]+)? ?ms" docs/decisions/DEC-E8-001-fusion-fitness.md             # expect ≥ 4 — per-head latency table has real numbers (CLIP-text, CLIP-image, CLAP, optical-flow at minimum)
  ```
- **ACCEPTANCE GATES:** report merged with measured verdict; E8 SPEC packet (P8.16, authored then) is GO/NO-GO'd by it.
- **ROLLBACK:** delete spike dir + doc.
- **EVIDENCE:** PR + ranking-table from the report.
- **Effort:** ~4h. **RISK:HIGH** (user-blocked precondition + research-class).
- **Follow-on (do not pre-author):** P8.16 = E8 SPEC (`entropic-spec-9-vibe-to-patch.md`, same structural checks as P8.13); E8 build packets live inside that spec.

---
---

## Phase 9 — Tier 7: SG-9 + E7 Plugin SDK — ⛔ ENTIRE TIER SUSPENDED (IF-EVER)

> **⛔ LOCKED DECISION 2026-06-11: Tier 7 demoted to IF-EVER, gated on a second user existing. SG-9 quotas and signing dropped.** No P9 packet may be picked up. P9.3 (quotas) and P9.4 (signing/trust) are doubly dead — their subject matter was dropped outright, and P9.4's dependency P8.7 is suspended. P9.1/P9.2/P9.5 are suspended with the tier. Bodies below are preserved un-thickened for if-ever revival; on revival, re-run every PRECONDITION and re-verify every path — none have been maintained since suspension.

E7 is 2XL with deps B1 (✅ #148) + 🚧SG-9 (vision E7 row). SG-9: "per-plugin CPU/RAM/disk/FD/IPC quotas; Ed25519-signed default; unsigned = explicit opt-in with red-flag UI" (vision §10). Both are research-class → spike→spec→build chains. **Do not start P9 build packets before Tier 6 E2 has merged** — the SDK's patch interchange rides on `.dna`.

## P9.1 — E7/SG-9 SPIKE: macOS subprocess sandbox + quota feasibility (research-class) — ⛔ SUSPENDED

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

## P9.2 — E7 Plugin SDK SPEC (spike #2 of chain) — ⛔ SUSPENDED

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

## P9.3 — SG-9 quota enforcement library ⚠ RISK:HIGH — ⛔ SUSPENDED (quotas dropped by locked decision)

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

## P9.4 — SG-9 signing + trust UX (Ed25519 default; unsigned = red-flag opt-in) — ⛔ SUSPENDED (signing dropped; dependency P8.7 also suspended)

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

## P9.5 — E7 BUILD seed: plugin host harness + hello-world plugin — ⛔ SUSPENDED

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
LIVE (Tier 6):
P8.1 ──► P8.2 ──► P8.3 ──► P8.4 ──► P8.5 ──► P8.6 (lint; LIVE per reconciliation note)
                                       └──► P8.8 ──► P8.9 ──► P8.10 (export + render-hash round-trip = E2 done)
P8.11 ──► P8.12 ──► P8.13 ──► P8.14 (build; degraded fitness)
              (Q7 REAL verdict ⏸ user) ──► P8.15 ──► [P8.16 spec → E8 builds]

⛔ SUSPENDED (locked decision 2026-06-11 — kept for if-ever revival):
[P8.7 signing] ──► [P9.4 trust UX]
[P8.2–P8.10 + P9.1 ──► P9.2 ──► P9.3 ──► P9.5; P9.4 ──► P9.5]   (entire Tier 7)
```

**Depends-on resolution check (thickness pass 2026-06-11):** every LIVE packet's depends-on names only LIVE packets — P8.9 and P8.10 had P8.7 edges (verify-if-signed / sign checkbox); both removed in place. P8.13/P8.14/P8.15 unchanged (their deps P8.11→P8.12→P8.13 are live; Q7 gate is user-blocked, not suspended). No live packet depends on P8.6's output, so flipping P8.6's banner either way breaks nothing.

**User-blocked items (⏸):** P8.15 (and full-fitness A2) on Q7 REAL benchmark run; `.github/workflows/dna-lint.yml` merge in P8.6 (workflow files = manual user merge); P8.1 requires a verbatim user decision quote to merge.

---

## Thickness-pass scorecard (2026-06-11)

Rubric: ① anchors re-verified against `origin/main` @ `d821ae8` / payload `9ab2ea4` · ② 11-field contract + Model tier · ③ named tests w/ behavior-keyword titles + exact commands · ④ gates quantified · ⑤ failure modes + ≥1 negative test · ⑥ import/export round-trip integration · ⑦ depends-on resolve.

| Packet | Status | ① | ② | ③ | ④ | ⑤ | ⑥ | ⑦ | Notes |
|---|---|---|---|---|---|---|---|---|---|
| P8.1 DEC | LIVE | ✅ | ✅ opus | ✅ grep-based | ✅ scored matrices, 2 `CHOSEN:` lines | ✅ Rejected-options section | n/a | ✅ | Option C added per locked "simplified — JSON" |
| P8.2 cherry-pick | LIVE | ✅ 32/16/`839345f`/611-ins re-verified | ✅ sonnet | ✅ all 21 payload test names listed | ✅ `--reruns=0` gate | ✅ 5 payload negatives + 3 failure modes | n/a | ✅ | Relocation proven import-safe (`parents[2]` depth) |
| P8.3 header | LIVE | ✅ codec.py:39 | ✅ sonnet | ✅ 8 named | ✅ 16-byte preamble, ×16 truncation fuzz | ✅ 3 negatives | n/a | ✅ | bit0 retired (signing dropped); Option C variant inline |
| P8.4 SG-2 budget | LIVE | ✅ pipeline.py:24 `MAX_CHAIN_DEPTH=10` | ✅ opus | ✅ ≥10 named | ✅ 7-key range table, 50 MB/200 MB caps | ✅ 6 negatives incl. budget-exceeding patch + zip bomb | n/a | ✅ | |
| P8.5 compat | LIVE | ✅ **precondition fixed** — `bindingRule` is in `axis-binding.ts:59`, not types.ts | ✅ opus | ✅ 8 named | ✅ 7 shadow sites, 4 fixtures | ✅ 2 negatives incl. unknown-schema-version | n/a | ✅ | Byte-identity now unconditional |
| P8.6 lint | **LIVE** (see reconciliation note) | ✅ workflows dir = test.yml only | ✅ sonnet | ✅ 7 named | ✅ 5/5 rules each w/ failing self-test | ✅ 5 negatives | n/a | ✅ | Lint-3 enum set pinned to 5 enums; trigger paths corrected to incl. axis-binding.ts |
| P8.7 signing | ⛔ SUSPENDED | — | — | — | — | — | — | ✅ knock-ons propagated | Not thickened (locked decision) |
| P8.8 remap | LIVE | ✅ Track types.ts:57, `_REGISTRY` registry.py:8 | ✅ sonnet | ✅ 7 named | ✅ 1/2–20/>20/0 thresholds, <100 ms guard | ✅ 2 negatives | n/a | ✅ | Determinism made testable |
| P8.9 import | LIVE | ✅ audio_meter :342/:1028, XSS grep 0 | ✅ opus | ✅ 7 backend + 4 frontend named | ✅ ≤1000 ms on pinned fixture | ✅ 4 negatives incl. corrupt gzip via real IPC | partial (apply path) | ✅ P8.7 edge removed | Two-phase propose/apply pinned |
| P8.10 export | LIVE | ✅ modRoutes :344, file-handlers :20 | ✅ opus | ✅ 5 backend + 3 frontend named | ✅ ≤1000 ms; fixture committed for Lint-5 | ✅ 3 negatives | ✅ **render-hash round-trip = E2 definition of done** | ✅ P8.7 edge removed | |
| P8.11 SG-6 | LIVE | ✅ greenfield greps empty | ✅ opus | ✅ 8 named | ✅ N=8 frames / 250 ms / 5 s / +2 s SIGKILL; timed windows 4.5–6.5 s & ≤8 s | ✅ 3 negatives, real subprocesses | n/a | ✅ | Vision's unquantified "N frames" pinned here |
| P8.12 A2 spike | LIVE (kept thin by design) | ✅ registry pinned | — (spike) | ✅ grep-checkable | ✅ 6 sections + `RECOMMENDATION:` line | spike-grade | n/a | ✅ | Verified-only per scope |
| P8.13 / P8.14 | LIVE (not in thicken scope) | — | — | — | — | — | — | ✅ | Untouched by design |
| P8.15 E8 spike | ⏸ Q7-blocked (kept thin) | — | — | ✅ grep-checkable `RANKING:` line | ✅ ≥4 latency numbers | spike-grade | n/a | ✅ | Verified-only per scope |
| P9.1–P9.5 | ⛔ SUSPENDED (whole tier) | — | — | — | — | — | — | ✅ consistent | Not thickened (locked decision) |
