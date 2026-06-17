# Runbook: Q7 smoke (mock benchmark)

Verifies the Q7 harness end-to-end without GPU or model weights. Use this to:
- Confirm the harness installs and runs on any platform
- Validate the report JSON schema
- Catch accidental nondeterminism in mock mode
- Smoke-test PR changes before opening the PR

## Local execution

```bash
# From repo root
make q7-smoke
```

Equivalent to:
```bash
cd backend/scripts
python -m q7_benchmark.runner --mock --seed 42 --sparsity 8 --out /tmp/q7-report.json
python -m q7_benchmark.report validate /tmp/q7-report.json
```

## Expected output

```
OK: /tmp/q7-report.json schema_version=0.1.0
OK: q7-smoke passed (mock mode, deterministic, schema-valid)
```

Exit code 0 = pass.

## What "pass" means in PR #1

- The CLI accepts `--mock --report --out <path>` and writes a JSON file
- The JSON has `schema_version`, `mode`, `backend`, `sparsity`, `generated_at`, `measurement`
- `measurement.heads` has entries for all three backbones (`dinov2`, `clip`, `clap`)
- `measurement.interpolation` includes a `below_threshold_50ms` boolean
- Re-running with the same `--seed` + `--sparsity` produces byte-identical JSON

## What this does NOT do

- No model loads (PR #3+)
- No real latency measurement (PR #4+)
- No real interpolation jitter (PR #5+)
- No markdown verdict rendering (PR #7+)

For real measurements on your Mac, wait for PR #3+ to land, then see
`docs/runbooks/q7/q7-measure.md` (created in that PR).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ModuleNotFoundError: q7_benchmark` | Running from wrong dir | `cd backend/scripts` first, or use `make q7-smoke` from repo root |
| Exit 1 with "schema_version mismatch" | Schema bumped; report from old run | Re-run, don't validate a stale file |
| Test failure `test_mock_is_deterministic` | Mock backend lost determinism | Bug in `mock.py`; check that `random.Random(seed)` is the only entropy source |
| CI workflow not triggering | Push hit a path the workflow doesn't watch | Check `q7-smoke.yml` `paths:` filter; touch a watched file |

## Related

- Plan: [../../plans/q7/PR-01-scaffold-plan.md](../../plans/q7/PR-01-scaffold-plan.md)
- Master roadmap: [../../plans/q7/README.md](../../plans/q7/README.md)
- Decisions: [../../decisions/q7/DEC-Q7-001-dir-layout.md](../../decisions/q7/DEC-Q7-001-dir-layout.md), [../../decisions/q7/DEC-Q7-002-ci-matrix.md](../../decisions/q7/DEC-Q7-002-ci-matrix.md)
