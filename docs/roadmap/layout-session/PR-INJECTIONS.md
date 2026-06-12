# PR-INJECTIONS — for the Creatrix BUILD session

> Hand-off from the instruments/performance planning session (2026-06-03). These 4 items must land in
> the in-flight sweep PRs **before they lock**, because the instrument builds (B1–B10, see
> `INSTRUMENTS-BUILD-PLAN.md`) depend on them. All verified against the codebase @ 6e0e3e9.
> Source of each requirement: `INSTRUMENTS.md` §10 review + `INSTRUMENTS-BUILD-PLAN.md` §2.1.

## 1. PR-B — rename `Pad.mappings → Pad.modRoutes`
- **Why:** resolves the `Operator.mappings` collision (PLAN §7.7 / qa-redteam L4) WITHOUT colliding with
  the existing `DEFAULT_PAD_BINDINGS` keycode constant (`frontend/src/shared/constants.ts:31`).
  `padBindings` (the originally-proposed name) would create a worse near-collision — use **`modRoutes`**.
- **Scope:** `types.ts:344`, `stores/performance.ts` (8 sites incl. undo closures), `padActions.ts`,
  `applyPadModulations.ts`, `PadCell/PadEditor/PadGrid.tsx`, persistence (`drumRack` round-trip), + tests.
- **When:** in the **v3 schema break** (single location — do NOT also do it in a later instrument PR; that
  would cause a v3 file with `pads[].mappings` an updated build reads as undefined).

## 2. PR-B — fix `_topological_sort` (cycle detection)
- **File:** `backend/src/modulation/engine.py:20`.
- **Reality vs PLAN.md §4.5:** the real function is `list[dict]`, reads `parameters.sources`, handles
  **Fusion-only**, and on a cycle **logs a warning + falls back to declaration order** (returns stale
  `0.0`) — it does NOT raise. PLAN.md §4.5's proposed `op.mappings` signature does not match.
- **Required:** correct the signature to the real shape, make it **raise `ModulationCycleError`**, and
  walk ALL operator-to-operator edges (not just Fusion). B9 (tensor routing) + SG-5 depend on this.

## 3. PR-A/PR-B — backend caps + frame_index guard on the composite path
- **File:** `backend/src/zmq_server.py` `_handle_render_composite` (~:728).
- **Today:** bare `frame_index = int(layer_info.get("frame_index", 0))` — no clamp; flows to
  `reader._decode_with_seek` (`video/reader.py:51-54`) → **negative seek**. The single-frame path
  (`_handle_render_frame:512-526`) IS guarded; the composite path is not.
- **Required:** (a) per-layer `frame_index` guard: reject `< 0`, clamp top with the 2-frame tail buffer
  (mirror `_handle_render_frame`). (b) add `MAX_COMPOSITE_LAYERS` to `backend/src/security.py`, rejected
  at `_handle_render_composite` **before** the decode loop (the "4-voice cap" is a UX convention; the
  security boundary must be backend-enforced — 50×4K layers = 16GB-Mac freeze).
- **Note:** B1 will carry the frame_index guard itself if PR-A/B haven't; but `MAX_COMPOSITE_LAYERS`
  belongs in the sweep since any composite producer is exposed.

## 4. PR-A — real "Sampler" entry in the `instruments` browser tab
- The instruments tab currently ships a **placeholder**. B1 (`B1-1VOICE-SAMPLER-PLAN.md`) needs a real,
  draggable/double-clickable "Sampler" entry (disabled w/ tooltip when no base clip is on the timeline).
- B1 itself is a **separate minimal PR after PR-A** — do NOT fold the Sampler logic into PR-A (keeps PR-A
  info-only). PR-A only needs the browser entry to exist.

## 5. PR-B — B4-lite schema additions (from Vision session, 2026-06-03)
- **Why:** Vision Tier 1 unlocks the wavetable-axes paradigm via axis-binding metadata on Lanes + mod-edges.
  Without this in PR-B's automation schema break, Y-is-Time / painted-blur / audio-LFO-stripes demos can't
  ship, and I3 inline action menu has no routing graph to populate.
- **Full spec:** `~/.claude/plans/entropic-spec-2-b4lite-schema.md` (~280 lines, file:line-cited, includes
  validator pseudocode, file inventory, tests, acceptance criteria).
