# DEC-Q7-012 — First-launch model download UX

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #6
**Scope:** The UX for downloading ~472MB of model weights (DINOv2 22MB + CLIP 150MB + CLAP 300MB) on first Q7 use.

## Question

The three backbones aren't bundled with the app (would inflate the installer beyond reasonable size + would violate HF licensing in some cases). They're downloaded from HuggingFace on first use. What does that flow look like? Where does the progress show? What happens on retry / failure / no network?

## Decision

### Download trigger

**Lazy, on-demand per backbone.** The first time `Loader.encode()` is called for a backbone whose weights aren't cached locally (per `verified.json` marker — DEC-Q7-005), the loader:

1. Surface a frontend modal: "Downloading <backbone name>: <size> MB"
2. Start the `huggingface_hub.snapshot_download` with progress callback
3. Validate SHA-256 manifest against the local files
4. Write `verified.json` marker
5. Return the embedding (this first encode pays the cold-load too — measured by `cold_load_seconds`)

Subsequent encodes on the same backbone use the cached weights with no download UI.

### Progress UI

A frontend overlay with:

- Backbone name + size estimate ("DINOv2 — 22 MB")
- Progress bar (percentage)
- Bytes downloaded / total
- Cancel button → aborts the snapshot_download + tears down the loader; user can retry

If multiple backbones download concurrently (first --measure run hits all three), show a stacked list:

```
Downloading L backbones for Tier 5 features:
  DINOv2  ████████░░░░░░░░  56%  12.3 / 22 MB
  CLIP    ██░░░░░░░░░░░░░░  18%  27.0 / 150 MB
  CLAP    █░░░░░░░░░░░░░░░   5%   15.2 / 300 MB
Total: 54.5 / 472 MB
```

### Retry policy

- HTTP failures: retry 3× with exponential backoff (1s, 2s, 4s)
- SHA-256 mismatch: delete partial download + retry once; second failure surfaces "Model integrity check failed — try again later or check HF mirror" toast
- Connection timeout: surface "No network — Q7 features unavailable until reconnect" toast; loader stays in unloaded state
- Disk full: surface "Insufficient disk space — Q7 needs ~500MB free" with cleanup hint

### Cancel + resume

- Cancel mid-download → cleanup partial files; user can retry later
- App quit mid-download → `huggingface_hub` writes resume markers; next run picks up where it left off

### Backend-side implementation

```python
# In loaders/dinov2.py (PR #6 lights this up)
def _lazy_load(self) -> None:
    """First-call lazy load: download → verify → load model."""
    from huggingface_hub import snapshot_download
    from .cache import resolve_cache_dir, verify_manifest, write_verified_marker
    
    cache_dir = resolve_cache_dir(self._entry.name, self._entry.revision)
    marker = load_verified_marker(cache_dir)
    if marker is None:
        # Need to download
        snapshot_download(
            repo_id=self._entry.hf_repo,
            revision=self._entry.revision,
            local_dir=str(cache_dir),
            local_dir_use_symlinks=False,
            tqdm_class=Q7ProgressBar,  # reports to ZMQ → frontend
        )
        # SHA verify (PR #6 ships no-op for placeholder; real SHAs in PR #6+)
        verify_manifest(cache_dir, {})
        write_verified_marker(cache_dir, {}, backend_name=self._backend)
    # Load via transformers
    from transformers import AutoModel, AutoImageProcessor
    self._processor = AutoImageProcessor.from_pretrained(str(cache_dir))
    self._model = AutoModel.from_pretrained(str(cache_dir))
    self._model.eval()
```

### Frontend-side IPC

The download progress is reported via the existing ZMQ sidecar pattern:

```typescript
// frontend/src/renderer/q7/downloadProgress.ts (PR #6 ships)
ipcRenderer.on('q7-download-progress', (event, payload) => {
  // payload: { backbone: string, bytes_downloaded: int, bytes_total: int, status: 'downloading' | 'complete' | 'error' }
  q7DownloadStore.updateProgress(payload);
});
```

A Zustand store (`q7DownloadStore`) drives the modal. Modal mounts only when at least one backbone is mid-download; auto-hides on completion.

### When does the modal show?

- First `--measure` invocation on a host without cached models → modal appears
- Subsequent invocations with cached models → no modal (instant)
- `make q7-smoke` → never (mock backend, no downloads)
- User clicks "Tier 5 feature" in UI for the first time → modal appears

### Error states surface to the user

| State | UX |
|---|---|
| Network unavailable | Toast: "L backbones require internet for first download. Try again on reconnect." |
| Download failed (3 retries) | Toast: "Could not download <backbone>. Tier 5 features disabled until next attempt." |
| SHA-256 mismatch | Toast: "Model integrity check failed — re-running may resolve this." |
| Disk full | Toast: "Insufficient disk space — Q7 needs ~500MB free. Free space and retry." |
| User cancelled | No toast (intentional); modal closes; loader returns to unloaded state |

## Considered alternatives

- **Bundle weights in the app installer** — REJECTED. +472MB installer; HF licensing varies per model; updates would require full reinstall
- **Background download at app start (eager)** — REJECTED. Forces every user to pay download cost even if they never use Tier 5; bad first-launch UX
- **Eager download at sign-in / first project open** — REJECTED. Same problem; we want explicit "I'm enabling Tier 5" signal
- **CLI-only download (no UI)** — REJECTED. Most users will hit this through the UI, not CLI; need visible progress
- **Use a third-party model CDN instead of HF** — DEFERRED. Vendor tarball fallback (DEC-Q7-005) covers HF rotation; setting up our own CDN is post-v1

## Side effects to track

- New dep: `huggingface_hub>=0.26` (already pinned in `requirements-q7-measure.txt` from PR #4)
- New frontend component: Q7 download modal (PR #6 frontend stub; full UI in PR #9 with the L worker integration)
- New ZMQ command: `q7-download-progress` events (relay layer wire-through)
- Cache dir: `~/.entropic/models/q7/` (existing path per DEC-Q7-001)
- Telemetry: surface download metrics if Sentry is configured (DEFERRED to PR #7+)

## Verification

After PR #6 merges:

```bash
# Trigger a download (mock, since real lights up in PR #9)
cd backend/scripts && python3 -c "
from q7_benchmark.loaders import make_loader
import numpy as np
loader = make_loader('dinov2', backend='cpu')  # real backend, but encode still stubbed in PR #6
try:
    loader.encode(np.zeros((224, 224, 3), dtype=np.uint8))
except NotImplementedError as e:
    print(f'Expected NotImplementedError (real encode lands in PR #6): {e}')"
```

Real download exercised only when DINOv2 encode is lit up — separately committed within PR #6.

## Cross-references

- DEC-Q7-005 — model SHA pinning; this decision is the UX layer on top
- DEC-Q7-013 — latent cache invalidation; ties to verified.json marker
- CTO R5 — HF model availability rotation
- PR #9 (Session 2) — full L worker integration; download UX wires through here
