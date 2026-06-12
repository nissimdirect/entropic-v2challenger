# PR #2 — SG-7 Codec Timeout

Wraps PyAV `av.open` with a hard timeout so untrusted / corrupt source files cannot hang the renderer. SPEC-3 §6 + SPEC-7 §5 acknowledge SG-7 as "lightweight, ship anytime" — promoted to Session 1 PR #2 per CTO Q1 because it ships independently of the Q7 verdict.

## Uncertainty register

- [x] **UNK-01:** Threading model — `signal.SIGALRM` vs `threading.Thread+join(timeout)` vs `multiprocessing`? → **Resolved in DEC-Q7-003:** threading.Thread + join with bounded zombie-thread acceptance. SIGALRM is main-thread-only; export/render code calls av.open from worker threads. Multiprocessing has ~200-500ms spawn overhead on macOS Python 3.12+ which we can't pay on every source load.
- [x] **UNK-02:** Default timeout value? → **Resolved:** 5 seconds. SPEC-7 §5.2 default. Per-callsite override available.
- [x] **UNK-03:** Wrap signature — drop-in `av.open` replacement OR context manager? → **Resolved:** drop-in function `av_open_timeout(path, *, mode='r', timeout_s=5.0, **kwargs)`. Context manager adds caller boilerplate without value here (we want minimal callsite changes).
- [x] **UNK-04:** Where does `av.error.FileNotFoundError` come from in worker thread? → **Resolved:** caught + re-raised in calling thread via result queue (not silenced).
- [ ] **UNK-05:** Should we expose telemetry on timeout events (count of timeouts per session for Sentry)? → Deferred to PR #3+. PR #2 logs + raises; telemetry wiring is a separate concern.

## Scope

### What to test
- [ ] `av_open_timeout` with a healthy file returns the container
- [ ] `av_open_timeout` with a missing file re-raises `av.error.FileNotFoundError`
- [ ] `av_open_timeout` with a truncated file raises `CodecTimeoutError` within `timeout_s + 0.5s`
- [ ] Each of the 5 callsites uses `av_open_timeout` (grep verification)
- [ ] Existing tests still pass (`pytest backend/tests/test_video/` + `test_audio/`)
- [ ] CodecTimeoutError serializes through ZMQ to a useful frontend toast

### Edge cases to verify
- [ ] Empty file (0 bytes) — does PyAV hang or error fast? Verify with test
- [ ] Valid header + truncated body (the canonical SPEC-7 §5.4 test case)
- [ ] Non-video file with valid magic bytes (e.g., PDF renamed .mp4) — should error fast
- [ ] Custom kwargs (e.g., `av.open(path, options={...})`) round-trip correctly
- [ ] `mode='w'` path (writer.py) — does the timeout still make sense? (yes — encoder init can hang on bad codec config)
- [ ] Multiple concurrent `av_open_timeout` calls from different threads (writer + reader in parallel during export)
- [ ] Calling from main thread vs worker thread (both must work)

### How to verify (reproduction commands)
- Module unit tests: `cd backend && PYTHONPATH=src pytest tests/test_video/test_codec_timeout.py -v`
- Callsite integration: `cd backend && pytest tests/test_video/ tests/test_audio/ -v` (existing tests should still pass)
- Manual repro of truncated-file hang:
  ```bash
  printf '\x00\x00\x00\x18ftypmp42' > /tmp/truncated.mp4
  cd backend && PYTHONPATH=src python3 -c "from video.codec_timeout import av_open_timeout, CodecTimeoutError; import time; t=time.monotonic(); 
  try: av_open_timeout('/tmp/truncated.mp4', timeout_s=1.0); print('OK')
  except CodecTimeoutError as e: print(f'TIMEOUT in {time.monotonic()-t:.2f}s: {e}')
  except Exception as e: print(f'OTHER ERROR: {type(e).__name__}: {e}')"
  ```
- Working: timeout fires in ~1s; full test suite green
- Broken: hang or wrong exception type

### Existing test patterns to follow
- Test framework: pytest with markers (`smoke`, `oracle`)
- Example test file for video: `backend/tests/test_engine/` for engine-level patterns; `backend/tests/test_video/` likely already exists — verify
- Test fixture conventions: use `tmp_path` for synthesized bad files

## Checkboxed items

### A. Decision docs first
- [ ] **DEC-Q7-003** Codec timeout mechanism: `threading.Thread+join(timeout)` with bounded zombie-thread acceptance. Document tradeoff.

### B. Files to add
- [ ] `backend/src/video/codec_timeout.py` — `CodecTimeoutError` + `av_open_timeout` + `_av_open_worker` (private)
- [ ] `backend/tests/test_video/test_codec_timeout.py` — 5 unit tests (healthy / missing / truncated / kwargs / threading)

### C. Files to modify (callsite wraps)
- [ ] `backend/src/video/ingest.py:21` — replace `av.open(path)` with `av_open_timeout(path)`
- [ ] `backend/src/video/reader.py:9` — replace `av.open(path)` with `av_open_timeout(path)`
- [ ] `backend/src/video/writer.py:21` — replace `av.open(path, mode="w")` with `av_open_timeout(path, mode="w")`
- [ ] `backend/src/audio/decoder.py:53` — replace `av.open(path)` with `av_open_timeout(path)`
- [ ] `backend/src/audio/streaming_decoder.py:55` — replace `av.open(self._path)` with `av_open_timeout(self._path)`

### D. Validation
- [ ] `pytest tests/test_video/test_codec_timeout.py -v` green (new unit tests)
- [ ] `pytest tests/test_video/ tests/test_audio/ -v` green (existing tests not broken)
- [ ] `grep -rn "av\.open(" backend/src` returns ONLY the new `codec_timeout.py` implementation (all 5 callsites converted)
- [ ] Manual truncated-file repro completes within `timeout_s + 0.5s` budget

### E. PR open + merge
- [ ] `gh pr create --base main --draft --title "[q7][sg-7] PR #2: codec timeout wrap (5 callsites)"`
- [ ] CI green (existing test.yml suite + new test_codec_timeout)
- [ ] User merge nod
- [ ] Squash merge

## Effort

- Plan + decision doc: 30 min
- Module + 5 wraps + tests: 1-2 h
- CI cycle + merge: 30 min
- **Total estimate: ~3 h** (under the SPEC-7 §5.6 "XS, ≤ 1 day" budget)

## Coordination

PR-zero just merged (origin/main = `9c913bc`). Per-track effect chain refactor touched `freeze.ts` + DeviceChain + App.tsx — NONE of the SG-7 callsites. Safe to branch off latest main.

## Next PR

PR #3 — Model loaders + backend detector (DINOv2, CLIP, CLAP). Starts the real benchmark dependencies.