- **Required additions to PR-B (≈250 lines, schema-additive, backward-compat by construction):**

  **5a. New shared types (`frontend/src/shared/types.ts`):**

  Lowercase axis is canonical (per parallel-session 2026-06-03 08:11 review P1-A — already serialized lowercase in SPEC-4 demos + SPEC-6 `.dna`). Full 8-member BindingRule union ships; validator gates by tier.

  ```ts
  export type Axis = 't' | 'y' | 'x' | 'c' | 'f' | 'l'

  // Full 8-member union — tier-gated by writer-validator (5d).
  // Tier 1 accepts only 'broadcast'. B9 widens to {broadcast, sampleAt, scanOver, integrate, painted}.
  // hilbert/polar/learned reserved for Tier 6+ research.
  export type BindingRule =
    | 'broadcast' | 'sampleAt' | 'scanOver' | 'integrate' | 'painted'
    | 'hilbert' | 'polar' | 'learned'
  ```

  **5b. Lane extensions (optional fields on the unified Lane type PR-B introduces):**
  ```ts
  interface Lane {
    // ...existing fields (id, trackId, effectId, paramPath, mode, color, points)
    domain?: Axis              // default 't'
    direction?: number         // default 1; signed real
    binding_rule?: BindingRule // default 'broadcast'
  }
  ```

  **5c. OperatorMapping extensions (sit alongside existing `source_id` / `target_param_path` / `depth`):**
  ```ts
  interface OperatorMapping {
    // ...existing fields
    src_axis?: Axis              // default 't'
    dst_axis?: Axis              // default 't'
    binding_rule?: BindingRule   // default 'broadcast'
  }
  ```

  **5d. WRITER-SIDE VALIDATOR (critical — per CTO review pass):**
  Schema accepts all 5 binding rules; renderer only implements `broadcast` in Tier 1. Without a writer guard,
  `.dna` files could encode values that BEHAVE DIFFERENTLY when Tier 3 lands actual semantics. Validator
  REJECTS `binding_rule` not in `{'broadcast'}` and `domain` not in `{'t','y','x'}` on every save / store
  mutation. Backend mirror in `backend/src/project/schema.py`.

  **5e. Renderer change (the actual paradigm unlock — ~15 lines):**
  In the lane-evaluation path PR-B refactors (likely `applyEffectModulations.ts` or wherever PR-B lands the
  unified evaluation): when `lane.domain === 'y'`, evaluate the curve at `current_y / frame_height`
  instead of `current_t / duration`. Same pattern for `domain === 'x'`. Default `'t'` = existing behavior.

- **Estimated added cost to PR-B:** ~2-3 hrs on top of PLAN v1.2's existing 12-18h.
- **Recommended commit boundary inside PR-B:**
  1. Existing PR-B automation unification (`isTrigger` → `InterpolationMode`)
  2. **This injection** (B4-lite axis fields + validator + renderer domain evaluation)
  3. Existing PR-B BPM split + cycle detection + export snapshot
- **Tests:** validator unit (4 reject cases + 4 accept cases) + Lane evaluation with `domain='y'` over
  100-row frame + Y-is-Time demo project round-trip + backward-compat (old lane without fields → defaults).
  ~120 lines of test code. Full breakdown in SPEC-2 §7.
- **Coordination:** Vision session has 3 demo `.entropic` projects ready that depend on this schema
  (`~/.claude/plans/entropic-spec-4-demo-trilogy.md`). Demo trilogy ships separately AFTER PR-B but
  cannot ship without this schema present.

---
**Coordination:** Original session (2026-06-03 00:31) wrote items 1-4. Vision session (2026-06-03 evening)
appended item 5 above plus 5 new spec docs in `~/.claude/plans/entropic-spec-{1,2,3,4,5,6}-*.md`. SPEC-1
crosswalk maps every Vision PRD to every Creatrix build. SPEC-3 contracts SG-1/3/5/8. SPEC-5 specs the
multi-headed L backbone (DINOv2+CLIP+CLAP) + SG-4 process isolation. SPEC-6 specs `.dna` patch format
with no-regression CI lint. Read SPEC-1 first for the crosswalk + ownership matrix; everything else
references it.

---
## ⚠️ CLAIM 2026-06-04 (Vision/eng session)
**INJ-1 (`Pad.mappings → Pad.modRoutes`) is being done NOW on branch `feat/inj1-modroutes-rename` (PR pending).** Do NOT also do this rename in PR-B or any instrument PR — it is a single-location v3 schema break; a double-rename corrupts `.entropic` round-trip. Renames ONLY the `Pad` field (`ModulationRoute[]`), NOT `Operator.mappings`. INJ-2 (#150 toposort-raise) and INJ-3 (#151 composite caps) also shipped de-stacked off main.
