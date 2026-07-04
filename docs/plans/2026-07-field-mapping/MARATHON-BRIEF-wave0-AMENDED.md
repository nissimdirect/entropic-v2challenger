# MARATHON BRIEF — Wave 0 + U0 (pre-routed preset MVP)

**For:** the `/marathon` SDLC cascade (spec → decisions → plan → packetize → build → UAT → gates → archive).
**Repo:** `~/Development/entropic-v2challenger` (Creatrix) · **Plan on main:** `docs/plans/2026-07-field-mapping/` (PR #419, merged).
**Scope (HARD):** Wave 0 (`prd/PRD-wave0-preset-mvp.md`) + U0 (`prd/PRD-mix-macro.md`, `prd/PRD-edge-curve-ui.md`). **Do NOT marathon past this** — K1/ST/P1+ are separate future marathons (learning #206: no multi-phase blind build). This slice needs **no new engine.**

## Why this is marathon-ready
Already spec'd, reviewed (`REVIEW.md`), one-shot-assessed (LOW risk), decisions locked (D1–D4), and the integration surface is **verified against real code** (`SPIKES.md`, `HANDOFF.md §4`). The marathon's spec/decisions phases are effectively pre-done — go near-straight to packetize.

## ⚡ UNIFICATION PASS (2026-07-03) — read `UNIFICATION-2026-07-03.md` FIRST
A /cto coherence pass (144 agents, doc-coherence + codebase ground truth) reconciled this brief with the routing design suite (`~/.claude/plans/creatrix-routing-suite-INDEX.md`). **User-locked decisions (2026-07-03, do not re-litigate):**
- **UD-1 Addressing = instance-UUID end-to-end.** The wire currently carries only effect TYPE ids (`ipc-serialize.ts:45`; backend `effect_map` keyed by type, `modulation/routing.py:214-218`, silent drop `:310`). Packet 1 adds the instance id to `SerializedEffectInstance` + keys the backend map by instance with TYPE fallback for legacy mappings. This makes the id-remap test real, enables duplicate-effect-type compositions, and fixes the live no-op bug (LFOEditor.tsx:31 / ModulationMatrix.tsx:121 write instance UUIDs that never resolve today).
- **UD-2 Wave 0 runs first; B's browser folder-tree wins the IA.** Packet 0a (History Ledger discipline) rides in front; Packet 2 builds folders/search INSIDE PresetBrowser (embeddable, no new top-level chrome) so B's tree re-hosts it as the PRESETS node.
- **UD-3 Merge gate = STRICT FULL-TIER.** No packet merges until the full suite is green. This supersedes "merge on SMOKE-green" below and REQUIRES Packet 00 (CI stabilization) before anything else.
- **UD-5 Edge-curve v1 = enum picker** (existing 4-value `CurveType` + additive `smoothstep`), applied in `resolve_routings`; draggable-points editor deferred to K1.
- UD-4 (default, user may override): factory packs = subfolders of `<Documents>/Creatrix/Presets/`; `~/.creatrix/user-library/` stays with B's browser epic; EXECUTION-PLAN P3.2's `~/.creatrix/presets/<tab>/` path is superseded.

## The two human touchpoints (exactly two)
1. **Approve the packet plan** — after packetize, before build. Go/no-go on the ~5 packets below.
2. **Ship sign-off** — after build + UAT + gates, before merge/archive. Approve the merge (docs+code PR).
Everything between runs autonomously with per-packet gates.

## Packets (packetize input — amended per UNIFICATION 2026-07-03)
| # | Packet | Files (verified) | Risk | Hard oracle |
|---|--------|------------------|------|-------------|
| **00** | **CI stabilization to FULL green** (REQUIRED by UD-3 before any other packet merges) | e2e regression specs (shards 2–3: chaos/edge-cases/security-gates/ux-contracts); sidecar: `test_calibration.py::test_numeric_params_have_unit` (`fx.copy_machine.feedback_amount` missing `unit`) + 2 `test_zmq*` failures; `frontend/src/renderer/App.tsx:4373` tsc error (PresetSaveDialog `parameters` prop) | MED | main-push CI fully green incl. e2e-full + sidecar · `tsc -b` clean |
| **0a** | **History Ledger discipline** (B item 1, rides free) | new lint-style test over `undoable()` call sites (non-empty, non-generic descriptions); upgrade generic descriptions in Wave-0-touched paths (`project.ts` 'Add effect' etc.) | LOW | ledger lint test green · touched paths emit specific descriptions |
| 1 | **Preset routes: schema + save + apply + instance addressing (UD-1)** | `preset.schema.json` (add `chainData.routes[]` + `presetSchemaVersion` + `effects.maxItems` 10→24); `PresetSaveDialog.tsx` (collect `mappings`→routes; fix :10 prop type); `App.tsx:3757` apply (materialize routes+macros, ONE undo transaction "Apply preset: <name>"); **`shared/ipc-serialize.ts` (+instance id on wire)**; **`modulation/routing.py` (`effect_map` keyed by instance id, TYPE fallback, log dropped targets)**; route validation on preset load (`validateMappingForSave`-equivalent) | **HIGH** | wired round-trip byte-identical · **id-remap test (UUID-scoped, now real)** · **duplicate-effect-type routing test** (two datamosh, route to one) · macros applied (today: silently dropped) · apply==ONE undo entry · backward-compat (old presets + legacy TYPE-scoped mappings still resolve) · malformed routes[] rejected |
| 2 | **Presets Library folders (embeddable, UD-2)** | `PresetBrowser.tsx` (+folders/search/tags INSIDE the component, no new top-level chrome; reuse-or-delete dead `browser.ts` UserFolder CRUD); apply=click/drag (keep `application/entropic-preset` channel) | MED | browse/search/apply smoke · **apply==hand-built pixel-diff** · **transparency**: apply→remove-all==baseline byte-identical · agent can apply via tool (parity) |
| 3 | **Seed 24 presets** | 24 `.glitchpreset` JSON (🟢 rows of `PRESET-TOP50.md`, audited vs live registry — all 22 seed effect ids confirmed present) + rendered thumbnails, packs = subfolders of `<Documents>/Creatrix/Presets/` (UD-4) | LOW | **each of 24: automated apply+render+hash** (screenshot = human spot-check only) |
| 4 | **`_mix` mappable macro** | `stores/operators.ts` (allow `_mix` target); device UI knob (existing `Knob.tsx` convention, NOT unbuilt Knob-v3); **ParamDef metadata w/ `unit`+`curve`** (live calibration test enforces); backend needs nothing (`routing.py:210-221` already injects, `container.py:59` already mixes) | LOW | `_mix` default==identity byte-identical · `audio→_mix` A/B · morph bypass via `_mix→0` · calibration test green |
| 5 | **Edge-curve applied + enum picker (UD-5)** | `modulation/routing.py` (apply `curve` in the contribution step: source→curve→depth/min/max; NOT `lane_reader.py` — separate system); `CurveType` +`smoothstep` (additive); enum-picker UI in edge/route inspector; fix stale `EdgeInspector.tsx:1-15` comment; curve edits gesture-coalesced + Ledger rows | MED | **curve default==linear byte-identical** (silent-change guard) · smoothstep unit test · round-trip · points-editor explicitly deferred to K1 |

**Single-flight (serialize):** 00 → 0a → 1 → 4 → 5 (1&5 touch `modulation/routing.py`; 1&4 touch `operators.ts`). Packets 2/3 parallel after 1. Cross-branch rule: routing-suite (B) packets touching `operators.ts`/`modulation/routing.py` rebase after Wave-0 merges.
**Bug filings alongside (not packets):** LFOEditor/ModulationMatrix/KentaroCluster UUID no-op mappings (fixed by Packet 1's UD-1 work — verify) · `crossStoreCleanup.pruneEffectDependents` convention mismatch · `EFFECT-CONTRACT.md` mask-order doc bug · `EFFECTS-INVENTORY.md` count 171→220.

## The one correctness landmine (REVISED per UNIFICATION §0 / UD-1)
**As originally written, this landmine assumed instance-UUID routing already worked — it doesn't** (wire carries TYPE ids only; UUID-scoped mappings are silent no-ops on main). Under UD-1, Packet 1 first makes instance addressing real (wire + backend keying w/ TYPE fallback), **then** the landmine applies as stated: apply reassigns fresh UUIDs (`App.tsx:3772`), so bundled routes referencing instance ids MUST be rewritten through an old-id→new-id map or they dangle. Headline tests: id-remap **and** duplicate-effect-type routing **and** legacy TYPE-fallback byte-identical.

## Locked decisions (do not re-litigate)
D1 arbitration=additive-default · D2 apply=append-default(offer Replace) · D3 tap-on-off-host=idle · D4 band-count=clamp-index. Terminology: composition=routing-preset=pre-routed-preset.

## Gates (per packet + final) — STRICT FULL-TIER per UD-3
Per-packet: **FULL suite green** (backend `pytest -x -n auto` full tier; frontend `npx --no vitest run` — run on the MAIN checkout or CI, worktree executors can't run vitest) → `/review` (Skill-tool, or the ship-gate blocks push) → verify-for-real → **parity (preview==export — use the single-clip path; composite-preview has a known MK.8 operators-omission gap, `zmq_server.py:1688`)** → update PRD status. **Merge gate: full CI green incl. e2e-full + sidecar (Packet 00 makes this possible; supersedes smoke-green).** perf-nightly: untouched by Wave 0 (scalar-only); K1+ adds baselines. Final: `/uat` on the preset flow + `/qa-redteam` on Packet 1 (RISK:HIGH).

## Creatrix marathon gotchas
- **PR-only.** Campaign merge autonomy: squash, CI green (now = FULL green per UD-3), no `.github/workflows/**`.
- **Ship-gate hook blocks `git push` until a review Skill runs via the Skill tool** (not slash-command). Run `Skill(review)` before pushing.
- This machine: **poll loops die exit-144** → merge-on-wake, no sleep-poll. **Hex-ratchet CI:** CSS uses `--cx-*` tokens, no raw hex. Worktree executors can't run vitest → CI is the frontend gate.

## Definition of done (Wave 0 + U0)
A user opens the **Presets folder**, one-click applies a **wired** preset (devices + routings + macros) onto a clip, the result renders identically to hand-building it, and opening the chain/Matrix shows normal editable edges (transparency). `_mix` and edge-curve work with byte-identical defaults. Merged to main. Then: **archive this brief, write the K1 marathon brief next.**

*Inputs to hand the marathon:* this file + `prd/PRD-wave0-preset-mvp.md` + `prd/PRD-mix-macro.md` + `prd/PRD-edge-curve-ui.md` + `REVIEW.md §6` + `HANDOFF.md §4,§7`.
