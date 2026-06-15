"""task #87 — B8 Granulator EXPORT-path render arm (preview→export parity).

The B8 Granulator renders in PREVIEW (zmq_server._handle_render_composite has a
`performance.granulator` arm that appends ONE grain-cloud voice layer) but was
DEAD in EXPORT: engine/export.py had ZERO granulator consumers, so a project
carrying a granulator instrument exported WITHOUT the granulator layer — a real
feature-parity gap.

This suite pins the export arm, mirroring the Frame-Bank export tests
(test_frame_bank.py GATE 1/2): it drives ExportManager._composite_export_frame
directly with a fake render_composite that snapshots the assembled layer list, so
we can assert exactly which layers reach the compositor.

GATES
-----
1. REGRESSION — a `performance` with NO `granulator` key composites ONLY the base
   layer (export byte-identical to the pre-arm path).
2. THE GAP (reproduced) — a `performance` WITH a `granulator` key appends exactly
   ONE extra layer whose layer_id is `granulator:<vid>`. (On origin/main, with no
   export arm, no such layer is appended — this test FAILS there. See
   test_reproduce_gap_documents_main_behavior for the explicit reproduction
   marker.)
3. TRUST BOUNDARY — a malformed granulator payload (density over MAX_GRAINS,
   reserved selection, unknown render_path) is REJECTED LOUDLY (ValueError),
   never silently coerced — mirroring zmq_server._parse_granulator_layer.
4. DETERMINISM — two exports of the same granulator project produce a
   byte-identical grain layer (sha256 of the appended layer frame).
5. RENDER_PATH — render_path='gpu' must NOT crash export; the dispatcher coerces
   it to the deterministic CPU path under is_export=True (granulator_gpu).
6. MAX_GRAINS — density is capped; a request over the cap is rejected.
"""

from __future__ import annotations

import hashlib

import numpy as np
import pytest

import engine.export as export_mod
from engine.export import ExportManager
from instruments.granulator_instrument import MAX_GRAINS
from security import validate_composite_layer_count  # noqa: F401  (cap awareness)


# ---------------------------------------------------------------------------
# Fakes — deterministic footage source (no file I/O), layer-capturing compositor
# ---------------------------------------------------------------------------


def _capture_composite(monkeypatch) -> list[list[dict]]:
    """Patch export_mod.render_composite to snapshot the assembled layer list.

    Mirrors test_frame_bank.py::_capture_composite so the granulator arm is
    asserted with the SAME harness the Frame-Bank arm uses.
    """
    captured: list[list[dict]] = []

    def fake_render_composite(layers, resolution, project_seed, voice_states):
        snapshot = []
        for layer in layers:
            frame = layer.get("frame")
            snapshot.append(
                {
                    "layer_id": layer.get("layer_id"),
                    "opacity": layer.get("opacity"),
                    "blend_mode": layer.get("blend_mode"),
                    "frame": frame if isinstance(frame, np.ndarray) else None,
                }
            )
        captured.append(snapshot)
        w, h = resolution
        return np.zeros((h, w, 4), dtype=np.uint8), {}

    monkeypatch.setattr(export_mod, "render_composite", fake_render_composite)
    return captured


def _base_frame(h: int = 16, w: int = 16, r: int = 200) -> np.ndarray:
    """A non-empty RGBA base layer the granulator samples (R channel = r)."""
    f = np.zeros((h, w, 4), dtype=np.uint8)
    f[:, :, 0] = r
    f[:, :, 1] = 120
    f[:, :, 2] = 60
    f[:, :, 3] = 255
    return f


