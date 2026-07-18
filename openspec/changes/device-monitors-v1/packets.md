# Packets — device-monitors-v1

**Emitted:** 2026-07-18 (orchestrator, PRD-grounded). Plan/proposal in this dir; user
verdicts locked 2026-07-18. **Two standing gates before ANY dispatch:** (1) OD-1
supersede-check vs system-monitor-v1 (who owns the panel registry); (2) joint tap-schema
review vs `layertap-matte-v1` PRD §9 — BLOCKING for P2.

**Branching/merge rules:** identical to sampler-clip-editor packets header (origin/main
only, PR+squash, full-tier gate, Skill(review), hex-ratchet, screenshot-verify UI packets).

---

## P1 · Panel registry + floating layer — depends: OD-1 check. RISK:MED
Plan §1. `--cx-z-panel: 150` token; `.floating-panel--draggable` modifier; existing two
floating panels UNTOUCHED (regression: Undo History + operators overlay render unchanged).
Vitest state-machine suite is the oracle. If system-monitor-v1 shipped the registry first:
this packet = registration + any missing drag/resize primitives only.

## P2 · tap_render backend (both forms) — depends: joint-schema gate. RISK:HIGH
Plan §2. qa-redteam REQUIRED (new IPC surface: input validation, DoS-by-tap-storm →
latest-wins slot + fps caps are the mitigations to verify; stale-tap information leak).
Equivalence oracles: chain-prefix == truncated-chain full render; layer-subset == filtered
render_composite. Single-flight: zmq_server.py + pipeline.py (serialize vs
sampler-clip-editor P5, layertap packets). Perf-tier row added same PR.

## P3 · MonitorPanel + LRU budget — depends: P1, P2
Plan §3. Screenshot-verify (static harness). LRU: interaction-timestamp based,
5th-open pauses least-viewed (vitest). Stale-tap explicit empty state (never frozen-frame
imposture). Chips on device cards per registry field (P4 may land after — chips render
only for instruments in that window).

## P4 · monitor_default registry field + curated policy — depends: none (parallel-safe)
Plan §4. Additive field, `'context'` default, curated list from proposal verdict 1.
Anti-dead-flag: registry flip ↔ chip presence test. IPC contract test updated
(`list_effects` shape).

## P5 · Metering + perf baselines — depends: P2, P3
Plan §5. Statusbar aggregate warn; `docs/perf/` baseline rows; nightly picks them up
(no workflow-file edits — baselines only).

---

**Suggested dispatch:** [OD-1 check] → P1 ∥ P4 → P2 (Opus, redteam) → P3 → P5.
