# Entropic v2 Challenger -- Pending Bug Fixes

**Created:** 2026-02-27
**Context:** Session crash lost an in-progress audit/fix pass. This document reconstructs the full bug state by cross-referencing `docs/SECURITY-AUDIT-2026-02-23.md` (11 findings) against the current codebase at `4ffba39`.
**Source audit:** `docs/SECURITY-AUDIT-2026-02-23.md` (2 HIGH, 5 MEDIUM, 4 LOW)

---

## Already Fixed (9 of 11 from original audit)

These findings have been verified as resolved in the current codebase. No action needed.

| ID | Severity | Description | Fixed In | Evidence |
|----|----------|-------------|----------|----------|
| H-1 | HIGH | Missing `validate_upload` in `_handle_apply_chain` (path traversal) | `b2881a4` | `zmq_server.py:236-239` now calls `validate_upload(path)` |
| H-2 | HIGH | Shared memory file created without explicit permissions | `b2881a4` | `memory/writer.py:39` now uses `0o600` perms |
| M-3 | MEDIUM | No CSP headers on Electron window | `4ffba39` | `frontend/src/main/index.ts:28-36` sets `Content-Security-Policy` |
| M-4 | MEDIUM | `sandbox` not enabled on BrowserWindow | `4ffba39` | `frontend/src/main/index.ts:24` has `sandbox: true` |
| M-5 | MEDIUM | Unbounded VideoReader cache | `4ffba39` | `zmq_server.py:40-43,327-337` uses `OrderedDict` with `_max_readers = 10` and LRU eviction |
| L-1 | LOW | Undeclared Python dependencies | `4ffba39` | `pyproject.toml:10-12` declares `opencv-python-headless`, `scipy`, `sentry-sdk` |
| F-1 | HIGH | Undeclared `opencv-python` dep (Edge Detect crash) | `4ffba39` | `pyproject.toml:10` has `opencv-python-headless>=4.10` |
| F-3 | HIGH | No bounds check on client-supplied `frame_index` | `4ffba39` | `zmq_server.py:186-202` and `zmq_server.py:246-266` check `< 0` and `>= frame_count` |
| F-4 | HIGH | Path traversal check only inspected filename, not resolved path | `4ffba39` | `security.py:30-34` now resolves path and checks `startswith(Path.home())` |

---

## Still Open -- Pending Fixes

### M-1: ZMQ message size limit too generous

- **Severity:** MEDIUM
- **Status:** Partially addressed -- limit exists but is 100 MB, not the recommended 1 MB
- **Original finding:** No max message size on ZMQ server; a local attacker could send a massive JSON message to exhaust memory before chain depth checks run.
- **Current state:** `MAXMSGSIZE` set to `104857600` (100 MB) on both sockets. The audit recommended 1 MB for the main socket and 4 KB for the ping socket.

**File(s) to change:**
- `backend/src/zmq_server.py`

**What to change:**

- [ ] **Line 29:** Change `self.socket.setsockopt(zmq.MAXMSGSIZE, 104857600)` to `self.socket.setsockopt(zmq.MAXMSGSIZE, 1_048_576)` (1 MB)
- [ ] **Line 33:** Change `self.ping_socket.setsockopt(zmq.MAXMSGSIZE, 104857600)` to `self.ping_socket.setsockopt(zmq.MAXMSGSIZE, 4096)` (4 KB -- pings are tiny)

**Note:** Verify that the largest legitimate `render_frame` or `apply_chain` message (with a 10-deep chain and all params) is under 1 MB. It should be well under 100 KB. If base64 frame data is sent IN the request (not just the response), the limit may need to be higher. Check whether any command sends frame data upstream -- if not, 1 MB is generous.

---

### M-2: Error path leaks in non-ZMQ-server code (partial fix)

- **Severity:** MEDIUM
- **Status:** Partially fixed -- `zmq_server.py` handlers are sanitized, but 2 call sites still leak `str(e)`
- **Original finding:** Exception messages passed directly to client as `str(e)`, leaking internal paths, library details, and directory structure.

**File(s) to change:**
- `backend/src/engine/export.py`
- `backend/src/video/ingest.py`

**What to change:**

- [ ] **`backend/src/engine/export.py` line 123:** Change `job.error = str(e)` to sanitize the error before storing it. This value is returned to the frontend via `get_status()` at line 145. Replace with:
  ```python
  import logging
  logger = logging.getLogger(__name__)
  # ...in the except block:
  logger.exception("Export failed")
  job.error = f"Export failed: {type(e).__name__}"
  ```

- [ ] **`backend/src/video/ingest.py` line 11:** Change `return {"ok": False, "error": str(e)}` to sanitize the error. The `av.error` exceptions often include full filesystem paths. Replace with:
  ```python
  import logging
  logger = logging.getLogger(__name__)
  # ...in the except block:
  logger.exception(f"Probe failed for {path}")
  return {"ok": False, "error": f"Failed to open video: {type(e).__name__}"}
  ```

---

### F-2: Export thread race condition on shared fields

