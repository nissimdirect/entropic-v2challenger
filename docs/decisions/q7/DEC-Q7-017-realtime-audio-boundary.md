# DEC-Q7-017 — Realtime-audio boundary for SG-4

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #10 (Session 2)
**Scope:** Define what "realtime audio" means in this codebase + the import contract that enforces SG-4 isolation.

## Question

SG-4 says: "the audio render thread MUST NOT be starved by L inference." DEC-Q7-008 satisfies this at the process boundary (L worker is a separate process). But within the render sidecar process itself, we also need to ensure no audio-path code accidentally imports an L module — that would defeat the purpose by importing all of torch/transformers into the audio-render process address space.

What counts as "the audio realtime path" in this codebase?

## Decision

### The realtime audio path

The following files in `backend/src/audio/` are on the realtime path (touched during audio playback):

| File | Realtime role |
|---|---|
| `audio/clock.py` | Audio clock + tick generation |
| `audio/project_clock.py` | Project-rate clock conversion |
| `audio/mixer.py` | Multi-track audio mixing |
| `audio/mixer_player.py` | Realtime mixer playback |
| `audio/player.py` | PortAudio output (the hottest path) |
| `audio/meter.py` | Realtime VU/peak metering |

The following are NOT realtime — they're decode/file I/O:

| File | Non-realtime role |
|---|---|
| `audio/decoder.py` | Offline PyAV decode |
| `audio/streaming_decoder.py` | Streaming decode (separate thread, not the audio callback) |
| `audio/waveform.py` | Offline waveform generation |

### Forbidden imports from realtime paths

The realtime files above MUST NOT (directly or transitively) import:

- `q7_worker.*` — that's the L worker process; main process should never import it
- `q7_benchmark.loaders.*` — loader factory + model weights
- `q7_benchmark.bench`, `q7_benchmark.jitter`, `q7_benchmark.queue_sat`, `q7_benchmark.under_load` — benchmark machinery
- `torch.*` — torch import is ~200ms and pulls in CUDA/MPS state
- `transformers.*` — same; pulls in tokenizers + safetensors
- `huggingface_hub.*` — HF I/O has network code paths
- `mlx.*` — Apple silicon ML framework
- `laion_clap.*` — CLAP wrapper
- Anything that loads model weights

### Enforcement

A pytest assertion test scans every file in the realtime list and checks its AST for forbidden top-level + transitive imports. The test FAILS if any forbidden import is found (direct or via a recursive scan of project-local modules).

```python
# backend/tests/test_sg4_realtime_isolation.py
REALTIME_FILES = [
    "audio/clock.py", "audio/project_clock.py",
    "audio/mixer.py", "audio/mixer_player.py",
    "audio/player.py", "audio/meter.py",
]
FORBIDDEN = {
    "q7_worker", "q7_benchmark.loaders", "q7_benchmark.bench",
    "q7_benchmark.jitter", "q7_benchmark.queue_sat",
    "q7_benchmark.under_load", "torch", "transformers",
    "huggingface_hub", "mlx", "laion_clap",
}

def test_realtime_audio_has_no_l_imports():
    for rel in REALTIME_FILES:
        path = BACKEND_SRC / rel
        forbidden = scan_imports(path) & FORBIDDEN
        assert not forbidden, f"{rel} imports forbidden: {forbidden}"
```

### Out-of-scope reads of realtime data

The L worker IS ALLOWED to receive audio data over ZMQ (e.g., a 3-second snippet for CLAP encoding). What it CAN'T do is import the audio module itself. The handshake is:
1. Frontend captures audio snippet from realtime path
2. Frontend serializes (base64 + sample_rate)
3. Frontend sends to L worker via ZMQ
4. L worker decodes the snippet from the bytes — never imports audio.player or audio.mixer

This preserves SG-4 (no L code in the audio process) while enabling cross-modal queries.

## Considered alternatives

- **Runtime gate at audio thread start** — REJECTED. Too late; if the module was imported at process start, the GIL/memory cost is already paid
- **Annotation-based contract** (e.g., decorators on realtime functions) — REJECTED. Easy to forget; doesn't scan transitive imports
- **CODEOWNERS check on PR review** — REJECTED. Manual; doesn't fire in CI
- **Per-file `# SG-4: realtime` header comment + grep check** — REJECTED. Grep is fragile (regex churn); pytest AST scan is robust

## Side effects

- New test: `backend/tests/test_sg4_realtime_isolation.py` (smoke-marked, runs in every PR)
- File-level docstrings updated on the 6 realtime files to note SG-4 constraint
- No runtime behavior changes (it's a structural lint)

## Verification

After PR #10 merges:

```bash
# Test must pass on current main
cd backend && pytest tests/test_sg4_realtime_isolation.py -v

# Intentional break — add `import torch` to mixer.py, test must fail
echo "import torch" >> backend/src/audio/mixer.py
pytest tests/test_sg4_realtime_isolation.py -v  # FAILS as expected
git checkout backend/src/audio/mixer.py
```

## Cross-references

- DEC-Q7-008 sidecar topology — process-level isolation
- SPEC-3 §4 SG-4 audio isolation contract
- SPEC-5 audio isolation acceptance criteria
