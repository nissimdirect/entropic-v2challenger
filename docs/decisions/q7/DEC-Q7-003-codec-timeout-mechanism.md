# DEC-Q7-003 — SG-7 codec timeout: threading mechanism

**Status:** Decided 2026-06-03
**Owner:** SG-7 PR (Session 1 PR #2)
**Scope:** How to enforce a hard timeout on `av.open` calls in PyAV.

## Question

PyAV's `av.open(path)` can hang for minutes on malformed input (bad header, corrupted index, truncated stream). The Python interpreter cannot interrupt a C-level blocking call from another thread. How do we enforce a 5-second timeout?

## Options considered

| Option | Works on | Main thread only? | Overhead | Truly unblocks | Notes |
|---|---|---|---|---|---|
| `signal.SIGALRM` | POSIX | YES | ~0 | YES | Best if all callers were main-thread. They're not: export thread, render thread, audio thread all call `av.open` |
| `threading.Thread + join(timeout)` | All | No | ~10ms (thread spawn) | NO (caller gives up; worker keeps running) | Pragmatic. Zombie thread risk bounded by process lifetime |
| `multiprocessing.Pool` + `apply_async().get(timeout=)` | All | No | ~200-500ms (spawn on Python 3.12+ macOS — default `spawn` start method) | YES (kill worker process) | Too slow for source loading where we may open dozens of files |
| `concurrent.futures.ThreadPoolExecutor` + `.result(timeout=)` | All | No | ~10ms | NO (same as raw threading) | Same semantics as #2 with marginally nicer API |
| `os.pipe2() + select()` around a forked PyAV worker | POSIX | No | ~20ms | YES | Heavy; reimplements multiprocessing |
| PyAV native timeout option | — | — | — | — | Doesn't exist as of PyAV 16 |

## Decision

**`threading.Thread + join(timeout)` with bounded zombie-thread acceptance.**

Implementation sketch (full impl ships in PR #2):

```python
import threading
import queue
from typing import Any
import av

class CodecTimeoutError(Exception):
    """Raised when av.open exceeds the timeout."""
    def __init__(self, asset_path: str, operation: str, elapsed_s: float):
        self.asset_path = asset_path
        self.operation = operation
        self.elapsed_s = elapsed_s
        super().__init__(
            f"Decode timeout: {operation} on {asset_path} exceeded {elapsed_s:.1f}s"
        )


def _av_open_worker(path: str, mode: str, kwargs: dict, result_q: queue.Queue) -> None:
    try:
        container = av.open(path, mode=mode, **kwargs)
        result_q.put(("ok", container))
    except BaseException as exc:  # noqa: BLE001 — propagate ALL errors including SystemExit
        result_q.put(("err", exc))


def av_open_timeout(path: str, *, mode: str = "r", timeout_s: float = 5.0, **kwargs: Any):
    """Drop-in wrapper for av.open with a hard timeout.

    On timeout: raises CodecTimeoutError. The worker thread is left running
    as a daemon; it will eventually complete or hang until the process exits.
    The OS reclaims the thread on process exit.

    On worker error: re-raises the original exception (FileNotFoundError,
    InvalidDataError, etc.).

    On success: returns the av.Container instance, same as av.open.
    """
    result_q: queue.Queue = queue.Queue(maxsize=1)
    worker = threading.Thread(
        target=_av_open_worker,
        args=(path, mode, kwargs, result_q),
        name=f"av-open-{path[-30:]}",
        daemon=True,
    )
    worker.start()
    worker.join(timeout_s)
    if worker.is_alive():
        raise CodecTimeoutError(path, "av.open", timeout_s)
    kind, value = result_q.get_nowait()
    if kind == "err":
        raise value
    return value
```

## Rationale

1. **Caller-thread agnostic.** Works from main thread, export thread, render thread, audio thread — none of those can use `signal.SIGALRM`.
2. **Low overhead (~10ms).** Thread spawn is cheap on POSIX. Source loading is not a per-frame hot path (only at session start, file import, export init).
3. **Caller unblocks.** Even if the worker thread hangs forever, the caller gets a `CodecTimeoutError` and can proceed. This is the user-facing requirement: the renderer must NOT freeze.
4. **Bounded leak.** Zombie threads consume ~8KB of stack + 1 thread-count slot. macOS/Linux defaults allow ~1000+ threads per process. A worst-case adversarial source causing 100 zombie threads still leaves headroom. Process exits eventually (Electron sidecars restart on watchdog timeout), reclaiming everything.

## Tradeoffs accepted

- **Zombie thread risk** (rare, bounded). Users importing 1000 corrupt files in one session might accumulate zombies. Mitigation: SG-7 telemetry (deferred to PR #3+) will surface a count for monitoring; if observed in the wild, add a process-level recycle or fall through to multiprocessing.
- **Cannot CPU-kill the worker.** If `av.open` is in a tight C loop consuming a core, that core stays pinned until av.open returns. Empirically `av.open` on malformed input typically returns within seconds (long-tail is the hang case we're catching).
- **No async/await support.** `av_open_timeout` is sync. Callers in async contexts would need `asyncio.to_thread`. None of the 5 callsites are async, so this is fine for v1.

## Cross-references

- SPEC-7 §5 — original SG-7 spec
- SPEC-3 §6 — gate inventory
- DEC-Q7-001 — directory layout (codec_timeout.py lives at `backend/src/video/`)
- PR-02 plan: `docs/plans/q7/PR-02-sg7-codec-timeout-plan.md`

## Verification

After PR #2 merges, the following must hold:

```bash
# 1. All 5 callsites converted (no raw av.open in backend/src except codec_timeout.py)
grep -rn "av\.open(" ~/Development/entropic-v2challenger/backend/src \
  | grep -v codec_timeout.py
# Expected: empty

# 2. Truncated file triggers timeout within budget
printf '\x00\x00\x00\x18ftypmp42' > /tmp/truncated.mp4
time python3 -c "from video.codec_timeout import av_open_timeout, CodecTimeoutError
try: av_open_timeout('/tmp/truncated.mp4', timeout_s=1.0)
except CodecTimeoutError: print('OK: timeout fired')"
# Expected: "OK: timeout fired" within 1.5s
```
