---
title: E2E Test Pipeline Optimization — Hybrid Test Pyramid
date: 2026-02-28
tags: [testing, ci, performance, architecture, test-pyramid]
problem: CI takes 50-70+ min on E2E tests
root_cause: 132 Playwright tests each launch fresh Electron + Python sidecar, but 90% test UI logic that doesn't need real Electron
impact: PR feedback loop is 50-70 min instead of < 3 min
---

# E2E Test Pipeline Optimization

## Problem
PR #1 CI takes 50-70+ min on E2E tests. Root cause: 132 Playwright tests each launch fresh Electron + Python sidecar. But the deeper problem: tests operate at the wrong layer. The preload bridge at `frontend/src/preload/index.ts` exposes exactly 6 methods — the entire coupling surface. 90% of E2E tests don't need real Electron; they test UI logic that can be verified with mocked IPC in milliseconds.

## Root Cause
Classic "if all you have is a hammer" problem. The E2E fixture made it easy to write Playwright tests, so every test became E2E. No one asked "does this test NEED Electron?"

## Solution: Hybrid Test Pyramid
1. **Mock boundary:** The 12-method preload bridge (`sendCommand`, `selectFile`, `selectSavePath`, `onEngineStatus`, `onExportProgress`, `getPathForFile`, plus 6 more)
2. **Component tests:** 147 tests migrated across 6 batches from Playwright to Vitest + `createMockEntropic()`. Same assertions, 100x faster.
3. **IPC contract tests:** Auto-validate TypeScript IPC types match Python ZMQ command schema (3 tests)
4. **Real E2E:** ~15 tests that MUST use real Electron (launch, sidecar lifecycle, security gates, golden path)

## Migration Batches
| Batch | Tests | What |
|-------|-------|------|
| 1 | 50 | Preview, effects, upload, transport, edge-cases, effect-chain, import-video |
| 2 | 35 | Edge-cases, effect-chain, import-video (component-level) |
| 3 | 18 | UX-combinations (search, category, lifecycle, export controls) |
| 4 | 20 | Chaos (keyboard, rapid clicks, DOM) + Interactions (export dialog, preview, drop zone) |
| 5 | 14 | Export states + UX contracts (Don Norman affordances, constraints, consistency) |
| 6 | 10 | Timeline UI (tracks, zoom, history panel) |

## Pattern
**The preload bridge IS the mock boundary.** Any test that can inject `createMockEntropic()` should. Only tests that verify the bridge itself need real Electron.

## Results
| Metric | Before | After |
|--------|--------|-------|
| PR gate | 50-70 min | < 3 min |
| Merge CI | 50-70 min | < 8 min |
| Vitest total | 268 | 437 |
| E2E total | 132 | 101 |
| Pyramid | 0/0/100% E2E | 81/15/4% |
| Vitest runtime | N/A | ~2s |

## Prevention Rules (Codified)
- P97: Test at the Right Layer — new principle in behavioral-principles.md
- New E2E tests require `// WHY E2E:` justification comment
- CI time tracked as KPI in flywheel
- Bi-weekly test layer audit in RECURRING-TASKS.md

## Inspiration
- **Signal Desktop:** Mock server as separate npm package
- **VS Code:** Tests organized by area with zero setTimeout
- **Actual Budget:** Separate desktop vs web E2E configs
