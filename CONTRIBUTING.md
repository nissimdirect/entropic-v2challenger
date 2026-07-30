# Contributing to Entropic v2 Challenger

## Conventional Commit Scopes

Format: `type(scope): description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `chore`

Scopes:
- `effects` — effect plugins (blur, glitch, color, etc.)
- `color` — color suite (HSL, curves, levels, etc.)
- `timeline` — timeline engine, playback, scrubbing
- `zmq` — ZMQ server, IPC protocol
- `video` — video reader, writer, ingest, probe
- `audio` — audio player, decoder, waveform, A/V clock
- `export` — video export pipeline
- `perf` — performance optimization
- `automation` — automation lanes, keyframes

Examples:
- `feat(effects): add chromatic aberration effect`
- `fix(zmq): handle malformed JSON without deadlock`
- `test(color): add HSL edge case coverage`

## Test Tiers

| Tier | Command | Duration | What |
|------|---------|----------|------|
| Smoke | `pytest -m smoke -x -q` | ~3s | Fast unit tests, no I/O |
| Full | `pytest -x -q` | ~18s | All tests (parallel via xdist) |
| Perf | `pytest -m perf` | ~10s | Performance gates (opt-in) |

## Test Scripts

- `scripts/check_tests.sh` — Skip-if-green gate (exit 0 = skip, exit 1 = run)
- `scripts/test_health.py` — Dashboard (summary, --slow, --flaky, --rotate)

## Test Manifest

`.test-manifest.json` is auto-generated after every test run. Contains pass/fail counts, branch, SHA, and green status. Used by `/eng` and `/quality` for smart test gating.

Add to `.gitignore`:
```
.test-manifest.json
.test-results/
```

## Test Pyramid (Frontend)

```
                    /\
                   /  \        12 E2E Smoke (Playwright + real Electron)
                  /    \       Launch, connect, import, effect, export,
                 /      \      security gates, sidecar lifecycle
                /________\
               /          \
              / IPC Contract \ Auto-generated from shared schema
             / Tests (Vitest  \ Catches TS ↔ Python schema drift
            /  + pytest)       \
           /____________________\
          /                      \
         / Component Tests with   \ Vitest + @testing-library/react
        / mocked window.entropic   \ UI rendering, interactions, state
       /____________________________\
      /                              \
     / Backend Tests (pytest)         \ Already fast (5.3s)
    /__________________________________\
```

### Which tier does my test belong to?

| If you're testing... | Use | Speed |
|---------------------|-----|-------|
| Backend logic, effects, ZMQ commands | pytest unit test | ~50ms |
| UI component rendering, interactions | Vitest + `createMockEntropic()` | ~200ms |
| TypeScript ↔ Python schema agreement | Vitest IPC contract test | ~100ms |
| App launch, sidecar lifecycle, security | Playwright E2E | ~5s |

### "WHY E2E" Rule

New E2E tests (`.spec.ts` files in `tests/e2e/`) **require a justification comment**:

```typescript
// WHY E2E: Tests contextIsolation security gate — must verify in real Electron process
```

If the test doesn't need real Electron (process lifecycle, OS integration, security gates), it should be a Vitest component test with mocked IPC instead.

## Frontend UI Law (one page — framework F0)

Ratified foundations: `docs/frontend/RATIFIED-FOUNDATIONS.md` (until the F1 docs PR lands,
the interim copy lives at `~/.claude/plans/creatrix-ratified-foundations.md`). Specs trace to
ratified decisions; new load-bearing design decisions get a ratification row when made.

**Governing rule: every UI requirement below is script-enforced. The scripts are the law;
this page is the index.** (Docs drift — two prior component specs rotted. CI does not.)

1. **Colors are tokens.** No raw hex anywhere except `styles/tokens.css`; no raw `rgba()`
   where an alpha token exists. Components reference SEMANTIC tokens (`--cx-text-1`), never
   primitives. Enforced: `scripts/hex-ratchet.sh` (styles/) + `scripts/ui-ratchets.sh`
   (`tsx_hex`, `css_hex_outside_styles=0` hard ban).
2. **Type floor is 12px** (RATIFIED D6 "Scale B+1": heading 16/650 · body 14/450 ·
   label 13/600 · data 12/450). Enforced: `ui-ratchets.sh` `css_font_below_floor`.
3. **No inline `style={{}}`** for anything a class + token can express.
   Enforced: `ui-ratchets.sh` `tsx_inline_style` (ratcheting down from 138).
4. **Use the primitives, don't reinvent.** Sliders → `components/common/Slider`; selects →
   the Select skin; dialogs → the `dialog`/`dialog__*` BEM root (`UnsavedChangesDialog` is
   the canonical pattern). Enforced: `ui-ratchets.sh` `tsx_raw_range`/`tsx_native_select`
   ratchets; dialog-root conformance test lands with F1.
5. **Component states come from one enumeration.** Interactive controls:
   `rest · hover · focus-visible · active · disabled`. Containers: `empty · loading · error`.
   Expressed as BEM modifiers (`block__el--disabled`) via the shared class-builder.
   Never invent a new state-naming scheme.
6. **Tests target `data-testid` only** — never CSS classes (classes change with styling;
   test-ids are versioned API). Every new primitive ships its test-id as part of its anatomy.
7. **Every visual edit gets looked at** before the next edit (screenshot in the packet
   ledger — cadence L1). No packet closes without visual evidence (L2).
8. **Every UI PR declares** its touched surfaces + the UI entry point that mounts the
   feature (the PR template's TRACEABILITY line — the standing cure for the
   control-surface-gap bug class).
9. **Mocks are REAL-INVENTORY-ONLY and REAL-DIMENSIONS-ONLY** — every mock element exists
   in code or a locked plan, authored inside the app's default 1280×800 window.
10. **E2E launches are hermetic** — the fixture pins bounds (1280×800), DPR (1), and
    userData. Never write an e2e that depends on machine state.

Superseded documents (do not extend): `docs/COMPONENT-TEST-MATRIX.md`,
`docs/COMPONENT-ACCEPTANCE-CRITERIA.md` — see their headers.
