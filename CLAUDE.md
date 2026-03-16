# Entropic v2 Challenger

## Diagnostics — Crash & Error Data Locations

When the user reports a crash, error, freeze, or unexpected behavior:

1. **Read crash dumps** (newest first):
   `~/.entropic/crash_reports/crash_*.json`
   Fields: timestamp, exception_type, exception_message, traceback, python_version, platform

2. **Read Python sidecar log** (last 100 lines):
   `~/.entropic/logs/sidecar.log`
   JSON lines: timestamp, level, logger, message, exception

3. **Read Electron main log** (last 100 lines):
   `~/.entropic/logs/electron-main.log`
   JSON lines: timestamp, level, message, data

4. **Read fault log** (C-level crashes — SIGSEGV, SIGABRT):
   `~/.entropic/logs/sidecar_fault.log`

5. **Check for autosave** (indicates unclean shutdown):
   `<userData>/.autosave.glitch`

Always check these BEFORE asking the user to reproduce. The crash data is the reproduction.

## Stack & Architecture

- Electron 40 + React 19 + Vite + TypeScript frontend
- Python 3.14 sidecar (ZeroMQ REQ/REP, auto-spawn, token auth)
- Frame pipeline: decode -> apply_chain -> encode_mjpeg -> base64 -> <img>
- Watchdog: 1s heartbeat, 3-miss auto-restart
- State: 8 Zustand stores (engine, audio, project, effects, timeline, undo, toast, layout)
- CSS: BEM vanilla, dark theme (#1a1a1a, #4ade80, #ef4444, JetBrains Mono)
- Test pyramid: Vitest (component) + Playwright _electron (E2E) + pytest (backend)

## Test Commands

- Backend: `cd backend && python -m pytest -x -n auto --tb=short`
- Frontend unit: `cd frontend && npx vitest run`
- Frontend E2E: `cd frontend && npx playwright test`
- Single backend file: `python -m pytest tests/test_<name>.py -x --tb=short`

## Conventions

- Effects are pure functions: `(frame, params, state_in) -> (result, state_out)`
- IPC: camelCase in TS <-> snake_case in Python (serialization layer handles conversion)
- BEM CSS classes: `.component__element--modifier`
- Commit scopes: effects, color, timeline, zmq, video, audio, export, perf, automation, observability

## Toast Conventions

- Toast store: `stores/toast.ts` — rate-limited (2s dedup by `source`), auto-dismiss (info 4s, warning 6s, error 8s, state manual-only)
- Max 5 visible, oldest non-persistent evicted on overflow
- XSS: toast messages are rendered as text nodes (React auto-escapes), never `dangerouslySetInnerHTML`
- Source field required for error toasts from IPC to enable rate limiting

## Layout & Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+B | Toggle sidebar collapse |
| F | Toggle focus mode (collapse/expand both panels) |
| ▼ button | Toggle timeline collapse |
| Drag resize handle | Adjust timeline height (persisted to localStorage) |

CSS custom properties (`:root` in `global.css`):
- `--sidebar-width`, `--sidebar-width-collapsed`, `--statusbar-height`, `--params-max-height`
- `--timeline-default-height`, `--timeline-min-height`, `--panel-collapsed-height`, `--resize-handle-height`

## IPC Trace Fields

- `_token`: Auth token (injected by relay, validated by Python)
- `_ts_send`: Timestamp (ms) when relay sent the command (for roundtrip measurement)
- `_render_seq`: Monotonic sequence number for stale-frame detection (not yet activated)
- Python logs all non-ping commands: `IPC handled: id=... cmd=... elapsed_ms=... ok=...`
