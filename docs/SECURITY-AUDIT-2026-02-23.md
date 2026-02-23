# Entropic v2 Challenger — Security Audit Report

**Date:** 2026-02-23
**Scope:** Full codebase red team review (backend + frontend + IPC + shared memory)
**Baseline:** docs/SECURITY.md (SEC-1 through SEC-17)
**Status:** Phase 1 build

---

## Summary

The codebase has a strong security posture for a desktop app at this stage. The SECURITY.md spec is thorough and most requirements are implemented. The auth token on ZMQ, `contextIsolation: true`, extension whitelisting, and param clamping are all properly in place. The findings below are real, actionable gaps — not theoretical concerns.

**Finding Count:** 2 HIGH, 5 MEDIUM, 4 LOW

---

## HIGH Severity

### H-1: Missing path validation in `apply_chain` command (path traversal)

**File:** `backend/src/zmq_server.py:195-222`
**Attack vector:** The `apply_chain` handler accepts a `path` parameter but does NOT call `validate_upload(path)` before passing it to `_get_reader()`. All other path-accepting handlers (`ingest`, `seek`, `render_frame`, `export_start`) correctly call `validate_upload()`. A compromised or buggy renderer could send an `apply_chain` command with a path to any file on disk (e.g., `/etc/passwd.mp4` — PyAV will error, but a symlink to a video at an arbitrary location would succeed).

**Proof:** Compare line 160 (`render_frame` calls `validate_upload`) with line 195 (`apply_chain` does NOT).

**Impact:** Path traversal — read arbitrary video files, bypass extension/symlink/size checks.

**Remediation:**
```python
# Add at the top of _handle_apply_chain, after path extraction:
errors = validate_upload(path)
if errors:
    return {"id": msg_id, "ok": False, "error": "; ".join(errors)}
```

---

### H-2: Shared memory file created with no explicit permissions (world-readable by default)

**File:** `backend/src/memory/writer.py:39`
**Attack vector:** `os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_TRUNC)` creates the mmap file at `~/.cache/entropic/frames` with the default umask permissions (typically 0644 — owner read/write, group/others read). Any local process running as any user can read frame data from this file.

**Impact:** Information disclosure — another user or malicious process on a shared machine could read video frame data in real time.

**Note:** SECURITY.md (AV-4) claims "mmap file has restrictive permissions (owner read/write only)" but this is not enforced in code.

**Remediation:**
```python
# Replace line 39:
self.fd = os.open(self.path, os.O_RDWR | os.O_CREAT | os.O_TRUNC, 0o600)
```
This sets owner-only read/write (rw-------), matching the SECURITY.md specification.

---

## MEDIUM Severity

### M-1: No ZMQ message size limit (potential memory bomb)

**File:** `backend/src/zmq_server.py:281,292`
**Attack vector:** `recv_json()` will parse arbitrarily large JSON messages. A local attacker connected to the ZMQ port (if they somehow obtain the token) could send a message containing a massive `chain` array with thousands of entries, or a `params` dict with enormous string values, consuming memory before the chain depth check runs.

**Impact:** Denial of service via memory exhaustion. SEC-9 RLIMIT_AS would eventually catch this, but a targeted message could eat 4GB before being rejected.

**Remediation:** Set `zmq.RCVBUF` and/or validate `len(raw_message)` before JSON parsing. A 1MB limit on incoming messages would be generous:
```python
self.socket.setsockopt(zmq.MAXMSGSIZE, 1_048_576)  # 1MB
self.ping_socket.setsockopt(zmq.MAXMSGSIZE, 4096)    # Pings are tiny
```

---

### M-2: Error messages leak internal paths via `str(e)`

**Files:**
- `backend/src/zmq_server.py:150,193,222,255`
- `backend/src/engine/export.py:123`
- `backend/src/video/ingest.py:11`

**Attack vector:** Exception messages are passed directly back to the renderer as `str(e)`. Python exceptions from PyAV, file operations, and numpy often include full filesystem paths, internal library details, and stack information.

**Impact:** Information disclosure — the renderer (and any XSS in the renderer) can learn internal file paths, library versions, and directory structure.

**Remediation:** Sanitize error messages before returning them over ZMQ. For user-facing errors, return only the error type and a generic description. Log the full exception server-side:
```python
except Exception as e:
    sentry_sdk.capture_exception(e)
    logger.exception("Error in handle_seek")  # Full details in log
    return {"id": msg_id, "ok": False, "error": f"Operation failed: {type(e).__name__}"}
```

