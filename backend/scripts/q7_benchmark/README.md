# Q7 benchmark harness

Multi-headed L (DINOv2 + CLIP + CLAP) latency benchmark for the Entropic Tier 5 gate.

See [../../../docs/plans/q7/README.md](../../../docs/plans/q7/README.md) for the master roadmap.
See [../../../docs/runbooks/q7/q7-smoke.md](../../../docs/runbooks/q7/q7-smoke.md) for execution instructions.

## Quick start (smoke / CI)

```bash
# From repo root
make q7-smoke
```

Equivalent to:
```bash
cd backend && python -m q7_benchmark.runner --mock --report --out /tmp/q7-mock.json
python -m q7_benchmark.report validate /tmp/q7-mock.json
```

## Real measurement (Apple silicon required)

Lands in PR #3+. Until then, `--measure` raises SystemExit.

## Layout

| Module | Purpose |
|---|---|
| `runner.py` | CLI entrypoint; `python -m q7_benchmark.runner --help` |
| `report.py` | JSON schema validator + (future) markdown verdict renderer |
| `backends.py` | MLX / PyTorch MPS / PyTorch CPU detection |
| `mock.py` | Deterministic synthetic results (CI default) |
| `schemas/q7-report.schema.json` | JSON Schema for report shape |
| `requirements-q7.txt` | Pinned dependencies (empty in PR #1; populated in PR #3) |