def _gran_perf(
    *,
    density: int = 8,
    selection: str = "random",
    render_path: str = "cpu",
    window: str = "hann",
    opacity: float = 1.0,
    blend_mode: str = "normal",
    instrument_id: str = "gran-1",
) -> dict:
    """A `performance` carrying ONLY a granulator instrument (no voices/banks)."""
    return {
        "events": [],
        "instruments": {},
        "assets": {},
        "granulator": {
            "instrument_id": instrument_id,
            "density": density,
            "window": window,
            "selection": selection,
            "render_path": render_path,
            "opacity": opacity,
            "blend_mode": blend_mode,
            "axes": {
                # Wide jitter so grains spread across the canvas → a visibly
                # non-empty grain layer.
                "T": {"grain": 0.5, "jitter": 0.3, "position": 0.5, "grain_env": 1.0},
                "Y": {"grain": 0.5, "jitter": 0.8, "position": 0.5, "grain_env": 1.0},
                "X": {"grain": 0.5, "jitter": 0.8, "position": 0.5, "grain_env": 1.0},
                "C": {"grain": 0.5, "jitter": 0.0, "position": 0.5, "grain_env": 1.0},
                "F": {"grain": 0.5, "jitter": 0.0, "position": 0.5, "grain_env": 1.0},
                "L": {"grain": 0.5, "jitter": 0.0, "position": 0.5, "grain_env": 1.0},
            },
            "l_axis_enabled": False,
        },
    }


def _run_frame(performance: dict, *, frame_index: int = 0, project_seed: int = 7):
    """Drive _composite_export_frame for ONE frame and return (out, layers-via-capture)."""
    mgr = ExportManager()
    out, _ = mgr._composite_export_frame(
        base_frame=_base_frame(),
        base_chain=[],
        performance=performance,
        frame_index=frame_index,
        resolution=(16, 16),
        project_seed=project_seed,
        voice_states={},
        voice_readers={},
        frame_bank_caches={},
    )
    return out


# ===========================================================================
# GATE 1 — REGRESSION (no granulator key → base only)
# ===========================================================================


def test_no_granulator_key_is_byte_identical(monkeypatch):
    captured = _capture_composite(monkeypatch)
    perf = {"events": [], "instruments": {}, "assets": {}}
    _run_frame(perf)
    assert len(captured) == 1
    layers = captured[0]
    assert len(layers) == 1  # base only, no granulator layer
    assert layers[0]["layer_id"] == "base"


def test_empty_granulator_dict_is_byte_identical(monkeypatch):
    # Falsy `granulator` ({}/None) → no arm fires → base only (regression-safe).
    captured = _capture_composite(monkeypatch)
    perf = {"events": [], "instruments": {}, "assets": {}, "granulator": {}}
    _run_frame(perf)
    assert len(captured) == 1
    assert len(captured[0]) == 1
    assert captured[0][0]["layer_id"] == "base"


# ===========================================================================
# GATE 2 — THE GAP: granulator key appends exactly ONE grain layer
# ===========================================================================


def test_granulator_appends_one_layer_in_export(monkeypatch):
    captured = _capture_composite(monkeypatch)
    _run_frame(_gran_perf(density=8))
    assert len(captured) == 1
    layers = captured[0]
    # base + granulator = 2 layers
    assert len(layers) == 2, [layer["layer_id"] for layer in layers]
    assert layers[0]["layer_id"] == "base"
    gran_layer = layers[1]
    assert gran_layer["layer_id"].startswith("granulator:"), gran_layer["layer_id"]
    # The grain layer carries a real RGBA frame (ONE layer out, never None).
    assert isinstance(gran_layer["frame"], np.ndarray)
    assert gran_layer["frame"].shape == (16, 16, 4)
    assert gran_layer["frame"].dtype == np.uint8


def test_reproduce_gap_documents_main_behavior(monkeypatch):
    """REPRODUCTION MARKER (task #87 oracle gate 1).

    On origin/main, engine/export.py has ZERO granulator consumers, so this
    assertion (granulator layer PRESENT) FAILS there — the documented gap. On the
    feat/b8-granulator-export-arm branch the arm is wired, so it PASSES. This test
    is the explicit before/after pin the PR references.
    """
    captured = _capture_composite(monkeypatch)
    _run_frame(_gran_perf(density=4))
    gran_layers = [
        layer
        for layer in captured[0]
        if str(layer.get("layer_id", "")).startswith("granulator:")
    ]
    assert len(gran_layers) == 1, (
        "granulator layer absent from export — the task #87 gap is NOT fixed "
        f"(layers: {[layer['layer_id'] for layer in captured[0]]})"
    )


