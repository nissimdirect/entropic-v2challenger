# Entropic v2 Challenger — Security Requirements

> Rebuilt for Challenger architecture: Electron + ZMQ + mmap + PyAV + Nuitka.
> Sources: entropic-2/SECURITY.md (remapped), Electron security best practices, v2 spec.
> Attack surface is fundamentally different from v1 (web app) — desktop app, local IPC, no HTTP.

---

## Architecture Security Profile

| Component | Attack Surface | Trust Level |
|-----------|---------------|-------------|
| Electron shell | Chromium renderer, contextBridge, preload scripts | UNTRUSTED renderer, TRUSTED main process |
| React frontend | User input (params, file paths), clipboard, drag-drop | UNTRUSTED — all input validated |
| ZMQ channel | Local TCP (127.0.0.1), JSON messages | TRUSTED transport, UNTRUSTED message content |
| mmap shared memory | Local memory-mapped file, ring buffer | TRUSTED (same-user process) |
| Python sidecar | PyAV (FFmpeg), numpy, effect processing | SEMI-TRUSTED — resource-limited |
| Nuitka binary | Compiled Python, bundled deps | TRUSTED (we build it) |
| Project files (.glitch) | JSON on disk | UNTRUSTED — user-editable |
| Preset files (.glitchpreset) | JSON on disk | UNTRUSTED — shareable |

---

## Security Requirements

| # | Requirement | Severity | Implementation | Phase |
|---|------------|----------|----------------|-------|
| SEC-1 | Electron: `nodeIntegration: false`, `contextIsolation: true` | CRITICAL | Default Electron security. Renderer cannot access Node.js APIs. All IPC through contextBridge. | 0A |
| SEC-2 | Electron: preload whitelist | CRITICAL | contextBridge exposes ONLY named functions (engine status, send command, receive frame). No raw `ipcRenderer`. | 0A |
| SEC-3 | ZMQ message validation | HIGH | Python validates every incoming JSON message against expected schema. Unknown commands rejected. Malformed JSON → error response, not crash. | 0A |
| SEC-4 | Param bounds enforcement (both sides) | HIGH | TypeScript validates before send (Zustand middleware). Python validates before processing (PARAMS schema min/max). Double validation — neither side trusts the other. | 0B |
| SEC-5 | Upload: 500MB max, extension whitelist, filename sanitize | HIGH | Whitelist: .mp4, .mov, .avi, .mkv, .webm, .m4v, .wmv, .gif, .png, .jpg. Filename: strip path separators, limit to alphanumeric + `-_`. Reject symlinks. | 1 |
| SEC-6 | Frame cap: 3,000 frames (100s @ 30fps) | HIGH | Python rejects ingest beyond cap. Frontend shows duration warning before ingest. | 1 |
| SEC-7 | Effect chain depth: 10 max | HIGH | TypeScript enforces in Zustand store. Python also enforces in render pipeline. | 1 |
| SEC-8 | NaN/Inf defense on all numeric params | HIGH | `isFinite()` check in TypeScript. `np.isfinite()` check in Python. NaN/Inf → replace with param default. | 0B |
| SEC-9 | PyAV resource limits | HIGH | Python process: `resource.setrlimit(RLIMIT_AS, 4GB)`. PyAV decode timeout: 30s per file. Kill + restart via watchdog if exceeded. | 1 |
| SEC-10 | Export: min 64px, max 7680px per dimension | MEDIUM | Validated in both TypeScript (before command) and Python (before PyAV encode). | 11 |
| SEC-11 | mmap buffer bounds | MEDIUM | C++ native module: fixed-size ring buffer. Write index wraps with modulo. Read index validated. No out-of-bounds possible by construction. | 0B |
| SEC-12 | Project file validation | MEDIUM | JSON schema validation on load. Reject unknown keys. Validate all UUIDs, paths, numeric ranges. No `eval()` on any loaded data. | 4 |
| SEC-13 | Preset file validation | MEDIUM | Same as SEC-12. Presets are JSON only (no YAML). Shared presets from others are validated identically. | 10 |
| SEC-14 | MIDI CC clamp 0-127 | MEDIUM | All MIDI values clamped before processing. Invalid MIDI messages dropped. | 9 |
| SEC-15 | No shell commands | MEDIUM | Zero `subprocess.run(shell=True)` calls. PyAV uses library API (no FFmpeg CLI). Nuitka build uses library API. | All |
| SEC-16 | Temp file cleanup | LOW | `atexit.register(cleanup)` + `signal.signal(SIGTERM/SIGINT, cleanup)` in Python. Electron `app.on('before-quit', cleanup)`. | 0A |
| SEC-17 | Auto-update signature verification | LOW | electron-updater verifies GitHub Release signatures. No unsigned updates. | 11 |

---

## Attack Vectors

### AV-1: Crafted Video Exploiting PyAV/FFmpeg
**Risk:** Malformed MP4/H.264 can trigger FFmpeg buffer overflows (1000+ FFmpeg CVEs). PyAV wraps libav directly — inherits all vulnerabilities.
**Mitigation:** Python process resource limit (SEC-9: 4GB RAM, 30s timeout). Watchdog kills runaway process. React SSOT means no data loss on crash. Keep PyAV updated (tracks FFmpeg security releases).

