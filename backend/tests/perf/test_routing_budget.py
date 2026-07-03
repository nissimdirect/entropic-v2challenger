"""Phase 1 routing-budget perf harness — LayerTap perf plan.

Measures ms/frame curves for (tracks x routings x type-mix x resolution) by
layering SIMULATED LayerTap costs over the REAL apply_chain pipeline. The tap
simulation uses the exact cv2 pathways the PRD mandates (naive numpy blend is
2.7x slower and forbidden), so curves predict the feature before it exists;
when LayerTap lands, `_tap_*` swap for real calls and the baselines carry over.

Run:    RUN_PERF=1 python -m pytest tests/perf/test_routing_budget.py -m perf -s
Output: docs/perf/routing-baseline.json (committed baseline for calibration)

NOT part of default suites: opt-in via RUN_PERF env + `perf` marker. Intended
for the nightly perf job, never per-PR (CI time is a known wound — see
docs/solutions/2026-02-28-e2e-test-pyramid.md).
"""

import json
import os
import platform
import time
from pathlib import Path
from statistics import median

import cv2
import numpy as np
import pytest

from engine.pipeline import apply_chain

pytestmark = pytest.mark.perf

if not os.environ.get("RUN_PERF"):
    pytest.skip("perf harness is opt-in (RUN_PERF=1)", allow_module_level=True)

RES = {"720p": (1280, 720), "1080p": (1920, 1080)}
TRACKS = (2, 8)
ROUTES = (0, 4, 8)
MIXES = ("scalar", "field", "mixed")
FRAMES = 6  # median over this many frames per cell

# Per-track device chain: two cheap real effects so the pipeline seam is real.
CHAIN = [
    {"effect_id": "fx.invert", "params": {}, "enabled": True},
    {"effect_id": "util.levels", "params": {}, "enabled": True},
]

_GAMMA_LUT = (np.linspace(0, 1, 256) ** 1.4 * 255).astype(np.uint8)


