# Creatrix Performance Model — The Global Frame Budget

**Date:** 2026-06-11 · **Status:** canonical — every instrument/effect/operator packet's perf gate
derives from THIS document. **Repo:** `~/Development/entropic-v2challenger` (origin/main @ `d821ae8`).
**Companion packets:** PERF.1 (measurement harness) + PERF.2 (CI perf smoke), specified below with
the full EXECUTION-PLAN §1 contract.

---

## 1. The target (one sentence)

> **Preview sustains ≥30 fps at 1080p with 4 tracks × 6 devices each × 8 operators live, on an
> M4 MacBook with 16 GB unified memory.**

That is **33.3 ms per frame, end to end** — decode through pixels-on-screen. Everything below
decomposes that number.

### 1.1 Stated assumptions (the measurement contract)

| Assumption | Value | Why it's pinned |
|---|---|---|
| Hardware | Apple M4 (base), 16 GB unified, macOS 15+ | The user's machine; memory thresholds elsewhere are calibrated for 16 GB |
| Resolution | 1920×1080 timeline + preview | App's working resolution; PERF.1 also samples 540p for the degrade path |
| Frame rate target | 30 fps preview (33.33 ms budget) | Matches the repo's existing 30 fps conventions (verified: `resonant_paulstretch.py:81` "cycles per second @ 30fps", `torn_edges.py:19`, `security.py:38` frame-count cap math) |
| Scene shape | 4 video tracks · 6 devices per track (24 device instances) · 8 operators (LFO/env/follower mix) · 1 terminal Composite per track (post-P2.2) | The "loaded but realistic" performance-session ceiling for FC-v3 |
| Pipeline | decode → per-track `apply_chain` → composite → `encode_mjpeg` (q95, `backend/src/engine/cache.py:11`) → base64 → ZMQ REQ/REP → `<img>` (per repo CLAUDE.md) | The shipped architecture; no GPU compute (SG-1 Metal binding deferred — ROADMAP ledger) |
| Python runtime | 3.14 sidecar, numpy effects, single render thread per request | Current engine reality |
| Excluded from budget | Cold start, first-frame cache fill, export encode (separate throughput target §1.2), scrub seeks (separate latency target §1.2) | Steady-state playback is THE budget; the excluded paths get their own numbers |

### 1.2 Secondary targets (not the frame budget, but quantified here so packets stop inventing them)