### AV-2: Malicious Project/Preset Files
**Risk:** User opens a shared `.glitch` file with crafted data — extreme param values, path traversal in asset paths, oversized arrays.
**Mitigation:** JSON schema validation (SEC-12, SEC-13). Asset paths resolved and checked against project directory (no `../`). Param values clamped to schema bounds. Array sizes capped.

### AV-3: ZMQ Message Injection
**Risk:** If another local process connects to the ZMQ port, it could send commands.
**Mitigation:** ZMQ binds to `127.0.0.1` (localhost only). Random port (not predictable). Could add HMAC auth token (shared at spawn time) if needed — low priority since single-user desktop app.

### AV-4: mmap Buffer Corruption
**Risk:** Malicious write to shared memory region from another process.
**Mitigation:** mmap file has restrictive permissions (owner read/write only). Ring buffer has fixed slot sizes — oversize writes are impossible by construction. Reader validates MJPEG header before decoding.

### AV-5: Memory Exhaustion via Effect Params
**Risk:** Extreme params (e.g., huge kernel sizes, massive iteration counts) cause OOM in Python.
**Mitigation:** PARAMS schema enforces max values (SEC-4). Double-validated in TypeScript and Python. Python process resource limit (SEC-9). Examples: `grid_size ≤ 4096`, `kernel ≤ 256`, `iterations ≤ 50`.

### AV-6: Path Traversal in Export
**Risk:** Controlled export path writes outside intended directory.
**Mitigation:** Export path validated: `Path(output).resolve()` must be under user-chosen directory. No path separators in filenames. Reject symlinks.

### AV-7: Electron Renderer Compromise
**Risk:** XSS or compromised dependency in React app gains renderer process access.
**Mitigation:** `contextIsolation: true` + `nodeIntegration: false` (SEC-1). Renderer cannot access Node.js, filesystem, or child_process. All privileged operations go through contextBridge whitelist (SEC-2). CSP headers block inline scripts.

### AV-8: Dependency Supply Chain
**Risk:** Compromised npm/PyPI package in build dependencies.
**Mitigation:** Lock files (`package-lock.json`, `pyproject.toml` with pinned versions). Minimal dependency count. Review `npm audit` and `pip audit` before releases. Nuitka binary bundles Python deps (no runtime pip).

### AV-9: Temp File / Process Leaks
**Risk:** Force-quit leaves orphaned Python process or temp files.
**Mitigation:** Electron `app.on('before-quit')` kills Python. Python `atexit` + signal handlers clean up. Watchdog detects Electron death (ZMQ disconnect) and self-terminates. Temp files use `TemporaryDirectory` context manager.

### AV-10: MIDI Input Overflow
**Risk:** Malicious MIDI device sends values > 127 or malformed SysEx.
**Mitigation:** Clamp all MIDI CC to 0-127 (SEC-14). Drop malformed messages. MIDI processing in Python behind ZMQ — can't crash Electron.

---

## Security Checklist Per Phase

- [ ] **Phase 0A (Skeleton):** SEC-1 (nodeIntegration), SEC-2 (preload whitelist), SEC-3 (ZMQ validation), SEC-16 (cleanup handlers)
- [ ] **Phase 0B (Validation):** SEC-4 (param bounds), SEC-8 (NaN/Inf), SEC-11 (mmap bounds)
- [ ] **Phase 1 (Core Pipeline):** SEC-5 (upload limits), SEC-6 (frame cap), SEC-7 (chain depth), SEC-9 (PyAV limits), SEC-15 (no shell)
- [ ] **Phase 2A (Param UX):** Verify double-validation working (TS + Python)
- [ ] **Phase 2B (Audio):** Audio decode resource limits (same as SEC-9)
- [ ] **Phase 3 (Color Suite):** No new security surface
- [ ] **Phase 4 (Timeline):** SEC-12 (project file validation)
- [ ] **Phase 5-8:** No new security surface
- [ ] **Phase 9 (Perform + MIDI):** SEC-14 (MIDI clamp)
- [ ] **Phase 10 (Library):** SEC-13 (preset file validation)
- [ ] **Phase 11 (Export + Polish):** SEC-10 (export dimensions), SEC-17 (auto-update signatures)

---

## What Changed from v1 Security

| v1 (FastAPI + PyWebView) | Challenger (Electron + ZMQ + mmap) | Better/Worse |
|--------------------------|-----------------------------------|-------------|
| HTTP API (rate-limitable, but network-exposed) | ZMQ local IPC (not network-exposed) | BETTER — no network attack surface |
| PyWebView JS bridge (raw Python exposure) | Electron contextBridge (whitelist only) | BETTER — explicit API surface |
| FFmpeg subprocess (shell=False, but still subprocess) | PyAV library calls (no process spawning) | BETTER — no subprocess attack vector |
| Data URLs for preview (size limits needed) | mmap for preview (fixed buffer, no URLs) | BETTER — no data URL parsing |
| Single Python process (crash = data loss) | Watchdog restart + React SSOT (crash = no data loss) | BETTER — resilient |
| Global state (session cross-contamination) | React SSOT + pure functions (no shared state) | BETTER — no contamination possible |
| YAML possible for presets | JSON only (no YAML deserialization RCE) | BETTER — eliminated attack vector |
