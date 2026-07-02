# Research R2: Electron + node-gyp + Apple Silicon Gotchas

> **Purpose:** De-risk Phase 0B native module build. Identify every gotcha before writing C++ code.
> **Date:** 2026-02-22
> **Status:** COMPLETE
> **Sources:** 4 parallel research agents (best-practices, framework-docs, kb-search, v2-docs exploration), 30+ web sources

---

## Executive Summary

Building a C++ native Node.js addon (via node-gyp) for Electron 40 on Apple Silicon is well-supported but has **23 specific gotchas** that will silently break the build or cause runtime crashes if not addressed. This document catalogs all of them with exact fixes. CTO review and Red Team audit findings are integrated.

**The 3 most critical findings:**
1. **Apple Silicon uses 16KB memory pages** (not 4KB like Intel) — mmap offsets must be 16KB-aligned or you get `EINVAL`
2. **Must use `NODE_API_MODULE()` not `NODE_MODULE()`** — Electron runs multiple Node contexts; the old macro crashes
3. **MACOSX_DEPLOYMENT_TARGET must be >= 12.0** — Electron 40 requires macOS 12 Monterey minimum (not 10.13 as in current binding.gyp draft)

---

## 1. Version Compatibility Matrix

| Component | Version | Notes |
|-----------|---------|-------|
| **Electron** | 40.6.0 | Chromium 144, released Jan 2026 |
| **Node.js (bundled)** | 24.11.1 | Shipped inside Electron 40 |
| **NODE_MODULE_VERSION (ABI)** | 143 | Must match when compiling native modules |
| **N-API version** | Up to 9 | Use `NAPI_VERSION=8` (stable, widely supported) |
| **node-addon-api** | 8.6.0 | Latest C++ wrapper (Feb 2026) |
| **node-gyp** | >= 10.x | Required for Python 3.12+ (distutils removed) |
| **@electron/rebuild** | >= 4.0.0 | Handles Electron header download |
| **Xcode CLT** | >= 14.0 | For Apple Silicon compilation |
| **macOS minimum** | 12.0 (Monterey) | Electron 40 requirement |
| **Python (for node-gyp)** | 3.12+ | But distutils removed — see Gotcha #12 |

---

## 2. Recommended Abstraction: node-addon-api (N-API C++ Wrapper)

**Use `node-addon-api`. Do NOT use NAN or raw V8.**

Why:
- **ABI stability:** N-API addons don't need recompilation across Node.js/Electron versions
- **NAN** requires rebuilding for every `NODE_MODULE_VERSION` — breaks on every Electron upgrade
- **node-addon-api** is header-only, zero runtime overhead, C++ convenience (RAII, classes, exceptions)
- Works across runtimes (Node.js, Electron, etc.)

**Critical Electron detail:** Use `NODE_API_MODULE()` macro, NOT `NODE_MODULE()`. Electron runs multiple Node.js instances in one process. The old `NODE_MODULE()` is not context-aware and will crash.

```cpp
#include <napi.h>

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("open", Napi::Function::New(env, Open));
  exports.Set("readLatestFrame", Napi::Function::New(env, ReadLatestFrame));
  exports.Set("getWriteIndex", Napi::Function::New(env, GetWriteIndex));
  exports.Set("close", Napi::Function::New(env, Close));
  return exports;
}

// CORRECT: Context-aware registration for Electron
NODE_API_MODULE(shared_memory, Init)

// WRONG: Will crash in Electron multi-context
// NODE_MODULE(shared_memory, Init)
```

---

## 3. binding.gyp Configuration

### ARM64-Only (Recommended — we only target Apple Silicon)

```json
{
  "targets": [
    {
      "target_name": "shared_memory",
      "sources": ["src/shared_memory.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "12.0",
            "GCC_ENABLE_CPP_EXCEPTIONS": "NO"
          }
        }]
      ]
    }
  ]
}
```

**Key differences from Phase 0B draft:**
- `MACOSX_DEPLOYMENT_TARGET`: **"12.0"** not "10.13" — Electron 40 requires Monterey minimum
- Added `"dependencies"` line for node-addon-api `.gyp` file (auto-configures include paths)
- Added `NAPI_VERSION=8` define (explicit, avoids ambiguity)
- `NAPI_DISABLE_CPP_EXCEPTIONS` — avoids C++ exception overhead; use `Napi::Error::New().ThrowAsJavaScriptException()` for error reporting instead

