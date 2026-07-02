# Phase 0A: Skeleton

> Electron + React + Vite + Python sidecar + ZMQ heartbeat.
> **Goal:** Proof of life. Two processes communicating.
> **Sessions:** 2

---

## Acceptance Criteria

1. `npm start` launches an Electron window showing a React app
2. Electron spawns a Python sidecar process
3. Python binds a ZMQ REP socket, prints port to stdout
4. Electron connects to that port, sends PING every 1000ms
5. Python responds PONG with status
6. UI shows "Engine: Connected" with green indicator
7. Kill Python manually → UI shows "Engine: Restarting..." → watchdog respawns → "Engine: Connected"
8. `npm run build` produces a packaged app (Nuitka for Python, electron-builder for Electron)
9. All TypeScript compiles with zero errors
10. At least 5 unit tests pass (frontend + backend)

---

## Deliverables

### Frontend (`frontend/`)

**package.json dependencies:**
- electron, react, react-dom, typescript, vite, electron-vite
- zeromq (zeromq.js)
- zustand

**Files to create:**
```
frontend/
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
├── src/
│   ├── main/
│   │   ├── index.ts           # Create window, spawn Python
│   │   ├── python.ts          # Spawn Python process, read port from stdout
│   │   └── watchdog.ts        # PING/PONG loop, miss counter, restart
│   ├── preload/
│   │   └── index.ts           # contextBridge: expose engine status to renderer
│   └── renderer/
│       ├── index.html
│       ├── index.tsx
│       ├── App.tsx             # Minimal: show engine status
│       ├── stores/
│       │   └── engine.ts      # Zustand store: connected/disconnected/restarting
│       └── styles/
│           └── global.css     # Dark theme (#1a1a1a), JetBrains Mono
```

### Backend (`backend/`)

**pyproject.toml dependencies:**
- pyzmq, numpy

**Files to create:**
```
backend/
├── pyproject.toml
├── src/
│   ├── __init__.py
│   ├── main.py                # Entry: bind ZMQ, enter PONG loop
│   ├── zmq_server.py          # REP socket, command dispatch
│   └── watchdog.py            # PONG response builder
└── tests/
    ├── test_zmq_server.py
    └── conftest.py
```

### Nuitka Build Config

```
backend/
├── nuitka.config              # Or: build command in pyproject.toml
```

Test Nuitka compilation:
```bash
python -m nuitka --standalone --follow-imports src/main.py
```

Acceptance: compiled binary runs and responds to ZMQ PING.

---

## Implementation Notes

### Python Spawn
```typescript
// frontend/src/main/python.ts
import { spawn } from 'child_process';
import path from 'path';

export function spawnPython(): { process: ChildProcess; port: Promise<number> } {
  const pythonPath = isDev
    ? 'python3'  // Use system Python in dev
    : path.join(process.resourcesPath, 'backend', 'main');  // Nuitka binary in prod

  const proc = spawn(pythonPath, [
    isDev ? path.join(__dirname, '../../backend/src/main.py') : '',
  ]);

  const port = new Promise<number>((resolve) => {
    proc.stdout.on('data', (data) => {
      const match = data.toString().match(/ZMQ_PORT=(\d+)/);
      if (match) resolve(parseInt(match[1]));
    });
  });

  return { process: proc, port };
}
```

### Python Entry
```python
# backend/src/main.py
import zmq
import sys

def main():
    context = zmq.Context()
    socket = context.socket(zmq.REP)
    port = socket.bind_to_random_port("tcp://127.0.0.1")
    print(f"ZMQ_PORT={port}", flush=True)  # Electron reads this

    while True:
        message = socket.recv_json()
        if message.get("cmd") == "ping":
            socket.send_json({"id": message.get("id"), "status": "alive", "uptime_s": 0})
        elif message.get("cmd") == "shutdown":
            socket.send_json({"id": message.get("id"), "ok": True})
            break
        else:
            socket.send_json({"id": message.get("id"), "ok": False, "error": f"unknown: {message.get('cmd')}"})

    socket.close()
    context.term()

if __name__ == "__main__":
    main()
```

### Watchdog
```typescript
// frontend/src/main/watchdog.ts
const PING_INTERVAL = 1000;
const MAX_MISSES = 3;

let missCount = 0;

setInterval(async () => {
  try {
    const response = await zmqSend({ cmd: "ping", id: crypto.randomUUID() });
    missCount = 0;
    updateStatus("connected", response);
  } catch {
    missCount++;
    if (missCount >= MAX_MISSES) {
      await restartPython();
      missCount = 0;
    }
  }
}, PING_INTERVAL);
```

---

## Testing

### Frontend Tests (Vitest)
- `test_watchdog.ts`: Mock ZMQ, verify miss counting and restart trigger
- `test_python_spawn.ts`: Verify port parsing from stdout

### Backend Tests (pytest)
- `test_zmq_server.py`: Send PING, verify PONG format
- `test_unknown_command.py`: Send unknown cmd, verify error response
- `test_shutdown.py`: Send shutdown, verify clean exit

---

## NOT in Phase 0A

- No shared memory (Phase 0B)
- No video loading (Phase 1)
- No effects (Phase 1)
- No UI beyond engine status indicator
- No audio (Phase 2B)