def test_granulator_layer_opacity_and_blend_threaded(monkeypatch):
    captured = _capture_composite(monkeypatch)
    _run_frame(_gran_perf(density=4, opacity=0.5, blend_mode="screen"))
    gran = captured[0][1]
    assert gran["opacity"] == pytest.approx(0.5)
    assert gran["blend_mode"] == "screen"


def test_granulator_opacity_clamped_at_trust_boundary(monkeypatch):
    # A hostile opacity (>1 / NaN) is clamped to [0,1], never passed through raw.
    captured = _capture_composite(monkeypatch)
    perf = _gran_perf(density=4)
    perf["granulator"]["opacity"] = 5.0
    _run_frame(perf)
    assert captured[0][1]["opacity"] == pytest.approx(1.0)

    captured2 = _capture_composite(monkeypatch)
    perf2 = _gran_perf(density=4)
    perf2["granulator"]["opacity"] = float("nan")
    _run_frame(perf2)
    assert captured2[0][1]["opacity"] == pytest.approx(1.0)


# ===========================================================================
# GATE 3 — TRUST BOUNDARY: malformed payload rejected LOUDLY (no silent coerce)
# ===========================================================================


def test_density_over_max_grains_rejected(monkeypatch):
    _capture_composite(monkeypatch)
    perf = _gran_perf(density=MAX_GRAINS + 1)
    with pytest.raises(ValueError, match="MAX_GRAINS"):
        _run_frame(perf)


def test_reserved_selection_rejected(monkeypatch):
    _capture_composite(monkeypatch)
    perf = _gran_perf(selection="scenePayload")
    with pytest.raises(ValueError, match="reserved"):
        _run_frame(perf)


def test_unknown_render_path_rejected(monkeypatch):
    _capture_composite(monkeypatch)
    perf = _gran_perf(render_path="quantum")
    with pytest.raises(ValueError, match="render_path"):
        _run_frame(perf)


def test_negative_density_rejected(monkeypatch):
    _capture_composite(monkeypatch)
    perf = _gran_perf(density=-1)
    with pytest.raises(ValueError, match="non-negative"):
        _run_frame(perf)


# ===========================================================================
# GATE 4 — DETERMINISM: two renders of the same project are byte-identical
# ===========================================================================


def _grain_frame(monkeypatch, perf, *, frame_index=0, project_seed=7) -> np.ndarray:
    captured = _capture_composite(monkeypatch)
    _run_frame(perf, frame_index=frame_index, project_seed=project_seed)
    gran = next(
        layer
        for layer in captured[0]
        if str(layer.get("layer_id", "")).startswith("granulator:")
    )
    return gran["frame"]


