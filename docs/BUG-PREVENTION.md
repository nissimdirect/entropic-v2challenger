# Entropic v2 Challenger — Bug Prevention Map

> Every v1 bug mapped to the Challenger architectural mechanism that prevents it.
> Sources: UAT-FINDINGS-2026-02-15, SPRINT-REPORT-2026-02-15, entropic-2/BUG-PREVENTION.md
> Rebuilt for Challenger architecture (React SSOT + ZMQ + mmap + pure function effects).

---

## Critical Bugs (B1-B14)

| v1 Bug | Root Cause | Challenger Prevention | Phase |
|--------|-----------|----------------------|-------|
| B1: File upload not populating | Frontend missing `res.ok` check, error swallowed | ZMQ response always has `{ok: bool, error?: string}`. React state only updates on `ok: true`. Upload progress tracked in Zustand store with explicit error state. | 1 |
| B2: Datamosh not rendering | `frame_index=0` default + global state | `frame_index` is a required keyword arg in `apply()` — TypeError if missing. No module globals (Effect Contract rule 2.1). State passed via `state_in`/`state_out`. | 0B |
| B3-B9: 7 pixel physics broken | `_get_state()` creates fresh state every call, cleanup triggers on frame 0 because `0 >= 0` | `state_in=None` on first frame (explicit). `state_out` returned each frame (explicit). No lifecycle methods — just pure function with explicit state passing. Container handles state routing. | 8 |
| B10: Byte corrupt no effect | `frame_index=0` default | Required keyword arg. Python raises TypeError if caller omits it. | 0B |
| B11: Flow distort no effect | `frame_index=0` default | Same as B10. | 0B |
| B12: Auto levels no effect | Processing noop at frame_index=0 | Required kwarg prevents silent 0. Visual diff test (part of Testing Contract) catches any no-op effect. | 0B, 1 |
| B13: Histogram EQ no effect | Same + no visualizer | Same as B12. | 0B, 1 |
| B14: Sidechain crossfeed unmapped | Needs `key_frame` never provided | Operator system (Phase 6): sidechain is a control signal routed to params via `ModulationRoute`, not a standalone effect needing a key frame. | 6 |

**Structural prevention:** B2-B13 share the same root cause: optional/defaulted `frame_index`. The Challenger Effect Contract makes it a **required keyword argument** — one architectural decision prevents 12 bugs.

---

## Parameter Bugs (P1-P7)

| v1 Bug | Root Cause | Challenger Prevention | Phase |
|--------|-----------|----------------------|-------|
| P1: Seed does nothing (many effects) | Seed exposed but not wired | Determinism test (Testing Contract item 2): two calls with same seed MUST produce identical output. Change seed → output MUST differ. Dead seeds caught at test time. | Per effect |
| P2: Pixel magnetic — most params dead | Copy-pasted physics without verification | Visual diff test per param: change param → output MUST change. Dead params caught at test time. | Per effect |
| P3: Pixel quantum params dead | Same | Same as P2. | Per effect |
| P4: Pixel elastic — high mass breaks | Linear range, no non-linear scaling | `ModulationRoute.curve` field supports `"logarithmic"`, `"exponential"`, `"s-curve"`. Params with wide ranges use log scaling. Boundary test (Testing Contract item 3) tests all params at min, max, default. | 2A |
| P5: Duotone doesn't revert | State persists in HSV conversion | Pure function: `apply()` never mutates input. Effect Container applies dry/wet mix. Setting mix=0 always gives original frame. | 0B |
| P6: Scanlines flicker crashes | Boolean param triggers per-frame randomization corrupting state | Seeded determinism: all randomness from `np.random.default_rng(seed)`. Same seed + same frame_index = same output. No per-frame corruption possible. | 0B |
| P7: Brailleart shows question marks | Unicode U+2800-U+28FF not rendering | React renders UTF-8 natively. Electron Chromium handles all Unicode. No custom font rendering. | 1 |

