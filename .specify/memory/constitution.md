# Entropic v2 Challenger Constitution

## Core Principles

### I. Pure Function Effects
Every video effect is a pure function: `(frame, params, state_in) → (result, state_out)`. No side effects. No global state. No stateful RNG — use seeded determinism: `Hash(ProjectID+EffectID+FrameIndex+Seed)`.

### II. Sidecar Architecture
Electron frontend owns state (8 Zustand stores). Python sidecar is a stateless renderer, communicating via ZeroMQ REQ/REP. Frontend sends commands, backend processes frames. The preload bridge exposes exactly 6 IPC methods — that's the mock boundary for tests.

### III. Trust Boundaries Are Sacred
Every value crossing a trust boundary (IPC handler, file load, param ingestion, deserialization) MUST pass type + range + isFinite checks. Internal code can trust internal state. Boundary code cannot. See PLAYBOOK.md for specific patterns.

### IV. Test Pyramid
80% Vitest unit/component tests (mock IPC via `createMockEntropic()`) → 15% integration tests → 5% Playwright E2E (each justified with `// WHY E2E:`). Backend: pytest with xdist parallel. Wiring tests required for features spanning UI + backend.

### V. State Management Discipline
Zustand stores are the source of truth. After any `set()` mutation, recompute all derived state. Closures capture entity IDs, never array indices. Deletion is a distributed transaction across all stores. See PLAYBOOK.md for specific patterns.

### VI. Atomic User Data
Any file representing user data (project saves, exports) uses write-to-temp + atomic rename. Cleanup in finally blocks for cancelled/errored operations. See PLAYBOOK.md for specific patterns.

### VII. React Lifecycle Safety
Stable keys always (entity ID, never array index). AbortController for listeners. Refs for values inside event handlers. Clear timers on unmount. In a real-time DAW, lifecycle bugs become data corruption. See PLAYBOOK.md for specific patterns.

## Technology Stack

- **Frontend:** Electron 40 + React 19 + Vite + TypeScript
- **Backend:** Python 3.14 sidecar (PyAV, ZeroMQ, session-scoped fixtures)
- **CSS:** BEM vanilla, dark theme, JetBrains Mono, CSS custom properties
- **IPC:** camelCase (TS) ↔ snake_case (Python), serialization layer handles conversion
- **Export:** H.264, H.265, ProRes 422/4444, GIF, PNG/JPEG/TIFF sequence

## Quality Gates

1. All tests pass before commit (pytest + vitest)
2. Gate 13 self-critique before commit (integration path, state consistency, trust boundaries)
3. PLAYBOOK.md rules checked per task
4. Ship gate (5+ files changed): /quality + /uat + /qa-redteam + /review
5. No `key={index}`, no unclamped IPC params, no direct writeFile for user data

## Governance

This constitution supersedes ad-hoc decisions. Amendments require documentation and must update both this file and PLAYBOOK.md if rules overlap.

**Version**: 1.0.0 | **Ratified**: 2026-03-26 | **Last Amended**: 2026-03-26