def _sha256_arr(a: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def test_export_grain_layer_deterministic_two_runs(monkeypatch):
    f1 = _grain_frame(monkeypatch, _gran_perf(density=16))
    f2 = _grain_frame(monkeypatch, _gran_perf(density=16))
    assert _sha256_arr(f1) == _sha256_arr(f2), (
        "two exports of the same granulator project are not byte-identical"
    )


def test_export_grain_layer_changes_with_seed(monkeypatch):
    # Different project_seed → different seeded grain cloud → different layer.
    f_a = _grain_frame(monkeypatch, _gran_perf(density=16), project_seed=1)
    f_b = _grain_frame(monkeypatch, _gran_perf(density=16), project_seed=2)
    assert _sha256_arr(f_a) != _sha256_arr(f_b)


# ===========================================================================
# GATE 5 — RENDER_PATH: 'gpu' must NOT crash export (CPU-fallback / coercion)
# ===========================================================================


def test_gpu_render_path_does_not_crash_export(monkeypatch):
    # Export runs headless/CPU. render_path='gpu' must be coerced to CPU by the
    # dispatcher (is_export=True) and NEVER crash — mirroring preview's graceful
    # path. The grain layer is still produced (ONE layer out).
    captured = _capture_composite(monkeypatch)
    _run_frame(_gran_perf(density=8, render_path="gpu"))
    gran = [
        layer
        for layer in captured[0]
        if str(layer.get("layer_id", "")).startswith("granulator:")
    ]
    assert len(gran) == 1
    assert isinstance(gran[0]["frame"], np.ndarray)


def test_gpu_and_cpu_render_paths_byte_identical_in_export(monkeypatch):
    # Under is_export=True the dispatcher coerces gpu→cpu, so the two render_path
    # values must yield the SAME deterministic grain layer (determinism guarantee).
    f_cpu = _grain_frame(monkeypatch, _gran_perf(density=16, render_path="cpu"))
    f_gpu = _grain_frame(monkeypatch, _gran_perf(density=16, render_path="gpu"))
    assert _sha256_arr(f_cpu) == _sha256_arr(f_gpu)


# ===========================================================================
# GATE 6 — MAX_GRAINS cap honored (density at the cap renders; over the cap rejects)
# ===========================================================================


def test_density_at_cap_renders(monkeypatch):
    captured = _capture_composite(monkeypatch)
    _run_frame(_gran_perf(density=MAX_GRAINS))
    gran = [
        layer
        for layer in captured[0]
        if str(layer.get("layer_id", "")).startswith("granulator:")
    ]
    assert len(gran) == 1


# ===========================================================================
# EXPORT == PREVIEW parity (acceptance gate: per-pixel max abs delta <= 2/255)
# ===========================================================================


def test_export_grain_layer_matches_preview_render(monkeypatch):
    """export-vs-preview parity for the granulator layer: <= 2/255 per channel.

    The EXPORT arm (engine.export) and the PREVIEW arm (zmq_server) both route the
    granulator through the IDENTICAL pipeline: parse_granulator_layer →
    grain_cloud(seed, inst_id, anchor, params) → render_grain_layer_dispatch. The
    only intentional delta is is_export (export coerces gpu→cpu); for render_path
    'cpu' the two are byte-identical. This recomputes the preview grain layer with
    the SAME inputs the export arm uses (the contract source's public engine) and
    asserts the exported layer matches within the house tolerance.
    """
    from instruments.granulator_instrument import (
        grain_cloud,
        parse_granulator_layer,
        select_grain_weights,
    )
    from instruments.granulator_gpu import render_grain_layer_dispatch

    perf = _gran_perf(density=24, selection="random")
    project_seed = 7
    frame_index = 0

    # Export grain layer (the SHIPPING path).
    export_frame = _grain_frame(
        monkeypatch, perf, frame_index=frame_index, project_seed=project_seed
    )

    # Preview-equivalent grain layer (the contract engine, is_export=False).
    gran_raw = perf["granulator"]
    params, errors = parse_granulator_layer(gran_raw)
    assert not errors and params is not None
    inst_id = str(gran_raw["instrument_id"])[:128]
    anchor = 0  # base layer frame_index is 0 in the harness
    weights, _ = select_grain_weights(
        "random", project_seed, inst_id, anchor, params.density
    )
    cloud = grain_cloud(
        project_seed,
        inst_id,
        anchor,
        params,
        selection_weights=weights,
        selection_strength=0.0,
    )
    preview_frame = render_grain_layer_dispatch(
        _base_frame(),
        cloud,
        resolution=(16, 16),
        render_path="cpu",
        is_export=False,
        instance_id=inst_id,
    )

    delta = np.abs(export_frame.astype(np.int16) - preview_frame.astype(np.int16))
    assert int(delta.max()) <= 2, (
        f"export-vs-preview granulator max abs delta {int(delta.max())} > 2/255"
    )
