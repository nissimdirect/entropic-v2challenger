---
title: Preventing UX-Blind QA in Agent Teams
date: 2026-02-28
tags: [qa, testing, agent-teams, process, ux-paths]
problem: QA agents tested effects in isolation but missed all ZMQ transport/pipeline integration paths
severity: high
---

# Problem

During Phase 3 Color Suite development, we ran a 4-agent team:
- bug-fixer: Fixed F-2, M-1, M-2
- phase3-builder: Built 5 color effects + tests
- qa-runner: Ran /quality /uat /redteam gauntlet (63 tests)
- uat-skill-agent: Ran /uat skill (66 tests)

**Result:** 129 tests passed, but ALL tested effects in isolation (direct `apply()` calls). Zero tests verified that color effects work through the actual user-facing ZMQ pipeline.

**7 UX gaps discovered:**
1. No ZMQ round-trip test with color effects in chain
2. No effect param verification via `list_effects` ZMQ command
3. No mixed color + glitch chain test through ZMQ
4. No `apply_chain` ZMQ command test with color effects
5. No error sanitization test through full ZMQ handler path
6. No identity-by-default verification through pipeline
7. No disabled color effect test through pipeline

# Root Cause

QA agents were given **effect-level acceptance criteria**, not **user-flow acceptance criteria**. The test plan said "verify levels produces correct output" but never said "verify a user can add levels to their timeline and see it applied."

The distinction:
- **Effect-level:** `levels_apply(frame, params)` returns correct output
- **User-flow level:** Frontend sends `{cmd: "render_frame", chain: [{effect_id: "util.levels", ...}]}` via ZMQ and gets correct frame_data back

# Solution

## 1. Mandatory "Primary UX Paths" section in every QA plan

Before any QA agent starts work, the test plan MUST include a section like:

```markdown
## Primary UX Paths (MANDATORY)

For each new feature, test through the actual transport layer:
- [ ] Feature works through ZMQ `render_frame` command
- [ ] Feature works through ZMQ `apply_chain` command
- [ ] Feature appears in `list_effects` with correct params
- [ ] Feature can be disabled/enabled in chain
- [ ] Feature errors are sanitized (no stack traces leak)
- [ ] Feature with default params is identity (if applicable)
- [ ] Feature stacks with existing effects (mixed chains)
```

## 2. Test file naming convention

- `test_<feature>.py` — Unit tests for the feature in isolation
- `test_ux_paths.py` — ZMQ integration tests for user-facing flows
- `test_uat_<feature>.py` — UAT-level acceptance tests

Every feature MUST have entries in `test_ux_paths.py`, not just unit tests.

## 3. QA agent prompt template addition

When spawning QA agents, include this in the prompt:

> "CRITICAL: You must test through the ZMQ transport layer, not just direct function calls. The user interacts through ZMQ commands (render_frame, apply_chain, list_effects). If your tests only call apply() directly, you have NOT tested the UX path."

## 4. Fix applied this session

Created `test_ux_paths.py` with 23 tests covering all 7 gaps:
- TestListEffectsViaZMQ (4 tests)
- TestEffectParamsViaZMQ (4 tests)
- TestRenderFrameWithColorEffects (3 tests)
- TestMixedColorGlitchChain (4 tests)
- TestApplyChainZMQ (2 tests)
- TestErrorSanitizationZMQ (3 tests)
- TestIdentityByDefaultViaPipeline (3 tests)

All 23 pass. Combined with existing 376 backend + 66 UAT tests = 465 tests total.

# Prevention Checklist

For future agent team QA sessions:

- [ ] Does the QA plan include "Primary UX Paths" section?
- [ ] Does the QA plan reference the transport layer (ZMQ/API/HTTP)?
- [ ] Are there integration tests that exercise the full request→response path?
- [ ] Have you verified the feature appears in discovery commands (list_effects)?
- [ ] Have you tested disabled/default/error states through the transport?
- [ ] Have you tested mixed chains (new + existing features)?