### Universal Binary (if ever needed for Intel support)

```json
"xcode_settings": {
  "CLANG_CXX_LIBRARY": "libc++",
  "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
  "MACOSX_DEPLOYMENT_TARGET": "12.0",
  "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
  "OTHER_CFLAGS": ["-arch x86_64", "-arch arm64"],
  "OTHER_LDFLAGS": ["-arch x86_64", "-arch arm64"]
}
```

**Warning:** Universal .node only works if Electron is also universal. Architecture mismatch = `mach-o, but wrong architecture` at dlopen.

---

## 4. Building Against Electron Headers

The native module MUST be compiled against Electron's Node.js headers, not system Node headers.

### Recommended: @electron/rebuild

```json
{
  "scripts": {
    "postinstall": "electron-rebuild",
    "rebuild:native": "electron-rebuild -f -w shared_memory"
  },
  "devDependencies": {
    "@electron/rebuild": "^4.0.0"
  }
}
```

`-w shared_memory` targets only our module (faster). `-f` forces rebuild.

### Manual (for debugging)

```bash
ELECTRON_VERSION=$(node -p "require('electron/package.json').version")
HOME=~/.electron-gyp node-gyp rebuild \
  --target=$ELECTRON_VERSION \
  --arch=arm64 \
  --dist-url=https://electronjs.org/headers \
  --runtime=electron
```

### Known 2025-2026 Issue: @electron/rebuild ESM/CJS Mismatch

`@electron/rebuild` uses CJS but `node-abi` ships as ESM → `ERR_REQUIRE_ESM`. Fix:
```json
{
  "overrides": {
    "node-abi": "3.x"
  }
}
```
Or use `forceABI: 143` in electron-builder config.

---

## 5. Apple Silicon mmap Gotchas (CRITICAL)

### 16KB Page Size

**Apple Silicon uses 16KB memory pages, not 4KB like Intel.** This is the #1 portability trap.

**Impact on our ring buffer:**
- `mmap()` offsets MUST be aligned to 16KB (16384 bytes)
- Our design maps the entire file as one region and uses internal offsets → **this is safe** because the base offset is 0
- If we ever use partial mappings (e.g., mapping individual slots), offsets MUST be 16KB-aligned

**Always query page size at runtime:**
```cpp
#include <unistd.h>
long page_size = sysconf(_SC_PAGESIZE);  // Returns 16384 on Apple Silicon
```

**Our current design is safe because:**
- We do one `mmap()` call for the entire file (offset = 0)
- All slot access is via pointer arithmetic within that single mapping
- 4MB slot sizes are multiples of 16KB ✓
- 64-byte header is NOT page-aligned, but it doesn't need to be since it's within the same mapping

### Atomic Operations on ARM64

ARM64 guarantees that aligned u32 writes are atomic. Our `write_index` at offset 0 (4-byte aligned) is safe.

For explicit atomics in C++:
```cpp
uint32_t write_index = __atomic_load_n(
    (uint32_t*)(buffer + 0), __ATOMIC_ACQUIRE
);
```

**WARNING: Python `struct.pack_into()` does NOT issue a memory barrier.** While the 4-byte write itself is atomic on ARM64, ARM's weak memory ordering means frame data writes could be reordered AFTER the `write_index` update. The C++ reader could see a new `write_index` but read stale/partial frame data.

**Mitigation (pick one):**
- **Generation counter:** Write index goes odd→write data→even. Reader spins on even value. Simple, robust.
- **Python `ctypes` with explicit barrier:** Use `ctypes.c_uint32` with `__atomic_store` semantics.
- **`msync()` before index update:** Forces frame data to be visible before the index.

### File-Backed mmap vs shm_open

**Use file-backed mmap. Not `shm_open`.**

- macOS has a **restrictive System V shared memory limit** (`kern.sysv.shmmax` defaults to 4MB) — POSIX `shm_open` has a higher limit but is less reliable cross-platform
- File-backed mmap at `~/.cache/entropic/frames` has no such limit
- Easier to debug (`ls -la`, `hexdump`)
- Both Python `mmap.mmap()` and C `mmap()` work identically with file-backed mapping