- **Severity:** HIGH
- **Status:** OPEN -- no thread synchronization in ExportManager
- **Description:** `ExportJob` dataclass fields (`status`, `current_frame`, `total_frames`, `error`, `output_path`) are written by the background export thread (in `_run_export`) and read by the main ZMQ thread (via `get_status()`). There is no lock protecting these fields. While CPython's GIL makes individual attribute reads/writes atomic for simple types, compound reads in `get_status()` can observe inconsistent state (e.g., `current_frame` updated but `status` still `RUNNING` when the job just completed).

**File(s) to change:**
- `backend/src/engine/export.py`

**What to change:**

- [ ] **Line 4 (imports):** Add `from threading import Lock` (already imports `threading`)
- [ ] **Line 29:** Add a lock to the `ExportJob` dataclass:
  ```python
  _lock: threading.Lock = field(default_factory=threading.Lock)
  ```
- [ ] **Lines 105-117 (the render loop in `_run_export`):** Wrap status mutations in `with job._lock:` blocks. Specifically:
  - Line 107: `job.status = ExportStatus.CANCELLED` -- wrap in lock
  - Line 117: `job.current_frame = i + 1` -- wrap in lock
  - Line 119: `job.status = ExportStatus.COMPLETE` -- wrap in lock
  - Lines 122-123: `job.status = ExportStatus.ERROR` / `job.error = ...` -- wrap in lock
- [ ] **Lines 130-146 (`get_status`):** Wrap the read of job fields in `with self._job._lock:` to get a consistent snapshot:
  ```python
  def get_status(self) -> dict:
      if self._job is None:
          return { ... }
      with self._job._lock:
          return {
              "status": self._job.status.value,
              "progress": round(self._job.progress, 4),
              "current_frame": self._job.current_frame,
              "total_frames": self._job.total_frames,
              "output_path": self._job.output_path,
              "error": self._job.error,
          }
  ```
- [ ] **Lines 148-153 (`cancel`):** Wrap the status check in `with self._job._lock:` before calling `cancel()`.

---

## Additional Items (LOW severity, from original audit -- still open)

These were in the audit backlog and remain unaddressed. Include them here for completeness.

### L-2: Token printed to stdout

- **Severity:** LOW
- **File:** `backend/src/main.py:38` (approximate -- the `print(f"ZMQ_TOKEN=...")` line)
- **Status:** OPEN (backlog)
- [ ] Consider passing the token via a temporary file with `0o600` permissions instead of stdout, or verify the Python process stdout pipe is not world-readable.

### L-3: `ENTROPIC_SHM_PATH` allows arbitrary mmap path

- **Severity:** LOW
- **File:** `backend/src/memory/writer.py:17-21`
- **Status:** OPEN (backlog)
- [ ] Validate that the resolved SHM path is under the user's home directory, same pattern as `validate_upload()`.

### L-4: Project file validation is shallow

- **Severity:** LOW
- **File:** `backend/src/project/schema.py:56-86`
- **Status:** OPEN (backlog)
- [ ] Add bounds validation for `resolution` (64-7680 x 64-4320), `frameRate` (1-120), and `seed` (must be int). Validate `assets` dict paths and `timeline.tracks` contents.

---

## Summary Table

| Bug ID | Severity | Description | Status | Action |
|--------|----------|-------------|--------|--------|
| H-1 | HIGH | Path traversal in `apply_chain` | FIXED (`b2881a4`) | None |
| H-2 | HIGH | mmap file world-readable | FIXED (`b2881a4`) | None |
| F-1 | HIGH | Missing opencv-python dep | FIXED (`4ffba39`) | None |
| F-3 | HIGH | No bounds check on `frame_index` | FIXED (`4ffba39`) | None |
| F-4 | HIGH | Path traversal only checks filename | FIXED (`4ffba39`) | None |
| M-3 | MEDIUM | No CSP headers | FIXED (`4ffba39`) | None |
| M-4 | MEDIUM | No sandbox on BrowserWindow | FIXED (`4ffba39`) | None |
| M-5 | MEDIUM | Unbounded VideoReader cache | FIXED (`4ffba39`) | None |
| L-1 | LOW | Undeclared deps (scipy, sentry-sdk, opencv) | FIXED (`4ffba39`) | None |
| M-1 | MEDIUM | ZMQ MAXMSGSIZE too generous (100 MB) | FIXED (verified 2026-02-28) | None — `zmq_server.py:41` = 1 MB, `:45` = 4 KB |
| M-2 | MEDIUM | Error path leaks in export.py, ingest.py | FIXED (verified 2026-02-28) | None — both use `type(e).__name__` |
| F-2 | HIGH | Export thread race on shared fields | FIXED (verified 2026-02-28) | None — `threading.Lock` on all mutations + reads |
| L-2 | LOW | Token printed to stdout | OPEN (backlog) | Pass via temp file |
| L-3 | LOW | SHM path env var allows arbitrary path | OPEN (backlog) | Validate under home dir |
| L-4 | LOW | Shallow project file validation | OPEN (backlog) | Add bounds checks |

**Actionable items requiring code changes: 0**
**Backlog items: 3 (L-2, L-3, L-4)**
**Already fixed: 12 of 14 findings (all HIGH and MEDIUM resolved)**

---

*Cross-referenced against `docs/SECURITY-AUDIT-2026-02-23.md` and commits `b2881a4` through `4ffba39`.*
