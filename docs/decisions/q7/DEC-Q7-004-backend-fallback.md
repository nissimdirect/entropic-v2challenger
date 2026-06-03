# DEC-Q7-004 — Backend fallback algorithm

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #3 (Session 1)
**Scope:** Order, semantics, and failure mode of the MLX → MPS → CPU backend cascade.

## Question

Q7 measurements must reflect the user's actual runtime. Different Macs expose different acceleration paths:
- M-series + MLX installed: best path (Apple-native ops, 4-bit quantization)
- M-series + PyTorch MPS only: second path (Metal Performance Shaders via torch)
- Intel Mac + PyTorch CPU: documented unsupported (DEC-Q7-014) but still allowed for smoke
- Any host + no real backend: must explicitly use `--mock` (no silent fall-through)

What's the cascade order, where do we fail loudly, what gets logged?

## Decision

### Cascade order (highest to lowest priority)

1. **MLX** (Apple silicon native): if `mlx.core` imports AND `sys.platform == 'darwin'` AND `platform.machine() == 'arm64'`
2. **PyTorch MPS**: if `torch` imports AND `torch.backends.mps.is_available()`
3. **PyTorch CPU**: if `torch` imports (fallback; benchmark VALIDITY is marked degraded)
4. **Mock**: ONLY if `--mock` flag is set; never silent fall-through

### `--measure` mode (real benchmark)

Tries the cascade top-down. **First success wins.** No silent skipping:
- If MLX fails (e.g., on macOS Intel) → log `mlx unavailable: <reason>`, try MPS
- If MPS fails → log `mps unavailable: <reason>`, try CPU
- If CPU fails (torch not installed) → raise `BackendUnavailableError` listing every attempt + reason

### `--mock` mode (CI smoke)

Bypasses the cascade entirely. Uses the deterministic `MockBackend` for synthetic results. Cannot be silently combined with `--measure`.

### Logging contract

Every cascade attempt emits a log line at INFO level:

```
q7.backends: probe mlx → available (mlx 0.20.x)
q7.backends: skipped mps (would shadow mlx)
q7.backends: skipped cpu (would shadow mlx)
q7.backends: selected mlx
```

Or on cascade fall-through:

```
q7.backends: probe mlx → unavailable (mlx package not installed)
q7.backends: probe mps → unavailable (torch.backends.mps.is_available() == False; macOS 13.0+ required)
q7.backends: probe cpu → available (torch 2.5.0)
q7.backends: selected cpu (BENCHMARK VALIDITY: DEGRADED — CPU does not represent Apple silicon Tier 5 path)
```

The "BENCHMARK VALIDITY: DEGRADED" tag fires when CPU is selected so the report verdict can be flagged as advisory-only.

## Considered alternatives

- **Silent fall-through (auto-degrade)** — REJECTED. User running `--measure` expects real Apple-silicon numbers. Silent CPU fallback yields wrong verdict ("Tier 5 GO at 200ms" is not a GO).
- **Require explicit `--backend mlx|mps|cpu`** — REJECTED for v1. Adds CLI friction. Cascade with loud logs is enough. Reconsider if MLX/MPS show divergent results in PR #5+ jitter measurement.
- **Probe all backends + benchmark all 3** — REJECTED for v1. 3× the runtime; the user wants ONE measurement on their hardware. Multi-backend comparison is a future drift-CI concern (deferred PR per R4).
- **MLX before MPS even on Intel** — REJECTED. MLX requires Apple silicon. Detector must hard-gate on `arm64`.

## Side effects to track

- The `BackendInfo` dataclass in `backends.py` (PR #1) currently has only `name`, `available`, `detail`. PR #3 adds: `validity: Literal['full', 'degraded']` for the CPU-degrades-Tier-5 case.
- The `--measure` path in runner.py (PR #1 stub) gets wired to the cascade; selecting `cpu` sets `validity='degraded'` in the report JSON.
- Report schema (q7-report.schema.json) adds optional `backend_validity: 'full' | 'degraded'` field. Schema version bumps to 0.2.0 if this lands before PR #4. **Decision: defer schema bump to PR #4** (multiple new fields land together; one bump).

## Verification

After PR #3 merges:

```bash
# Cascade works on a host with torch but no MLX
cd backend/scripts && python3 -m q7_benchmark.runner --measure --out /tmp/r.json
# Expected: backend=mps or cpu in JSON; INFO log shows full cascade attempted

# Mock mode unaffected by cascade
python3 -m q7_benchmark.runner --mock --out /tmp/r.json
# Expected: backend=mock; no cascade probes in logs

# Force the unavailable case (uninstall torch, run --measure)
# Expected: BackendUnavailableError with all 3 cascade attempts + reasons
```

## Cross-references

- DEC-Q7-001 (dir layout) — backends.py + loaders/ live in `backend/scripts/q7_benchmark/`
- DEC-Q7-005 (model versions) — model loader honors the backend chosen here
- DEC-Q7-014 (Intel Mac unsupported) — CPU backend shows `validity='degraded'` to signal
- PR #1 backends.py — extended in PR #3 to support `validity`
