# DEC-Q7-005 — Model versions + SHA pinning

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #3 (Session 1)
**Scope:** Which model revisions are pinned for Q7 benchmarks + the L backbone runtime, and how integrity is verified.

## Question

The three Q7 backbones are pulled from HuggingFace by default. HF lets repo owners rotate model weights without changing the repo name. If the underlying checkpoint changes, our benchmarks become non-comparable across time and our latent cache (PR #11 SG-8 work) gets invalidated silently. We need:

- Pinned revision (commit SHA) per model, not just the repo name
- SHA-256 verification of downloaded weight files
- A documented refresh procedure (when to bump pins)
- A fallback story if HF goes dark or repo owner deletes (CTO R5)

## Decision

### Pinned model registry

Lives at `backend/scripts/q7_benchmark/loaders/models.toml`:

```toml
[dinov2]
hf_repo = "facebook/dinov2-small"  # ViT-S/14
revision = "PLACEHOLDER_SHA_PR3"
embed_dim = 384
modality = "vision"
input_resolution = 224  # square input expected
sha256_manifest = "sha256-manifest-dinov2.json"  # per-file SHA-256, sibling file
size_mb_estimate = 22
license = "Apache-2.0"

[clip]
hf_repo = "openai/clip-vit-base-patch32"
revision = "PLACEHOLDER_SHA_PR3"
embed_dim = 512
modality = "vision_text"
input_resolution = 224
sha256_manifest = "sha256-manifest-clip.json"
size_mb_estimate = 150
license = "MIT"

[clap]
hf_repo = "laion/clap-htsat-unfused"
revision = "PLACEHOLDER_SHA_PR3"
embed_dim = 512
modality = "audio_text"
input_sample_rate = 48000
input_min_duration_s = 3.0
sha256_manifest = "sha256-manifest-clap.json"
size_mb_estimate = 300
license = "CC-BY-4.0"
```

**PR #3 ships with PLACEHOLDER revisions.** Real SHAs land in PR #4 (the first `--measure` run captures + verifies them on Apple silicon).

### SHA-256 verification

On first download (lazy, in `--measure` mode):

1. Loader resolves `revision` from `models.toml`
2. Downloads via `huggingface_hub.snapshot_download(repo_id, revision=revision)`
3. Reads `sha256_manifest` from the downloaded snapshot (committed alongside the model files in the HF repo OR generated locally on first download and saved to disk for re-verification)
4. Walks every weight file (`*.safetensors`, `*.bin`, `*.pt`) — compute SHA-256, compare against manifest
5. On mismatch: raise `ModelIntegrityError(file=..., expected_sha=..., actual_sha=...)` — refuse to proceed

For PR #3 (no real loads yet): the manifest is empty; verification function exists but no-ops with a clear log line. PR #4 populates the manifest.

### Cache location

Resolved via `cache.py` in PR #3:

```
~/.entropic/models/q7/<model_name>/<revision_sha[:12]>/
  ├── config.json
  ├── *.safetensors
  └── verified.json    # local marker: {sha256_manifest, verified_at, backend_used}
```

- Uses `~/.entropic/` per the existing entropic convention (already in use for crash dumps + logs per CLAUDE.md).
- Cache directory creation is idempotent and respects `XDG_CACHE_HOME` if set (deferred to PR #4 if needed; not blocking).

### Refresh procedure

When a backbone updates upstream:

1. Manually bump `revision` in `models.toml` to the new HF commit SHA
2. Delete the corresponding cache subdirectory: `rm -rf ~/.entropic/models/q7/<model>/<old_sha>/`
3. Run `make q7-measure` once on a known-good host
4. The runner downloads the new revision, computes SHAs, writes `verified.json`
5. Optional: copy the new manifest into the repo as a sentinel
6. Commit the `models.toml` bump + manifest change
7. **Bump report `schema_version` ONLY if the underlying model architecture changed** (e.g., DINOv2 v2 → v3 with different embed_dim). Pure weight updates don't bump schema.

### Vendor tarball fallback (deferred)

Per CTO R5, if HF rotates a checkpoint we don't want OR repo gets pulled, we need a backup. **PR #3 does not implement vendor fallback.** PR #5 or later decision adds:

- S3/GCS bucket location for tarballs (TBD)
- Loader logic: try HF first, on 404 try vendor tarball URL from `models.toml`
- This is a half-day spike when needed; flagged for monitoring not built now

## Considered alternatives

- **Use HF `model-index` only (no SHA pinning)** — REJECTED. Repo owner can re-tag silently.
- **Bundle weights in the repo** — REJECTED. 472MB combined exceeds GitHub LFS budget for a benchmark spike.
- **Bundle weights in releases (GitHub Releases binary asset)** — DEFERRED. Viable fallback if HF rotates; not the v1 path.
- **Use ONNX checkpoints from ONNX Model Zoo** — REJECTED for now. ONNX is a future cross-platform path (CTO note on Intel Mac); MLX + PyTorch native is the Apple silicon path.
- **Validate weights via cryptographic signature instead of SHA-256** — REJECTED. SHA-256 over a manifest is enough for "did the bytes change"; we don't need authenticity (HF repo URL is the trust root).

## Side effects to track

- New top-level optional dependency: `huggingface_hub` (~12MB pure Python). Lands in `requirements-q7-measure.txt` in PR #4, NOT in `requirements-q7.txt` (smoke remains stdlib-only).
- New file `models.toml` is the authoritative model pin source. Anyone bumping a model MUST edit this file.
- If `models.toml` has `revision = "PLACEHOLDER_SHA_PR3"` at `--measure` time: loader logs WARNING and uses HF default branch (latest). This is the PR #3 → PR #4 transition state.

## Verification

After PR #3 merges:

```bash
# Loader reports declared embed_dim per registry
cd backend && PYTHONPATH=scripts python3 -c "
from q7_benchmark.loaders import make_loader
for name in ('dinov2', 'clip', 'clap'):
    loader = make_loader(name, backend='mock')
    print(f'{name}: embed_dim={loader.embed_dim}')
"
# Expected: dinov2: 384 / clip: 512 / clap: 512

# Cache dir created idempotently
cd backend && PYTHONPATH=scripts python3 -c "
from q7_benchmark.loaders.cache import resolve_cache_dir
print(resolve_cache_dir('dinov2', revision='abcdef123456'))
"
# Expected: ~/.entropic/models/q7/dinov2/abcdef123456/
```

## Cross-references

- DEC-Q7-004 (backend fallback) — loader code paths differ by backend; SHA verification is backend-agnostic
- CTO R5 (HF model availability rotation) — this decision is the mitigation; vendor fallback is the next step
- PR #4 (latency + throughput) — first `--measure` run populates real SHAs; this is when verification has teeth
- SPEC-5 §3 — model loading contract that loaders implement