**Note:** The Phase 0B spec uses `/tmp/entropic-frames`. This works but has security issues:
- `/tmp` files default to `0644` (world-readable) unless you explicitly pass `0o600` to `os.open()`
- Predictable path allows local attackers to pre-create the file (symlink attack)
- **Recommended:** Use `~/.cache/entropic/frames-{uuid}` with `0o600` mode. Create the directory with `0o700` permissions.

**Also note:** IPC-PROTOCOL.md references `/dev/shm/entropic-frames` which does NOT exist on macOS (Linux-only). This path must be corrected in that document.

---

## 6. V8 BackingStore Crash Warning

If you repeatedly wrap the same mmap'd memory address into `Napi::Buffer`, V8 crashes with:
```
Check failed: result.second  (in GlobalBackingStoreRegistry::Register)
```

V8 tracks backing stores by address and rejects duplicates.

**Solutions (pick one):**
1. **`Napi::Buffer::Copy()`** — safest, copies data. ~2ms (estimated) for 800KB MJPEG frame at 30fps on Apple Silicon. Profile at 4K resolution — 3-4MB frames may push this to ~4ms. Acceptable for our use case at 1080p; needs validation at 4K.
2. **Create Buffer once, cache via `Napi::Reference`** — zero-copy but complex lifetime management
3. **`napi_detach_arraybuffer`** after each use (N-API >= 7) — advanced, reclaims the backing store

**Recommendation for Phase 0B:** Start with `Napi::Buffer::Copy()`. It's simple and 2ms per frame is well within our 33ms budget. Optimize to zero-copy later if profiling shows it matters.

---

## 7. electron-vite 5 Integration

### Native Modules as External Dependencies

Our `electron.vite.config.ts` already has `externalizeDeps: true`. This is correct — Vite/Rollup leaves `.node` binaries alone and they load at runtime via `require()`.

For a local native module (not in node_modules), explicitly externalize:
```typescript
export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        external: ['shared-memory']  // Our native module
      }
    }
  },
  // ...
})
```

### Build Pipeline Order

```
1. npm install                    (installs node-addon-api)
2. node-gyp rebuild               (compiles C++ to .node)
3. electron-rebuild               (relinks against Electron headers)
4. electron-vite build            (bundles JS/TS, leaves .node external)
5. electron-builder               (packages into .app)
```

### HMR Does NOT Work with .node Files

Once a `.node` file is `require()`'d, the OS caches the dlopen handle. Deleting from `require.cache` does NOT unload it.

**Workaround:** Rely on electron-vite's automatic main process restart. Our native module is stateless (all state lives in mmap, owned by Python) — restarts are fast and lossless.

---

## 8. Loading the Native Module in Electron

Native modules only work in the **main process** or unsandboxed renderers. The default Electron sandbox blocks `dlopen` in renderers.

**Our architecture is correct:** Load in main process → expose via `contextBridge` → renderer consumes.

```typescript
// src/main/shared-memory.ts
import { createRequire } from 'module'
import path from 'path'
import { app } from 'electron'

const require = createRequire(import.meta.url)

let modulePath: string
if (app.isPackaged) {
  modulePath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'native', 'build', 'Release',
    'shared_memory.node'
  )
} else {
  // NOTE: __dirname is NOT defined in ESM. electron-vite provides a polyfill,
  // but its behavior may differ from CJS __dirname. If issues arise, use:
  //   import { fileURLToPath } from 'url'
  //   const __dirname = path.dirname(fileURLToPath(import.meta.url))
  modulePath = path.join(
    __dirname, '..', '..', 'native', 'build', 'Release',
    'shared_memory.node'
  )
}

interface SharedMemory {
  open(path: string): boolean
  readLatestFrame(): Buffer | null
  getWriteIndex(): number
  close(): boolean
}

// Wrap in try/catch — if native module fails, Electron should still launch
let bridge: SharedMemory | null = null
try {
  bridge = require(modulePath)
} catch (err) {
  console.error('Failed to load native shared_memory module:', err)
  // Fall back to ZMQ-based frame transport (slower but functional)
}
export default bridge
```

---

## 9. Packaging and Code Signing

### electron-builder Config

```json
{
  "build": {
    "mac": {
      "target": [{ "target": "dmg", "arch": ["arm64"] }],
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    },
    "asarUnpack": ["**/*.node"],
    "extraResources": [
      { "from": "sidecar/dist/entropic-engine", "to": "sidecar/entropic-engine" }
    ]
  }
}
```

