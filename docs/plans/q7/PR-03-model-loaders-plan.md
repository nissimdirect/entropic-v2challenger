# PR #3 — Model Loaders + Backend Detector (real impl)

Adds the three Q7 backbones — DINOv2 ViT-S/14 (vision), CLIP ViT-B/32 (vision-text), CLAP HTSAT-base (audio-text) — behind a unified loader interface. Backend chain MLX → PyTorch MPS → PyTorch CPU is wired through a `select_backend()` that honors `--mock` for CI.

**No actual model loading or measurement happens in PR #3.** This PR ships the loader code + tests with mocked heavy imports. The first `--measure` runs in PR #4 (latency benchmark) once a runbook + Apple silicon execution context exists.

**Stacked PR:** branched off `feat/q7-l-backbone-benchmark` (PR #117). Merges after PR #117.

## Uncertainty register

- [ ] **UNK-01:** MLX support for CLIP / CLAP — what's the canonical Apple silicon path? → Research needed in DEC-Q7-004. As of 2026-06, mlx-models has DINOv2 + CLIP; CLAP via mlx is unverified.
- [ ] **UNK-02:** Should `--measure` ever fall back from MLX to MPS silently, or fail loudly? → DEC-Q7-004 says fail loudly + log the cascade so the user knows what they're measuring.
- [ ] **UNK-03:** Model versioning — pin via HuggingFace revision SHA, or vendor tarballs to S3/GCS? → DEC-Q7-005 decision. Recommend: SHA-pinned HuggingFace for v1; vendor fallback decision deferred to PR #5+ if HF rotates.
- [ ] **UNK-04:** Where do downloaded model weights live on disk? → `~/.entropic/models/q7/<model_name>/<sha>/` per existing entropic convention (`~/.entropic/` is the user data dir).
- [ ] **UNK-05:** Should loader cold-load time be benchmarked as part of `--measure`? → Yes (per master roadmap PR #4 "cold-load probe"); loader code must expose `cold_load_seconds` for the runner to capture.
- [ ] **UNK-06:** Token / model gating — HuggingFace login required for any of these? → Verify: DINOv2 facebookresearch/dinov2 is open; CLIP openai/clip-vit-base-patch32 open; laion/clap-htsat-unfused open. **All three are public, no token needed.**

## Scope

### What to test
- [ ] Each loader exposes a uniform `Loader` protocol: `name`, `embed_dim`, `cold_load_seconds`, `encode(input)` → `np.ndarray`
- [ ] Backend detector returns the highest-priority available backend
- [ ] Mock backend integration: `loaders.dinov2.MockLoader.encode(frame)` returns a 384-dim array deterministically
- [ ] Backend fallback cascade logs each attempt + reason on backend miss
- [ ] Loaders defer heavy imports until first call (allow CI smoke without torch installed)
- [ ] Each loader's `embed_dim` matches the spec in DEC-Q7-005

### Edge cases to verify
- [ ] DINOv2 loader called on non-square input → resizes correctly OR raises with clear message
- [ ] CLIP loader called with empty text prompt → raises with clear message
- [ ] CLAP loader called with audio shorter than HTSAT min duration → pads or raises clear message
- [ ] Loader factory `make_loader(name="dinov2", backend="mock")` returns a working mock
- [ ] Loader factory with invalid name raises `ValueError`
- [ ] Loader factory with unavailable backend raises `BackendUnavailableError`
- [ ] All three loaders concurrently in the same process don't conflict on model caches

### How to verify (reproduction commands)
- Loader unit tests (mock-only, no torch): `cd backend && pytest tests/test_q7_benchmark/test_loaders/ -m smoke -q -o addopts=""`
- Backend detector tests: `cd backend && pytest tests/test_q7_benchmark/test_backend_detect.py -m smoke -q -o addopts=""`
- Static type check: `cd backend && PYTHONPATH=scripts python3 -m mypy scripts/q7_benchmark/loaders/ --ignore-missing-imports`

### Existing test patterns to follow
- Mock heavy imports: pytest `monkeypatch.setattr(sys, 'modules', ...)` pattern at test level
- Loader Protocol: `typing.Protocol` for static structural typing; concrete classes implement implicitly

## Checkboxed items

### A. Decision docs first
- [ ] **DEC-Q7-004** Backend fallback algorithm (MLX → MPS → CPU; fail loudly on miss; cascade logging)
- [ ] **DEC-Q7-005** Model versions + SHA pinning (DINOv2 ViT-S/14, CLIP ViT-B/32, CLAP HTSAT-base; HF revision SHAs; cache location; vendor fallback deferred)

### B. Files to add
- [ ] `backend/scripts/q7_benchmark/loaders/__init__.py` — exposes `make_loader`, `Loader` Protocol
- [ ] `backend/scripts/q7_benchmark/loaders/_base.py` — `Loader` Protocol + `LoaderResult` dataclass
- [ ] `backend/scripts/q7_benchmark/loaders/dinov2.py` — DINOv2 ViT-S/14 loader (real + mock)
- [ ] `backend/scripts/q7_benchmark/loaders/clip.py` — CLIP ViT-B/32 loader (real + mock)
- [ ] `backend/scripts/q7_benchmark/loaders/clap.py` — CLAP HTSAT-base loader (real + mock)
- [ ] `backend/scripts/q7_benchmark/loaders/models.toml` — SHA-pinned model registry (`name -> hf_repo + revision + sha256_manifest`)
- [ ] `backend/scripts/q7_benchmark/loaders/cache.py` — cache dir resolution (`~/.entropic/models/q7/`) + SHA verification
- [ ] `backend/tests/test_q7_benchmark/test_loaders/__init__.py`
- [ ] `backend/tests/test_q7_benchmark/test_loaders/test_dinov2.py` — mock encode + embed_dim + lazy import
- [ ] `backend/tests/test_q7_benchmark/test_loaders/test_clip.py` — same shape
- [ ] `backend/tests/test_q7_benchmark/test_loaders/test_clap.py` — same shape
- [ ] `backend/tests/test_q7_benchmark/test_loaders/test_factory.py` — `make_loader` interface
- [ ] `backend/tests/test_q7_benchmark/test_loaders/test_cache.py` — cache dir + SHA verification

### C. Files to modify
- [ ] `backend/scripts/q7_benchmark/runner.py` — wire `make_loader` into `--measure` path (still raises SystemExit since latency measurement is PR #4 scope)
- [ ] `backend/scripts/q7_benchmark/mock.py` — re-export `MockLoader` instances or document the seam
- [ ] `backend/scripts/q7_benchmark/requirements-q7.txt` — keep stdlib-only for smoke; add a NEW `requirements-q7-measure.txt` with torch/transformers/etc. pinned (lands fully populated in PR #4)
- [ ] `backend/scripts/q7_benchmark/README.md` — document the loader interface + cache location

### D. Validation
- [ ] `make q7-smoke` still passes (no regression)
- [ ] New loader tests pass: `pytest backend/tests/test_q7_benchmark/test_loaders/ -m smoke -q`
- [ ] Smoke tests still pass: `pytest backend/tests/test_q7_benchmark/ -m smoke -q`
- [ ] CI green on PR

### E. PR open + merge
- [ ] `gh pr create --base feat/q7-l-backbone-benchmark --draft --title "[q7] PR #3: model loaders + backend detector (real impl, mock-tested)"`
- [ ] CI green
- [ ] Wait for PR #117 to merge; rebase PR #3 base to main
- [ ] User merge nod
- [ ] Squash merge

## Effort estimate

- Decision docs: 30-45 min
- Loader scaffolds (5 files + tests): 1.5-2 h (Sonnet-delegatable boilerplate)
- Cache + SHA verify: 30 min
- PR open + CI cycle: 30 min
- **Total: ~3-4 h**

## Architecture notes

```
backend/scripts/q7_benchmark/
├── runner.py          (PR #1; wires --mock/--measure)
├── report.py          (PR #1; JSON schema)
├── backends.py        (PR #1; backend detector)
├── mock.py            (PR #1; deterministic mock measurement)
├── loaders/           (PR #3 NEW)
│   ├── __init__.py    (factory + Protocol)
│   ├── _base.py       (Loader Protocol + LoaderResult)
│   ├── dinov2.py      (vision; ViT-S/14; 384 dims)
│   ├── clip.py        (vision-text; ViT-B/32; 512 dims)
│   ├── clap.py        (audio-text; HTSAT-base; 512 dims)
│   ├── cache.py       (~/.entropic/models/q7/<name>/<sha>/)
│   └── models.toml    (SHA-pinned model registry)
└── schemas/
    └── q7-report.schema.json
```

## Next PR

PR #4 — Latency + throughput benchmark + sidecar topology decision. First real model loads happen here on Apple silicon via `--measure`.