| Path | Target | Measured by |
|---|---|---|
| Scrub seek (click timeline → frame visible) | ≤ 150 ms p95 | PERF.1 scenario S-scrub |
| Export throughput (1080p, the §1.1 scene) | ≥ 8 fps sustained (a 10 s clip exports in ≤ 37.5 s); **never** silently >2× slower than the previous baseline | PERF.1 export probe; P2.3 cites this |
| UI thread (frontend) | event handlers < 8 ms (P3.4's hover gate is an instance of this rule); React commit < 16 ms during playback | vitest perf tests (P3.4 pattern) |
| Memory | sidecar RSS < 2.0 GB steady-state in the §1.1 scene; no monotonic growth over 5 min (≤ +50 MB) | PERF.1 RSS probe; pairs with SG-8 lib |

---

## 2. Budget decomposition (must sum under 33.3 ms)

Per-frame, steady-state playback of the §1.1 scene. These are **budgets** (allocations), not
measurements — PERF.1 produces the measured baseline against them; a stage may borrow from
**reserve** only, never from a sibling stage, without a PR amending this table.

| # | Stage | Budget (ms) | Derivation / notes |
|---|---|---:|---|
| 1 | **Decode** — 4 tracks × 1080p frame fetch (PyAV, keyframe-cached) | **6.0** | 1.5 ms/track amortized; scrub-seek cold path explicitly excluded (§1.2) |
| 2 | **Effects** — `apply_chain`, 24 device instances total | **14.0** | The headline allocation. Per-device class budgets in §3 must compose under this: 24 × 0.58 ms average |
| 3 | **Operators + modulation** — 8 operators evaluated + lane sampling (`sample_lane`, `lane_reader.py:92`) + toposort'd routing | **1.5** | Param-rate math, not pixel-rate; 8 ops × ~0.15 ms + graph overhead |
| 4 | **Composite** — 4 layers, terminal-effect blend (9 modes, `compositor.py:69`) | **3.0** | ~0.75 ms per 1080p blend pass (numpy, single-pass per layer) |
| 5 | **Encode preview** — `encode_mjpeg` q95 + base64 | **4.0** | 1080p MJPEG ≈ 3 ms + base64 ≈ 1 ms |
| 6 | **IPC + present** — ZMQ roundtrip, relay, renderer `<img>` decode/paint | **3.0** | Local REQ/REP ≈ sub-ms; `<img>` JPEG decode dominates |
| 7 | **Reserve** — GC pauses, watchdog heartbeat, jitter | **1.8** | The only borrowable pool; p95 jitter lives here |
| | **TOTAL** | **33.3** | = 30 fps |

**Reading the table:** a frame whose stages each hit budget lands at exactly 30 fps. The CI gate
(PERF.2) tracks **p95 ≤ 33.3 ms end-to-end** and **per-stage p95 ≤ stage budget** — a stage may be
under in the mean and still fail on p95 (that's the point: stutter is a p95 phenomenon).

---

## 3. How packet perf gates derive from this table

Every effect/instrument/operator packet states its perf gate as a **class declaration + a PERF.1
measurement**, never an ad-hoc number.

### 3.1 Effect device classes (compose under stage 2's 14 ms)

| Class | Per-instance budget @1080p (M4) | Composition rule | Examples |
|---|---:|---|---|
| **A — light** | ≤ 0.3 ms | unrestricted (24×A = 7.2 ms, fine) | LUT color ops, channel math, simple geometry |
| **B — standard** | ≤ 1.0 ms | ≤ 12 per scene at full budget (12×B + 12×A ≈ 15.6 ms — at the edge; the canonical scene uses 6×B + 18×A = 11.4 ms) | convolutions, small-kernel blurs, pixel-sort variants |
| **C — heavy** | > 1.0 ms; MUST ship a degrade mode | ≤ 2 per scene at preview; degrade activates beyond that | `reaction_mosh` (PDE), spectral family, optical flow |

**Class C degrade contract:** a class-C effect must implement at least one of: param-clamped preview
default (the #166 precedent — `pde_steps_per_frame` default 3→1 cited "1080p render budget",
`reaction_mosh.py:81`), half-resolution preview processing, or frame-skip with hold. The degrade
must be test-asserted (a named test proving the preview path takes the cheap branch).

**Legacy bar superseded:** the old informal "500 ms render budget" language (visible in
`reaction_mosh.py:81`) described worst-case single-frame tolerance, i.e. 2 fps. It is hereby
superseded for PREVIEW by this model; it survives only as the absolute per-frame ceiling for
class-C effects in EXPORT (where interactivity doesn't apply).

### 3.2 What a packet must write (the gate template)

> **Perf gate (PERF-MODEL §3):** declares class {A|B|C}. PERF.1 single-effect probe at 1080p on M4:
> p95 ≤ {0.3|1.0|declared} ms. If class C: degrade mode = {named mechanism}, asserted by test
> "{title}". Scene-level: adding this effect to canonical scene S2 keeps end-to-end p95 ≤ 33.3 ms
> (PERF.2 run attached to PR).

Instrument packets (samplers/racks: B-ladder) budget against stages 1+2+4 jointly: each active
voice ≈ one decode (stage 1 share) + its per-voice chain (stage 2 classes) + one composite layer
(stage 4 ≈ 0.75 ms). The 4-voice cap (`MAX_TOTAL_VOICES_PER_RENDER`, phase-5a P5a.2) exists
precisely so worst-case voices ≈ 4 extra decode+blend passes ≈ 6+3 ms — which is why the canonical
scene reserves headroom in stages 1/4 rather than running them at measured minimums.

Operator packets budget against stage 3: ≤ 0.15 ms per operator instance, measured by the PERF.1
operator probe at 32 routing paths (the P4.x xyflow gate's 60 fps @ 32 paths is the FRONTEND half
of the same constraint).

### 3.3 Masking / matte ops effect-class assignments (MK workstream — 2026-06-12)

Matte operations integrate into the existing stage-2 budget (effects chain) and stage-4 budget
(composite). Every masking packet must declare one of the classes below:

| Operation | Class | Budget @1080p | Notes |
|---|---|---:|---|
| **Mask multiply** (matte × layer alpha, the MK.2/MK.4 `delete-in/out` path — `a' = a·m` or `a' = a·(1−m)` on one 1080p layer) | **A** | ≤ 0.3 ms | Pure numpy element-wise multiply on a (H,W) float32 already allocated; no extra allocations on the fast path |
| **Mask-routing blend** (MK.3 per-device or per-chain `out = dry·(1−m) + wet·m` at 1080p, one device) | **C** | ~6.2 ms measured; SHOULD degrade | **CORRECTED (MK.3 redteam, PR #218):** the original `B ≤ 1.0 ms` assumed a single pass, but this is a 3-pass memory-bandwidth-bound float32 RGBA lerp over ~8.3M elements — physically ~6.2 ms @1080p, not 1.0 ms. Per-device-per-frame, so a 5-device masked chain ≈ 32 fps; SEC-7 bounds it at 10 devices ≈ 16 fps (still usable). The MK.3 `test_masked_device_blend_under_1ms` gates a CI-scale relative bound (×1.15 of legacy), NOT a literal 1.0 ms@1080p. **Degrade path (deferred follow-up):** half-res preview blend + upscale when a chain has >N masked devices; and/or fuse the 3-pass lerp (numexpr / in-place `out=`) — render is currently usable without it. |
| **Key evaluation** (MK.8 chroma/luma/color-range procedural matte re-evaluated per frame at 1080p) | **B** | ≤ 1.0 ms | HSV distance + softness + spill suppression; no GPU; matches class-B convolution budget |
| **Static matte resolve from cache** (LRU hit on a rect/ellipse/polygon node, MK.1) | **A** | ≤ 0.1 ms | Cache hit = memcpy of a pre-rasterized float32 slab; `test_cache_hit_resolve_under_1ms` gates |
| **Static matte rasterize** (cache miss — rect/ellipse/polygon computed fresh @1080p) | **B** | ≤ 1.0 ms | Analytic fill; polygon with ≤256 vertices via cv2 |
| **Magic wand flood-fill** (MK.6 bitmap node bake at pickup frame) | **C** | > 1.0 ms; MUST bake to static sidecar before preview | One-time bake at interaction time, NOT per-frame; cached as PNG sidecar; subsequent frames are cache hits (class A after bake) |
| **RVM figure matte** (MK.12 offline job — NOT in the per-frame render path) | Out-of-budget | — | Offline pre-compute job; produces a cached matte video; per-frame lookup = class-A frame read |

**Ledger-correction note for masking spec authors:** SELECTION-MASKING-SPEC §13 does not assign PERF-MODEL classes to matte ops. The table above IS the correction — masking packets must cite it in their `## TEST PLAN` perf gate lines. If any MK packet's measured p95 exceeds its declared class budget, file a `ledger-correction` note in that packet's PR body pointing back to this table (ROADMAP §3 rule 8 pattern).

---

## 4. PERF.1 — Measurement harness (packet)

- **ID:** PERF.1 · **branch:** `feat/perf1-frame-budget-harness` · **base:** origin/main · **depends-on:** P1.0 (green baseline). Schedulable NOW — independent of Phases 1–3 content (it measures whatever main is).
- **Goal:** A scripted, deterministic measurement harness that renders canonical scenes through the REAL pipeline and emits a frame-time histogram artifact with p50/p95/p99 per stage and end-to-end — the baseline every later perf gate diffs against.
- **Preconditions (anchors verified 2026-06-11, mismatch → STOP):**
  ```bash
  cd ~/Development/entropic-v2challenger
  git grep -n '"perf' backend/pyproject.toml
  # EXPECT: marker "perf: performance gate tests (deselected by default...)" at ~:29 and
  # addopts "-m 'not perf' ..." at ~:27 — the harness rides the existing marker, deselected by default
  git grep -n "def encode_mjpeg" backend/src/engine/cache.py
  # EXPECT: :11
  git grep -n "def _handle_render_composite" backend/src/zmq_server.py
  # EXPECT: :707
  ls backend/scripts/
  # EXPECT: demo_trilogy exists (precedent for a scripts/ subdir); no perf_harness/ yet
  ```
- **Scope:**
  - [ ] NEW `backend/scripts/perf_harness/scenes.py` — 3 canonical scenes as code (deterministic, seeded, synthetic frames — no licensed media): **S1** minimal (1 track, 3 class-A effects) · **S2** the §1.1 target scene (4 tracks × 6 devices [18×A + 6×B per §3.1] × 8 operators + terminal composites) · **S3** instrument scene (1 performance track, 4 sampler voices + seam layers + 2-return rack, post-P5a — until P5a lands, S3 auto-degrades to composite-only and SAYS so in the artifact).
  - [ ] NEW `backend/scripts/perf_harness/run_harness.py` — renders N=300 frames/scene through the real `apply_chain`/`render_composite`/`encode_mjpeg` path (in-process; the IPC stage measured separately via a loopback ZMQ probe of 300 ping-render roundtrips); per-stage timers; writes **`docs/perf/frame-budget-baseline.json`**: `{machine, sha, scene: {stage: {p50, p95, p99}, end_to_end: {...}, fps_equivalent}}` + a frame-time histogram (ASCII in the JSON sidecar `--md` report — no plotting deps).
  - [ ] Single-effect + single-operator probe modes: `python run_harness.py --effect <id>` / `--operator <type>` → the §3.2 per-instance numbers.
  - [ ] NEW `backend/tests/test_perf_harness.py` — marked `@pytest.mark.perf`.
  - [ ] `docs/perf/frame-budget-baseline.json` — the committed first baseline from the user's M4 (the harness refuses to write a baseline on non-arm64 or <8 perf cores without `--force-machine`, and stamps machine info into the artifact).
- **DO-NOT-TOUCH:** `backend/src/engine/**` and `backend/src/effects/**` (measure, never "optimize while in there"); `frontend/**` (the `<img>`-paint half of stage 6 is PUX.6/live-smoke territory, approximated here by the encode+IPC probe).
- **Steps:** scenes → stage timers → end-to-end run → probes → JSON/markdown artifact → baseline capture on the target machine → tests.
- **Test plan:**
  ```bash
  cd ~/Development/entropic-v2challenger/backend
  python -m pytest tests/test_perf_harness.py -m perf -x --tb=short   # perf marker: explicit opt-in
  python scripts/perf_harness/run_harness.py --scene S2 --frames 300 --out /tmp/perf-s2.json
  python -m pytest -x -n auto --tb=short   # full suite unaffected (harness is deselected by default)
  ```
  Named tests: "harness produces p50/p95/p99 for every stage in every scene" · "two runs of the same seeded scene differ in p50 by less than 15% (stability)" · "single-effect probe classifies a known class-A effect under 0.3ms" · "stage timings sum to within 10% of measured end-to-end (no unaccounted time)". **Negative tests:** "harness refuses to overwrite the committed baseline without --update-baseline" · "unknown effect id in --effect exits nonzero with a clear error, no traceback".
- **Acceptance gates (quantified):** baseline JSON committed with all 3 scenes (or S3's declared degrade) · S2 end-to-end p95 recorded (NOT required to meet 33.3 ms yet — the FIRST baseline is allowed to fail the model; it becomes the ratchet floor and the gap is filed as named optimization packets per over-budget stage) · stability test <15% · runtime of the full harness ≤ 5 min.
- **Failure modes:** measuring on the wrong machine normalizes a slow baseline → the machine-stamp + refuse-without-flag guard; in-process timing flatters the IPC stage → the loopback ZMQ probe is mandatory, not optional; S2 wildly over budget → that is a FINDING, not a packet failure (file the per-stage gaps).
- **Rollback:** revert PR (scripts + tests + one JSON; no engine changes by construction).
- **Evidence:** the baseline JSON + the markdown histogram report + 3-run stability numbers in the PR body.
- **Model:** Sonnet.

---

## 5. PERF.2 — CI perf smoke with regression ratchet (packet)

- **ID:** PERF.2 · **branch:** `feat/perf2-ci-perf-smoke` · **base:** origin/main · **depends-on:** PERF.1 merged (baseline JSON exists: `test -f docs/perf/frame-budget-baseline.json || STOP`).
- **Goal:** Every merge to main re-runs the 3 canonical scenes and **fails if p95 regresses more than +10% against the committed baseline**; improvements beyond −10% prompt a baseline update PR (the ratchet moves both ways, deliberately, by explicit commit — never auto-tightened).
- **Preconditions:** the PERF.1 existence gate above; `grep -n "jobs:" .github/workflows/test.yml | head -1` → workflow exists (job list verified 2026-06-11: `smoke`/`sidecar`/`electron-e2e`/`test-health-comment`); `gh api repos/nissimdirect/entropic-v2challenger/actions/runners --jq '.runners[].labels'` or equivalent → determine whether a self-hosted M-series runner exists. **If CI runs on GitHub-hosted x86/arm VMs, absolute budgets DO NOT APPLY in CI** — the ratchet compares CI-against-CI-baseline only (separate `frame-budget-baseline.ci.json`), and the M4 absolute numbers are checked at the §1 rule-9 live-smoke cadence instead. The packet must implement whichever reality the precondition finds and SAY which in the PR body.
- **Scope:**
  - [ ] NEW CI job `perf-smoke` in `.github/workflows/test.yml` — runs on **push to main only** (NOT per-PR: CI capacity is Gap G14 and perf jobs are the most expensive class) · executes `run_harness.py` scenes S1/S2/S3 at `--frames 120` (CI-sized) · compares p95 per scene + per stage against the applicable baseline · **median of 3 harness runs** is the compared value (variance control; single-run p95 on shared runners is noise).
  - [ ] NEW `backend/scripts/perf_harness/compare_baseline.py` — exits nonzero on any p95 ratio > 1.10; prints a per-stage delta table; `--emit-update` writes the would-be new baseline for the improvement-PR flow.
  - [ ] `docs/perf/frame-budget-baseline.ci.json` if the runner-reality precondition demands the split.
- **DO-NOT-TOUCH:** the existing 4 CI jobs' definitions; merge-gate semantics for PRs (perf-smoke is a main-branch canary, not a PR gate — a red perf-smoke on main triggers the §6 rule-8 revert-first reaction).
- **Steps:** comparator script + unit tests → CI job → one deliberate canary (a branch with a `time.sleep(0.01)` injected into a scene effect must turn the job red — proof the gate bites) → docs.
- **Test plan:**
  ```bash
  cd ~/Development/entropic-v2challenger/backend
  python -m pytest tests/test_compare_baseline.py -x --tb=short
  python scripts/perf_harness/compare_baseline.py /tmp/perf-s2.json docs/perf/frame-budget-baseline.json
  ```
  Named tests: "comparator passes at ratio 1.09 and fails at 1.11 (boundary)" · "comparator fails when a STAGE regresses >10% even if end-to-end passes (stage-level ratchet)" · "median-of-3 selection discards a single outlier run". **Negative tests:** "missing baseline file exits nonzero with instructions, not a pass" (a perf gate that silently passes when unconfigured is worse than none) · "malformed/truncated harness JSON exits nonzero, no exception swallowed" (`feedback_silent-exception-swallowing.md`).
- **Acceptance gates (quantified):** the deliberate-canary run is RED and linked in the PR body · a clean main run is GREEN · job wall-time ≤ 10 min · boundary tests green at exactly 1.10 · the runner-reality decision documented.
- **Failure modes:** flaky shared runners → median-of-3 + CI-baseline split is the designed mitigation; if a scene still flaps >2×/week, raise that scene's CI margin to 15% by PR (never delete the scene); perf job eats the CI pool → main-only trigger + 10-min cap; baseline drift via "just update it" PRs → baseline updates require the harness markdown report attached and a one-line justification (reviewer-enforced, stated in the workflow file comment).
- **Rollback:** revert PR (one workflow job + scripts).
- **Evidence:** canary red link + clean green link + boundary test output.
- **Model:** Sonnet.

---

## 6. Governance

- **Amending the §2 table** requires a PR touching this file with measured PERF.1 evidence — stages
  may be re-balanced, the 33.3 ms total may not grow (the target is the product promise, not an
  implementation detail).
- **Every new effect/instrument/operator packet** carries the §3.2 gate template filled in. The §6
  orchestrator protocol (EXECUTION-PLAN) treats a missing perf declaration on such packets as a
  bounce, same as a missing negative test.
- **The first PERF.1 baseline is allowed to be over budget.** The model is the destination; the
  ratchet (PERF.2) guarantees monotonic non-regression while named optimization packets close the
  measured per-stage gaps.