### Required Entitlements (entitlements.mac.plist)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

**`disable-library-validation` is essential** — without it, macOS refuses to dlopen your `.node` file because it's not signed by Apple.

### asarUnpack

electron-builder auto-detects `.node` files and unpacks them from the asar archive (because dlopen can't load from inside an asar). Set `asarUnpack: ["**/*.node"]` explicitly for safety.

---

## 10. Known Failure Modes

### "mach-o, but wrong architecture"

**Cause:** .node compiled for x86_64 but Electron runs ARM64 (or vice versa).

**Diagnosis:**
```bash
file build/Release/shared_memory.node
# Must output: Mach-O 64-bit bundle arm64

node -p "process.arch"              # Must be arm64
npx electron -e "console.log(process.arch)"  # Must be arm64
```

**Root cause:** nvm/shell running under Rosetta → x86_64 Node → x86_64 .node.

### NODE_MODULE_VERSION Mismatch

```
The module was compiled against a different Node.js version
using NODE_MODULE_VERSION X. This version requires NODE_MODULE_VERSION Y.
```

**Fix:** `npx electron-rebuild -f`

If @electron/rebuild can't detect ABI: `npx electron -e "console.log(process.versions.modules)"` → use as `forceABI`.

### dlopen Failures

Causes:
1. Wrong ABI → run `electron-rebuild`
2. .node still inside asar → add `asarUnpack: ["**/*.node"]`
3. Missing entitlements → add `disable-library-validation` to plist
4. Path resolution wrong after packaging → use `process.resourcesPath` + `app.asar.unpacked/`

### node-gyp on macOS Sequoia (15.x) / Python 3.14

Python 3.12+ removed `distutils`. node-gyp < 10 depends on it.

**Fix:** `npm install -g node-gyp@latest` (must be >= 10).

---

## 11. Corrections to Phase 0B Spec

| Item | Current Spec | Should Be | Why |
|------|-------------|-----------|-----|
| `MACOSX_DEPLOYMENT_TARGET` | `"10.13"` | `"12.0"` | Electron 40 requires macOS 12 Monterey minimum |
| Module registration | Not specified | `NODE_API_MODULE()` | `NODE_MODULE()` crashes in Electron multi-context |
| `NAPI_VERSION` define | Not specified | `"NAPI_VERSION=8"` | Explicit is safer; Electron 40 supports up to N-API 9 |
| mmap path | `/tmp/entropic-frames` | Consider `~/.cache/entropic/frames` | User-scoped, more secure (0600 permissions natural) |
| Buffer wrapping | `Napi::Buffer::Copy()` implied | Confirm `Copy()` not `New()` | `New()` with same address twice → V8 crash |
| @electron/rebuild version | `^3.5.0` | `^4.0.0` | Latest, better ESM compat |
| IPC-PROTOCOL.md mmap path | `/dev/shm/entropic-frames` | File-backed path (`~/.cache/entropic/frames-{uuid}` or `/tmp/entropic-frames`) | `/dev/shm/` does not exist on macOS (Linux only) |
| mmap file permissions | Not specified | `os.open(path, flags, 0o600)` | Prevents world-readable frame data |
| Ring buffer sync | Implicit | Generation counter (odd=writing, even=done) | ARM64 weak ordering causes torn frames without barrier |

---

## 12. Fallback Strategy: cmake-js

If node-gyp proves intractable, `cmake-js` is the primary fallback:
- Uses CMake instead of GYP (more standard, better IDE support)
- Better cross-compilation support
- Same .node output format
- Slightly more setup but more predictable builds

```bash
npm install cmake-js --save-dev
```

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.15)
project(shared_memory)
include_directories(${CMAKE_JS_INC})
file(GLOB SOURCE_FILES "src/*.cc")
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})
execute_process(COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR)
string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})
```

**Last resort:** Pure JS `SharedArrayBuffer` via Electron's `--shared-memory` flag. Lower performance but no C++ compilation needed. Test throughput before committing.

---

## 13. Gotcha Checklist (Pre-Build Verification)

Run through before every native module build:

| # | Check | Command | Fails If Wrong |
|---|-------|---------|----------------|
| 1 | Node.js is ARM64 | `node -p "process.arch"` == `arm64` | .node built for wrong arch |
| 2 | Electron is ARM64 | `npx electron -e "console.log(process.arch)"` == `arm64` | dlopen arch mismatch |
| 3 | .node built against Electron headers | `npx electron-rebuild -f` | NODE_MODULE_VERSION mismatch |
| 4 | mmap offsets are 16KB-aligned | Single mmap of entire file (offset=0) ✓ | EINVAL on Apple Silicon |
| 5 | `NODE_API_MODULE()` used | Grep C++ source for `NODE_API_MODULE` | Crash in Electron multi-context |
| 6 | No V8 BackingStore double-register | Use `Buffer::Copy()` or cache ref | Fatal V8 crash |
| 7 | Native module in main process only | Not loaded in sandboxed renderer | dlopen blocked |
| 8 | `asarUnpack` includes .node | Check electron-builder config | dlopen from asar fails |
| 9 | Entitlements include `disable-library-validation` | Check plist file | Notarized app rejects .node |
| 10 | `MACOSX_DEPLOYMENT_TARGET >= 12.0` | Check binding.gyp | Build failure or runtime crash |
| 11 | Python 3.12+ → node-gyp >= 10 | `npx node-gyp --version` | distutils ImportError |
| 12 | `NAPI_VERSION=8` defined | Check binding.gyp defines | Undefined symbol errors |
| 13 | All binaries same arch in .app | `file *.node && file sidecar/*` | mach-o wrong architecture |
| 14 | Nuitka binary is code-signed | `codesign -v sidecar/entropic-engine` | macOS quarantine blocks launch |
| 15 | electron-vite externalizes native module | Check rollupOptions.external | Vite tries to bundle .node |
| 16 | Shell is ARM64, not Rosetta | `arch` must output `arm64`; also: `sysctl -n sysctl.proc_translated` must output `0` | iTerm2/VS Code may default to x86_64 via Rosetta |
| 17 | Python writer has memory barrier before index update | Use generation counter or `msync()` | Torn frames on ARM64 (intermittent, hard to debug) |
| 18 | mmap file has 0o600 permissions | `os.open(path, flags, 0o600)` | World-readable frame data on /tmp |
| 19 | 4K MJPEG frames fit in 4MB slot | Check `len(encoded_frame) <= SLOT_SIZE` | Silent frame corruption at 4K (Q95 can exceed 4MB) |
| 20 | mmap file lifecycle is defined | Python creates, Electron waits, Python deletes on shutdown | Stale files, dual-instance conflicts |
| 21 | `package-lock.json` committed | `ls package-lock.json` | Non-reproducible builds |
| 22 | C++ native module has MJPEG SOI/EOI validation | Check for `0xFFD8` / `0xFFD9` markers | Corrupt JPEG crashes Chromium image decoder |
| 23 | Python restart re-creates mmap (ftruncate) | C++ reader must `munmap`+`close`+`reopen` | SIGBUS if reader holds mapping to resized file |

---

## 14. Recommended package.json Scripts

```json
{
  "scripts": {
    "postinstall": "npx electron-rebuild",
    "build:native": "cd native && node-gyp rebuild",
    "rebuild": "npx electron-rebuild -f -w shared_memory",
    "dev": "electron-vite dev",
    "build": "npm run build:native && electron-vite build",
    "package": "npm run build && electron-builder --mac --arm64",
    "verify:arch": "node -p process.arch && npx electron -e 'console.log(process.arch)'"
  },
  "dependencies": {
    "node-addon-api": "^8.0.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^4.0.0"
  }
}
```

---

## 15. Red Team Audit Findings (32 findings, 7 HIGH)

Full audit by QA Red Team agent. Findings folded into this doc above. Summary of HIGH-risk items:

| # | Finding | Risk | Integrated? |
|---|---------|------|-------------|
| 1 | mmap TOCTOU race — no Python release barrier on ARM64 | HIGH | Yes — Section 5 updated with generation counter mitigation |
| 2 | mmap file permissions on `/tmp` default to `0644` | HIGH | Yes — Section 5 updated + Gotcha #18 |
| 3 | Python crash mid-write corrupts ring buffer | HIGH | Yes — generation counter solves both this and #1 |
| 4 | `electron-rebuild` failure blocks entire `npm install` | HIGH | Documented — use defensive postinstall script |
| 5 | macOS Sequoia stricter security not tested end-to-end | HIGH | Flagged — must test dlopen + entitlements on 15.x |
| 6 | No lock files; loose version ranges | HIGH | Yes — Gotcha #21 |
| 7 | 4K MJPEG frames may exceed 4MB slot size | HIGH | Yes — Gotcha #19 |

**Top 5 action items from Red Team:**
1. **Commit `package-lock.json`** — fastest fix for reproducibility
2. **Implement generation counter** on ring buffer — prevents torn frames AND crash corruption
3. **Validate 4K frame size vs 4MB slot** — add runtime `len()` check, consider 8MB slots
4. **Set explicit `0o600` permissions** on mmap file, use `~/.cache/entropic/frames-{uuid}` path
5. **Test full build + launch on macOS Sequoia** — dlopen, entitlements, Gatekeeper all changed

**Additional MEDIUM findings (not yet integrated, address during implementation):**
- C++ segfault in native module kills entire Electron process (no isolation) — consider `worker_thread`
- `URL.createObjectURL` leak on corrupt frames (add `img.onerror` handler)
- mmap file lifecycle (create/delete/stale/concurrent) not formally defined
- `__dirname` polyfill behavior in electron-vite ESM context — documented in Section 8
- Ad-hoc `codesign -s -` needed for `.node` during development on Ventura/Sequoia
- No `O_CLOEXEC` flag on mmap file descriptor — potential leak on Electron crash
- PyAV bundled FFmpeg version should be checked: `python -c "import av; print(av.library_versions)"`
- zeromq npm package may need cmake if no prebuilts for ABI 143

---

## 16. Summary: What the 0B Session Needs to Know

**Before writing C++ code:**
1. Set `MACOSX_DEPLOYMENT_TARGET` to `"12.0"` (not `"10.13"`)
2. Use `NODE_API_MODULE()` macro (not `NODE_MODULE()`)
3. Add `NAPI_VERSION=8` to binding.gyp defines
4. Use `Napi::Buffer::Copy()` for frame data (safe, ~2ms estimated at 1080p)
5. Validate MJPEG SOI (`0xFFD8`) / EOI (`0xFFD9`) markers before returning buffer

**Before first build:**
6. Verify `arch` returns `arm64` AND `node -p "process.arch"` returns `arm64`
7. Install `node-addon-api@^8.0.0` as dependency
8. Install `@electron/rebuild@^4.0.0` as devDependency
9. Run `npx electron-rebuild -f` after any `npm install`
10. Commit `package-lock.json` for reproducible builds

**Before validation tests:**
11. Implement generation counter on ring buffer (odd=writing, even=done) — required for ARM64 memory ordering
12. mmap file must use `os.open(path, flags, 0o600)` — NOT default permissions
13. Check `len(encoded_frame) <= SLOT_SIZE` before writing — 4K Q95 frames can exceed 4MB
14. Our 16MB mmap (single mapping, offset=0) is safe on ARM64 page alignment
15. `.node` HMR is impossible — rely on main process restart
16. On Python restart: C++ must `munmap` + `close` + reopen (avoids SIGBUS from ftruncate)

**For eventual packaging:**
17. Add `asarUnpack: ["**/*.node"]` to electron-builder
18. Create entitlements plist with 3 required keys
19. Both `.node` and Nuitka binary must be code-signed
20. Test full build + launch on macOS Sequoia (15.x)

---

**Sources consulted:**
- Electron Native Node Modules Guide (electronjs.org)
- node-addon-api v8.6.0 docs (github.com/nodejs/node-addon-api)
- node-gyp ARM64 support PR #2165 and issues #2586, #2808, #2992
- Apple Developer: Addressing Architectural Differences in macOS Code
- electron-vite 5.0 docs (dependency handling, troubleshooting, HMR)
- GYP User Documentation (gyp.gsrc.io)
- Electron 40.0.0 release notes (Chromium 144, Node 24.11.1)
- electron-builder macOS code signing docs
- @electron/rebuild ESM/CJS issue #1073
- node-addon-api BackingStore crash issue #799
- electron/osx-sign entitlements wiki
- macOS hardened runtime entitlements (Apple Developer Forums)
