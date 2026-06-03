# OpenSpec — Creatrix / Entropic v2

> Hand-rolled OpenSpec conventions (no CLI). `specs/` = current truth, `changes/` =
> in-flight proposals. Each change has `proposal.md` (why/what), `design.md`
> (decisions), `tasks.md` (checkboxed impl for the implementer), and `specs/<cap>/spec.md`
> (requirement deltas as ADDED / MODIFIED / REMOVED). Validate by review (no `openspec validate`).

## Project context

Electron 40 + React 19 + Vite + TypeScript frontend; Python 3.14 sidecar (ZeroMQ REQ/REP).
Frame pipeline: decode → apply_chain → encode_mjpeg → base64 → `<img>`. State = 8 Zustand
stores (engine, audio, project, effects, timeline, undo, toast, layout). Single tester
(the user) — **no external user base, no production data, no backwards-compat obligation.**
Clean breaks are free; we delete and regenerate our own test fixtures.

## Active initiative — PR-zero: per-track effect chains (F-0514-16)

Promote the global `useProjectStore.effectChain` into per-track `Track.effectChain`.
Foundational; blocks the Creatrix layout redesign (PR-A…PR-D). Sliced into 5 OpenSpec
micro-loop epics (01…05). Source plan: `~/Development/entropic-layout-mockup/PLAN.md` v1.2 §2.

### Ground truth established by discovery (2026-06-02)
- `Track.effectChain` already exists in the type (`shared/types.ts:67`) but is **vestigial**:
  initialized empty (`timeline.ts:121`), deep-copied on duplicate (`timeline.ts:890`), and read
  only as a render fallback (`App.tsx:819` `track.effectChain ?? chain`). Never actively managed.
- The live chain is the global `useProjectStore.effectChain` (`stores/project.ts:13`).
- `selectedTrackId` already exists (`timeline.ts:19/212`, setter `selectTrack` `:989`) but is **not**
  wired to effect-chain selection.
- Freeze store is **already trackId-keyed** (`stores/freeze.ts` `frozenPrefixes: Record<string,FreezeInfo>`);
  App.tsx just passes the synthetic `MASTER_TRACK_ID='master'` (`shared/limits.ts:25`).
- Backend is **stateless w.r.t. tracks** — `apply_chain`/`render_frame`/`render_composite`
  (`backend/src/zmq_server.py:296/607`) *receive* a `chain` param; they do not look chains up.
- Persistence stores the chain under the `masterEffectChain` JSON key
  (`renderer/project-persistence.ts:173` serialize / `:325` hydrate).
- No circular import between `project.ts` and `timeline.ts` — safe to add a dependency.

### Refactor strategy — strangler-fig
Add per-track ownership additively, migrate consumers epic-by-epic, delete the global field
**last** (Epic 5). Invariant: **every epic leaves the test suite green** (Gate 4). Full
end-to-end app integration is only required at PR-zero completion, not mid-PR. The transitional
global `effectChain` field is an internal refactor scaffold, not a shipped shim — it never
survives the PR.

## Epic map
| # | Epic | Owns |
|---|------|------|
| 01 | per-track-chain-model | timeline per-track chain mutators; trackId-parameterized project actions + their unit tests |
| 1.5 | track-lifecycle-integrity | extract `pruneEffectDependents(effectIds, trackId)` from removeEffect; fix `removeTrack` cross-store cleanup (TIGER 1) + `duplicateTrack` effect-id re-keying (TIGER 2); guard tests. Gated BEFORE Epic 02. |
| 02 | ui-wiring | DeviceChain + render paths read the active track's chain; drop global fallback |
| 03 | freeze-pertrack | freeze call sites use real track id (not MASTER_TRACK_ID); per-track isolation |
| 04 | ipc-backend | thread track_id through render IPC for scoping/logging; IPC round-trip test |
| 05 | persistence + cleanup | save/load per-track chains; DELETE global field + masterEffectChain key; fixtures + E2E |

## Conventions
- Effects are pure: `(frame, params, state_in) -> (result, state_out)`.
- IPC: camelCase (TS) ↔ snake_case (Python); serialization layer converts.
- Tests: Vitest (component/unit) + Playwright `_electron` (E2E) + pytest (backend).
  Frontend unit MUST run with `npx --no vitest run` (project-local, avoids E2E specs).
- Commit scopes: effects, timeline, zmq, video, export, automation, observability.
- Micro-loop per epic: **complete discovery → OpenSpec change → lock → implement (Sonnet) → verify green**.