**Structural prevention:** P1-P3 share the same root cause: no test for "does this param actually do something?" The Challenger Testing Contract mandates **visual diff tests per param** — one test pattern prevents all dead-param bugs.

---

## UX Bugs (U1-U3)

| v1 Bug | Root Cause | Challenger Prevention | Phase |
|--------|-----------|----------------------|-------|
| U1: Hidden params (no scroll affordance) | No overflow indicator | React component: gradient fade on overflow + scroll indicator. E2E test: all params visible or scroll affordance present. | 2A |
| U2: History order inverted | Oldest at top | Zustand undo store: newest first. UI renders from store order. E2E test verifies order. | 4 |
| U3: Mix slider unclear | No label, no tooltip | Every param has `label` and `description` in PARAMS schema. UI renders both. No unlabeled controls. | 2A |

---

## Architecture Issues (A1-A7)

| v1 Issue | User Quote | Challenger Prevention | Phase |
|----------|-----------|----------------------|-------|
| A1: Perform = separate view | "This separate mixer view is a UX nightmare." | Performance Track is a timeline track type, not a separate view. All interaction happens in the same timeline UI. | 9 |
| A2: Quick mode unclear | "I don't know what Quick mode is." | Removed. One unified view. | N/A |
| A3: Effects/Tools/Operators mixed | "Those shouldn't be effects." | Three-type taxonomy: `fx.*` (destructive), `util.*` (tools), `mod.*`/`op.*` (operators). UI treats each differently. | 1 |
| A4: Sidechain not modular | "We should make it modular." | Operator system: one sidechain operator maps to any param via `ModulationRoute`. | 6 |
| A5: LFO not mappable | "I can't map it to anything else." | Operator system: click LFO → click param → mapped. DAG enforcement prevents cycles. | 6 |
| A6: Pixel physics redundant | "They're all kind of doing similar things." | Shared physics utility functions. Per-effect files import shared math. Consolidation pass post-launch. | 8 |
| A7: Color tools not competitive | "It needs to be as good as Photoshop." | Tools category (`util.*`) with professional UI: Levels (5-point), Curves (16-point bezier), HSL (per-channel), Color Balance (shadow/mid/highlight). | 3 |

---

## Systemic Issues

| v1 Pattern | Affected | Challenger Prevention |
|------------|----------|----------------------|
| Parameter sensitivity — narrow sweet spot | ~15 effects | `ModulationRoute.curve` field for log/exp scaling. Phase 2A calibration. |
| Dead seed params | ~8 effects | Determinism test mandatory per Testing Contract. |
| Animation/motion missing | ~10 effects | Operator system (Phase 6): LFO → any param = automated motion. |
| Compound bugs — two failure modes, identical symptom | Whole system | Watchdog protocol + React SSOT = independent recovery. Python crash doesn't lose state. |
| False confidence from unit tests | Test suite | Testing Contract mandates 4 test types per effect + integration tests. |
| Global mutable state accumulation | 13 module-level dicts in v1 | Effect Contract rule 2.1: NO module globals. Pure functions only. Linted. |
| Single point of failure (server.py:377) | All rendering | Effect Engine is stateless. Any frame can be re-rendered from (frame, params, state_in). Watchdog restarts engine on crash. |

---

## Prevention Coverage Matrix

| Bug Class | v1 Count | Challenger Mechanism | Prevented? |
|-----------|----------|---------------------|------------|
| `frame_index` defaults | 12 bugs | Required keyword arg | ALL |
| Dead params | ~8 bugs | Visual diff test per param | ALL |
| Global state | 13 occurrences | Pure function contract + no module globals | ALL |
| State lifecycle | 7 physics bugs | Explicit `state_in`/`state_out` | ALL |
| Render crash = data loss | 1 architecture issue | React SSOT + watchdog restart | ALL |
| UX mode confusion | 2 issues | Single unified view | ALL |
| Operator mapping | 2 issues | ModulationRoute DAG system | ALL |
