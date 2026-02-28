# Contributing to Entropic v2 Challenger

## Conventional Commit Scopes

Format: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`

Scopes:
- `effects` — effect plugins (blur, glitch, color, etc.)
- `color` — color suite (HSL, curves, levels, etc.)
- `timeline` — timeline engine, playback, scrubbing
- `zmq` — ZMQ server, IPC protocol
- `video` — video reader, writer, ingest, probe
- `audio` — audio player, decoder, waveform, A/V clock
- `export` — video export pipeline
- `perf` — performance optimization
- `automation` — automation lanes, keyframes

Examples:
- `feat(effects): add chromatic aberration effect`
- `fix(zmq): handle malformed JSON without deadlock`
- `test(color): add HSL edge case coverage`

## Test Tiers

| Tier | Command | Duration | What |
|------|---------|----------|------|
| Smoke | `pytest -m smoke -x -q` | ~3s | Fast unit tests, no I/O |
| Full | `pytest -x -q` | ~18s | All tests (parallel via xdist) |
| Perf | `pytest -m perf` | ~10s | Performance gates (opt-in) |

## Test Scripts

- `scripts/check_tests.sh` — Skip-if-green gate (exit 0 = skip, exit 1 = run)
- `scripts/test_health.py` — Dashboard (summary, --slow, --flaky, --rotate)

## Test Manifest

`.test-manifest.json` is auto-generated after every test run. Contains pass/fail counts, branch, SHA, and green status. Used by `/eng` and `/quality` for smart test gating.

Add to `.gitignore`:
```
.test-manifest.json
.test-results/
```