---

### M-3: No CSP (Content-Security-Policy) headers on the Electron window

**File:** `frontend/src/main/index.ts:14-26`
**Attack vector:** The BrowserWindow is created without any CSP. SECURITY.md (AV-7) states "CSP headers block inline scripts" but this is not implemented. If an attacker achieves XSS in the renderer (e.g., via a crafted project name rendered without escaping), they can load arbitrary scripts.

**Impact:** Renderer compromise — without CSP, XSS leads to full script execution in the renderer context.

**Remediation:** Add CSP via `session.webRequest.onHeadersReceived`:
```typescript
win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'"],
    },
  })
})
```

---

### M-4: `sandbox` not enabled on BrowserWindow

**File:** `frontend/src/main/index.ts:20-24`
**Attack vector:** The `webPreferences` set `contextIsolation: true` and `nodeIntegration: false` (good), but do not set `sandbox: true`. While `contextIsolation` prevents the renderer from accessing Node.js APIs directly, sandboxing adds an OS-level process isolation layer that further limits what a compromised renderer can do.

**Impact:** Reduced defense in depth. A Chromium renderer exploit without sandbox has full process-level access to the file system and network.

**Remediation:**
```typescript
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,  // Add this
}
```
Note: Verify the preload script still works with sandbox enabled (it should, since it only uses `contextBridge` and `ipcRenderer`).

---

### M-5: Unbounded VideoReader cache in ZMQ server

**File:** `backend/src/zmq_server.py:267-270`
**Attack vector:** `_get_reader()` caches `VideoReader` instances in `self.readers` dict keyed by path. There is no eviction policy. Each reader holds an open PyAV container (file handle + decoded state). If the frontend sends commands with many different paths over time, the server accumulates open file handles and memory indefinitely.

**Impact:** File handle exhaustion and gradual memory leak. On macOS, the default open file limit is 256 — after ~250 different videos, the process will fail to open new files.

**Remediation:** Add an LRU eviction policy or cap the reader cache:
```python
MAX_READERS = 8

def _get_reader(self, path: str) -> VideoReader:
    if path not in self.readers:
        if len(self.readers) >= MAX_READERS:
            oldest = next(iter(self.readers))
            self.readers[oldest].close()
            del self.readers[oldest]
        self.readers[path] = VideoReader(path)
    return self.readers[path]
```

---

## LOW Severity

### L-1: Undeclared Python dependencies (scipy, sentry-sdk)

**File:** `backend/pyproject.toml`
**Issue:** `scipy` is imported by `effects/fx/blur.py` and `sentry-sdk` is imported by `main.py`, but neither is listed in `pyproject.toml` dependencies. This means a clean install from `pyproject.toml` would fail at runtime.

**Impact:** Build/deploy failure, not a security vulnerability directly. However, undeclared transitive dependencies can lead to version drift and unexpected behavior.

**Remediation:** Add to `[project] dependencies`:
```toml
dependencies = [
    "pyzmq>=26.0",
    "numpy>=2.0",
    "av>=14.0",
    "Pillow>=11.0",
    "scipy>=1.14",
    "sentry-sdk>=2.0",
]
```

---

### L-2: Token printed to stdout (visible in process table)

**File:** `backend/src/main.py:38`
**Issue:** `print(f"ZMQ_TOKEN={server.token}", flush=True)` outputs the auth token to stdout. On multi-user systems, other users may be able to see process stdout via `/proc/<pid>/fd/1` (Linux) or `lsof` (macOS).

**Impact:** Low — the token is a UUIDv4 and the ZMQ port is random, so both pieces are needed. But in a multi-user environment, this could be combined with port scanning to connect.

**Remediation:** Consider passing the token via a temporary file with restricted permissions instead of stdout, or ensure the Python process's stdout pipe is not world-readable.

---

### L-3: `ENTROPIC_SHM_PATH` environment variable allows arbitrary mmap path

**File:** `backend/src/memory/writer.py:18-20`
**Issue:** The shared memory path can be overridden via `ENTROPIC_SHM_PATH` environment variable. If an attacker can set environment variables (e.g., via `.env` file injection or launcher manipulation), they could point this to a sensitive location like `/etc/something`.

**Impact:** Very low — the file is created with O_CREAT|O_TRUNC, so it would overwrite an existing file, but `os.ftruncate` would fail on most system files. The primary risk is writing frame data to an unexpected location.