def _frame(w: int, h: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


# ---- simulated tap consumers (cv2-mandated paths, PRD decision 14) ----


def _tap_field(src_rgb, dst_rgb):
    """extract(luma) -> shape(LUT) -> full-res 3ch blend at destination."""
    field = cv2.cvtColor(src_rgb, cv2.COLOR_RGB2GRAY)
    field = cv2.LUT(field, _GAMMA_LUT).astype(np.float32) / 255.0
    m3 = cv2.merge([field, field, field])
    return cv2.add(
        cv2.multiply(dst_rgb.astype(np.float32), 1 - m3),
        cv2.multiply(dst_rgb.astype(np.float32), m3),
    ).astype(np.uint8)


def _tap_mask(src_rgb, dst_rgb):
    """extract -> matte transform (warpAffine) -> blend."""
    field = cv2.cvtColor(src_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    h, w = field.shape
    field = cv2.warpAffine(field, np.float32([[0.9, 0, 20], [0, 0.9, 10]]), (w, h))
    m3 = cv2.merge([field, field, field])
    return cv2.add(
        cv2.multiply(dst_rgb.astype(np.float32), 1 - m3),
        cv2.multiply(dst_rgb.astype(np.float32), m3),
    ).astype(np.uint8)


def _tap_scalar(src_rgb):
    """proxy reduce: LINEAR to 64x64 (INTER_AREA-to-64 is forbidden: 8.65ms) -> mean."""
    return float(cv2.resize(src_rgb, (64, 64), interpolation=cv2.INTER_LINEAR).mean())


def _routes_for(mix: str, n: int) -> list[str]:
    if mix == "scalar":
        return ["scalar"] * n
    if mix == "field":
        return ["field"] * n
    kinds = ["field", "mask", "scalar", "scalar"]  # mixed: fields dominate cost
    return [kinds[i % len(kinds)] for i in range(n)]


def _cell_ms(res_name: str, n_tracks: int, n_routes: int, mix: str) -> float:
    w, h = RES[res_name]
    frames = [_frame(w, h, 100 + t) for t in range(n_tracks)]
    routes = _routes_for(mix, n_routes)
    times = []
    for fi in range(FRAMES):
        t0 = time.perf_counter()
        outs = []
        for t in range(n_tracks):
            out, _ = apply_chain(
                frames[t],
                CHAIN,
                project_seed=42,
                frame_index=fi,
                resolution=(w, h),
                states=None,
            )
            outs.append(out[:, :, :3])
        for i, kind in enumerate(routes):
            src = outs[i % n_tracks]
            dst = outs[(i + 1) % n_tracks]
            if kind == "field":
                _tap_field(src, dst)
            elif kind == "mask":
                _tap_mask(src, dst)
            else:
                _tap_scalar(src)
        times.append((time.perf_counter() - t0) * 1000)
    return median(times)


def test_routing_budget_curves():
    """Produce the ms/frame grid, write the baseline, sanity-check the cost model."""
    results = []
    for res_name in RES:
        for n_tracks in TRACKS:
            base = None
            for mix in MIXES:
                for n_routes in ROUTES:
                    if n_routes == 0 and mix != "scalar":
                        continue  # routes=0 identical across mixes
                    ms = _cell_ms(res_name, n_tracks, n_routes, mix)
                    if n_routes == 0:
                        base = ms
                    results.append(
                        {
                            "res": res_name,
                            "tracks": n_tracks,
                            "routes": n_routes,
                            "mix": mix,
                            "ms": round(ms, 2),
                        }
                    )
                    print(
                        f"{res_name} tracks={n_tracks} {mix:6s} routes={n_routes}: {ms:7.2f} ms"
                    )
            # unit cost of a field route at this res/track count
            full = next(
                r["ms"]
                for r in results
                if r["res"] == res_name
                and r["tracks"] == n_tracks
                and r["mix"] == "field"
                and r["routes"] == 8
            )
            unit = (full - base) / 8
            print(
                f"  -> field-route unit cost @{res_name}: {unit:.2f} ms (model: ~6ms @1080p)"
            )
            results.append(
                {
                    "res": res_name,
                    "tracks": n_tracks,
                    "routes": "unit_field",
                    "mix": "derived",
                    "ms": round(unit, 2),
                }
            )
            if res_name == "1080p":
                # SOFT sanity gate: within 4x of the Phase-0 model, and positive.
                assert 0 < unit < 24, f"field unit cost {unit:.2f}ms wildly off model"

    out_path = Path(__file__).resolve().parents[2].parent / "docs" / "perf"
    out_path.mkdir(parents=True, exist_ok=True)
    baseline = {
        "measured": time.strftime("%Y-%m-%d"),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "opencv": cv2.__version__,
        "frames_per_cell": FRAMES,
        "results": results,
        "warn_model_ms": "6*fields + 5*masks + 7*feedback + 0.2*scalars",
        "meter": {"yellow_ms": 10, "red_ms": 20},
    }
    (out_path / "routing-baseline.json").write_text(json.dumps(baseline, indent=2))
    print(f"baseline written: {out_path / 'routing-baseline.json'}")


def test_optimized_tap_path_quantifies_mandates():
    """The two implementation mandates (hoist float conversion; contiguous buffers)
    measured against the naive path — this delta is WHY they are mandates, and the
    optimized number is what the budget meter constants should assume."""
    w, h = RES["1080p"]
    raw = _frame(w, h, 7)
    src_naive = raw[:, :, :3]                      # NON-contiguous view (the trap)
    dst_naive = _frame(w, h, 8)[:, :, :3]
    src_opt = np.ascontiguousarray(src_naive)      # mandate 2
    dst_f32 = np.ascontiguousarray(dst_naive).astype(np.float32)  # mandate 1: hoisted once

    def _naive():
        _tap_field(src_naive, dst_naive)

    def _opt():
        field = cv2.cvtColor(src_opt, cv2.COLOR_RGB2GRAY)
        field = cv2.LUT(field, _GAMMA_LUT).astype(np.float32) / 255.0
        m3 = cv2.merge([field, field, field])
        cv2.add(cv2.multiply(dst_f32, 1 - m3), cv2.multiply(dst_f32, m3))

    def _t(fn):
        fn()
        ts = []
        for _ in range(20):
            t0 = time.perf_counter(); fn(); ts.append((time.perf_counter() - t0) * 1000)
        return median(ts)

    naive, opt = _t(_naive), _t(_opt)
    print(f"field tap @1080p: naive {naive:.2f}ms -> optimized {opt:.2f}ms ({naive/opt:.1f}x)")
    assert opt < naive, "optimized path must beat naive"
    # record beside the grid baseline
    out_path = Path(__file__).resolve().parents[2].parent / "docs" / "perf"
    out_path.mkdir(parents=True, exist_ok=True)
    p = out_path / "routing-baseline.json"
    if p.exists():
        data = json.loads(p.read_text())
        data["optimized_field_tap_ms_1080p"] = round(opt, 2)
        data["naive_field_tap_ms_1080p"] = round(naive, 2)
        p.write_text(json.dumps(data, indent=2))


def test_fanout_computes_tap_once():
    """Perf-plan Phase 2 requirement: one source feeding N consumers must extract
    the tap ONCE and share the buffer. Demonstrated numerically: shared-tap cost
    must beat per-consumer re-extraction decisively at N=8."""
    w, h = RES["1080p"]
    src = _frame(w, h, 7)[:, :, :3]
    dst = _frame(w, h, 8)[:, :, :3]
    N = 8

    def _shared():
        field = cv2.cvtColor(src, cv2.COLOR_RGB2GRAY)
        field = cv2.LUT(field, _GAMMA_LUT).astype(np.float32) / 255.0
        m3 = cv2.merge([field, field, field])
        for _ in range(N):
            cv2.add(
                cv2.multiply(dst.astype(np.float32), 1 - m3),
                cv2.multiply(dst.astype(np.float32), m3),
            )

    def _naive():
        for _ in range(N):
            _tap_field(src, dst)

    def _t(fn):
        fn()
        ts = []
        for _ in range(8):
            t0 = time.perf_counter()
            fn()
            ts.append((time.perf_counter() - t0) * 1000)
        return median(ts)

    shared, naive = _t(_shared), _t(_naive)
    print(f"fan-out N={N}: shared-tap {shared:.1f}ms vs re-extract {naive:.1f}ms")
    assert shared < naive, "sharing the tap buffer must not be slower"
