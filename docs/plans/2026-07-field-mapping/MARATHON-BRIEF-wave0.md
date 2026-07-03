# MARATHON BRIEF — Wave 0 + U0 (pre-routed preset MVP)

**For:** the `/marathon` SDLC cascade (spec → decisions → plan → packetize → build → UAT → gates → archive).
**Repo:** `~/Development/entropic-v2challenger` (Creatrix) · **Plan on main:** `docs/plans/2026-07-field-mapping/` (PR #419, merged).
**Scope (HARD):** Wave 0 (`prd/PRD-wave0-preset-mvp.md`) + U0 (`prd/PRD-mix-macro.md`, `prd/PRD-edge-curve-ui.md`). **Do NOT marathon past this** — K1/ST/P1+ are separate future marathons (learning #206: no multi-phase blind build). This slice needs **no new engine.**

## Why this is marathon-ready
Already spec'd, reviewed (`REVIEW.md`), one-shot-assessed (LOW risk), decisions locked (D1–D4), and the integration surface is **verified against real code** (`SPIKES.md`, `HANDOFF.md §4`). The marathon's spec/decisions phases are effectively pre-done — go near-straight to packetize.

## The two human touchpoints (exactly two)
1. **Approve the packet plan** — after packetize, before build. Go/no-go on the ~5 packets below.
2. **Ship sign-off** — after build + UAT + gates, before merge/archive. Approve the merge (docs+code PR).
Everything between runs autonomously with per-packet gates.

## Packets (packetize input — ready)
| # | Packet | Files (verified) | Risk | Hard oracle |
|---|--------|------------------|------|-------------|
| 1 | **Preset routes: schema + save + apply** | `frontend/src/shared/schemas/preset.schema.json` (add `chainData.routes[]` + `presetSchemaVersion` + bump `effects.maxItems` 10→24); `components/library/PresetSaveDialog.tsx` (collect `mappings`→routes); `App.tsx:3757` apply (materialize routes+macros) | **HIGH** | wired round-trip byte-identical · **id-remap test** (applied routes point to new UUIDs, not saved) · macros applied · backward-compat (old presets load) |
| 2 | **Presets Library folder** | `components/library/PresetBrowser.tsx` (+folders/search/tags); apply=click/drag | MED | browse/search/apply smoke · **apply==hand-built pixel-diff** · **transparency**: apply→remove-all==baseline byte-identical · agent can apply via tool (parity) |
| 3 | **Seed 24 presets** | 24 `.glitchpreset` JSON (the 🟢 rows of `PRESET-TOP50.md`) + rendered thumbnails | LOW | each applies+renders (smoke) · ≥1/pack screenshot-verified |
| 4 | **`_mix` mappable macro** | `stores/operators.ts` (allow `_mix` target); device UI knob; `container.py` (already mixes) | LOW | `_mix` default==identity byte-identical · `audio→_mix` A/B · morph bypass via `_mix→0` |
| 5 | **Edge-curve wire + editor** | `backend/src/modulation/routing.py` (apply `curve` via `util/curves.py`); edge curve editor UI | MED | **curve default==linear byte-identical** (silent-change guard) · smoothstep unit test · round-trip |

**Single-flight (serialize):** Packet 1 & 5 both touch routing/apply paths; Packet 1 & 4 touch `operators.ts` targets — order 1 → 4 → 5. Packet 2/3 parallel-safe.

## The one correctness landmine (bake into every relevant packet)
**Apply reassigns fresh UUIDs (`App.tsx:3772`); bundled routes reference `target_effect_id`. Apply MUST build an old-id→new-id map and rewrite every route/operator ref, or routes silently dangle.** This is Packet 1's headline test.

## Locked decisions (do not re-litigate)
D1 arbitration=additive-default · D2 apply=append-default(offer Replace) · D3 tap-on-off-host=idle · D4 band-count=clamp-index. Terminology: composition=routing-preset=pre-routed-preset.

## Gates (per packet + final)
Per-packet: tests green (backend `pytest -x -n auto`; frontend `npx --no vitest run`) → `/review` (Skill-tool, or the ship-gate blocks push) → verify-for-real → **parity (preview==export)** → update PRD status. Final: `/uat` on the preset flow + `/qa-redteam` on Packet 1 (RISK:HIGH).

## Creatrix marathon gotchas
- **PR-only, merge on SMOKE-green** (e2e/sidecar standing-red — gate on smoke). Campaign merge autonomy: squash, CI green, no `.github/workflows/**`.
- **Ship-gate hook blocks `git push` until a review Skill runs via the Skill tool** (not slash-command). Run `Skill(review)` before pushing.
- This machine: **poll loops die exit-144** → merge-on-wake, no sleep-poll. **Hex-ratchet CI:** CSS uses `--cx-*` tokens, no raw hex. Worktree executors can't run vitest → CI is the frontend gate.

## Definition of done (Wave 0 + U0)
A user opens the **Presets folder**, one-click applies a **wired** preset (devices + routings + macros) onto a clip, the result renders identically to hand-building it, and opening the chain/Matrix shows normal editable edges (transparency). `_mix` and edge-curve work with byte-identical defaults. Merged to main. Then: **archive this brief, write the K1 marathon brief next.**

*Inputs to hand the marathon:* this file + `prd/PRD-wave0-preset-mvp.md` + `prd/PRD-mix-macro.md` + `prd/PRD-edge-curve-ui.md` + `REVIEW.md §6` + `HANDOFF.md §4,§7`.