**Remediation:** Validate that the resolved path is under a safe prefix:
```python
def default_shm_path() -> str:
    path = os.environ.get("ENTROPIC_SHM_PATH", str(Path.home() / ".cache" / "entropic" / "frames"))
    resolved = str(Path(path).resolve())
    home = str(Path.home())
    if not resolved.startswith(home):
        raise ValueError(f"ENTROPIC_SHM_PATH must be under home directory: {path}")
    return resolved
```

---

### L-4: Project file validation is shallow (schema.py)

**File:** `backend/src/project/schema.py:56-86`
**Issue:** The `validate()` function checks for required keys and basic types, but does not validate:
- `assets` dict values (asset paths could contain traversal)
- `settings.resolution` bounds (could be [999999, 999999] causing OOM on numpy array allocation)
- `settings.frameRate` bounds (0 or negative would cause division-by-zero)
- `settings.seed` type (non-integer would cause hash errors)
- `timeline.tracks` contents (no track-level validation)

**Impact:** Crafted `.glitch` files could cause crashes or resource exhaustion when their values are used downstream.

**Remediation:** Add bounds validation for numeric settings in `validate()`:
```python
res = settings.get("resolution", [0, 0])
if not (isinstance(res, list) and len(res) == 2
        and 64 <= res[0] <= 7680 and 64 <= res[1] <= 4320):
    errors.append("resolution must be [64-7680, 64-4320]")

fps = settings.get("frameRate", 0)
if not (isinstance(fps, (int, float)) and 1 <= fps <= 120):
    errors.append("frameRate must be 1-120")
```

---

## Positive Findings (Already Secure)

These areas were audited and found to be correctly implemented:

| Area | Finding |
|------|---------|
| **SEC-1: nodeIntegration** | `false` confirmed at `frontend/src/main/index.ts:23` |
| **SEC-2: Preload whitelist** | Only 5 named functions exposed via `contextBridge`. No raw `ipcRenderer` leak. No `send()` exposed (only `invoke` and `on`). |
| **SEC-3: ZMQ command validation** | Unknown commands rejected with error at `zmq_server.py:93`. Auth token checked on all commands. |
| **SEC-5: Upload validation** | Extension whitelist, symlink rejection, size limit, filename safety all implemented in `security.py`. Applied to ingest, seek, render_frame, export. |
| **SEC-7: Chain depth** | Validated in both `zmq_server.py` (before processing) and `pipeline.py` (defense in depth). |
| **SEC-9: Resource limits** | RLIMIT_AS set to 4GB in `main.py`. Graceful fallback on Windows. |
| **SEC-15: No shell commands** | Grep for `eval`, `exec`, `subprocess`, `shell=True`, `pickle`, `yaml.load` returned zero hits across entire backend. |
| **Auth token** | UUIDv4 generated at startup, validated on every message including pings. Token shared via stdout pipe (only readable by parent Electron process). |
| **Navigation blocking** | `will-navigate` and `will-download` events prevented at `index.ts:29-30`. |
| **Effect parameter clamping** | Every effect function clamps its params to declared min/max ranges (verified in all 10 effects). |
| **No dangerous patterns** | Zero instances of `eval()`, `exec()`, `Function()`, `innerHTML`, `dangerouslySetInnerHTML`, `pickle`, `yaml.load`, `subprocess.call(shell=True)` in the entire codebase. |
| **Sentry DSN** | Read from environment variable, not hardcoded. No `.env` files committed. |
| **Effect purity** | All effects are stateless pure functions with no filesystem access, no network access, no module-level mutable state. |

---

## Recommendations Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| Fix now | H-1: Add `validate_upload` to `apply_chain` | 5 min |
| Fix now | H-2: Set `0o600` on mmap file creation | 1 min |
| Next sprint | M-1: Set ZMQ MAXMSGSIZE | 5 min |
| Next sprint | M-2: Sanitize error messages | 30 min |
| Next sprint | M-3: Add CSP headers | 15 min |
| Next sprint | M-4: Enable sandbox | 5 min + test |
| Next sprint | M-5: Cap VideoReader cache | 10 min |
| Backlog | L-1: Declare scipy, sentry-sdk deps | 2 min |
| Backlog | L-2: Token via file instead of stdout | 30 min |
| Backlog | L-3: Validate SHM path prefix | 5 min |
| Backlog | L-4: Deep project file validation | 1 hr |

---

*Audit performed against commit at 2026-02-23. Cross-referenced with docs/SECURITY.md.*
