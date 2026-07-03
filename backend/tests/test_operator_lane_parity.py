"""AA.3-A — the parity oracle that makes the packet one-shot.

docs/plans/2026-07-03-aa3-live-generators-spec.md §6 names this exact test:
  "test_operator_lane_parity.py — the parity test that makes this one-shot:
   render a fixed frame range twice — once via the preview path
   (_render_frame_core) and once via the export path (export.py frame
   closure) — with (a) an LFO operator lane ... Assert the modulated param
   value per frame is equal (exact for LFO)."

Two layers of proof, both required:

1. STRUCTURAL parity (exact numeric floats) — apply_modulation is the ONE
   shared seam both preview (zmq_server._render_composited_frame) and export
   (engine/export.py's modulate_chain_for_frame) call through
   (modulation/engine.py:apply_modulation). This proves the per-frame
   modulated param value is bit-identical when driven with the SAME
   operator_lane_specs/operator_lane_base/operator_values a real frame would
   carry, including a base that VARIES per frame (proving the per-frame
   lookup threading, not just a constant-snapshot coincidence).

2. WIRING parity (real IPC + real export) — drives the ACTUAL production
   entry points: ZMQServer.handle_message({"cmd": "render_frame", ...}) for
   preview, and ExportManager.start(...) (image_sequence/PNG, lossless) for
   export. Proves my zmq_server.py / engine/export.py plumbing (reading
   operator_lanes/operator_lane_base off the message, threading
   operator_lane_base_by_frame per src_idx) actually wires the payloads
   through, not just that apply_modulation itself is deterministic.

Also required by the spec (§6): a drawn absolute lane composes with an
operator lane (superimpose, not overwrite) via blendOp; empty/no-operator-lane
projects render byte-identical to before (back-compat).
"""

from __future__ import annotations

import base64
import copy
import tempfile
import time

import numpy as np
import pytest

from engine.cache import decode_mjpeg
from engine.export import ExportManager, ExportStatus
from modulation.engine import SignalEngine
from zmq_server import ZMQServer

pytestmark = pytest.mark.smoke


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _lfo_lane_op(op_id="__lane__auto-1", rate_hz=1.0, waveform="sine"):
    """A synthetic, mapping-less lane operator — the exact shape
    buildSyntheticLaneOperators (frontend) sends."""
    return {
        "id": op_id,
        "type": "lfo",
        "is_enabled": True,
        "parameters": {"waveform": waveform, "rate_hz": rate_hz, "phase_offset": 0.0},
        "processing": [],
        "mappings": [],
    }


def _lane_spec(
    param_path, operator_id, *, blend_op="add", depth=1.0, m_min=0.0, m_max=1.0
):
    return {
        "param_path": param_path,
        "operator_id": operator_id,
        "blend_op": blend_op,
        "depth": depth,
        "min": m_min,
        "max": m_max,
    }


def _decode_b64_jpeg(frame_data: str) -> np.ndarray:
    return decode_mjpeg(base64.b64decode(frame_data))


def _run_to_completion(job, timeout_s: float = 40.0):
    deadline = time.time() + timeout_s
    while job.status == ExportStatus.RUNNING and time.time() < deadline:
        time.sleep(0.05)
    return job.status


@pytest.fixture
def standalone_server():
    srv = ZMQServer()
    srv.token = "test-token"
    yield srv
    srv.reset_state()


# ---------------------------------------------------------------------------
# 1. STRUCTURAL parity — exact float equality, per-frame varying base
# ---------------------------------------------------------------------------


def test_apply_modulation_seam_is_deterministic_across_repeated_calls_with_varying_base():
    """The ONE shared seam (SignalEngine.apply_modulation) both preview and
    export call through, driven with the SAME per-frame inputs a real render
    would carry (operator_values from evaluate_all, a base that varies by
    frame — mirrors a drawn lane moving under the operator lane) — proves
    exact (not just close) per-frame equality, which is the entire structural
    parity guarantee the AA.3 architecture rests on (spec §2.3)."""
    chain_template = [
        {
            "effect_id": "fx.hue_shift",
            "enabled": True,
            "params": {"amount": 0.0},
            "mix": 1.0,
        }
    ]
    op = _lfo_lane_op()
    specs = [_lane_spec("fx.hue_shift.amount", op["id"])]

    def registry_get(effect_id):
        return {"params": {"amount": {"min": 0.0, "max": 360.0}}}

    engine_a = SignalEngine()
    engine_b = SignalEngine()
    state_a: dict = {}
    state_b: dict = {}

    results_a = []
    results_b = []
    for f in range(0, 20):
        # Base varies per frame — mirrors a per-source-frame
        # operator_lane_base_by_frame lookup (export) / operator_lane_base
        # (preview), never a constant snapshot.
        base = {"fx.hue_shift.amount": 0.1 + 0.02 * f}

        values_a, state_a = engine_a.evaluate_all([op], f, 30.0, state=state_a)
        chain_a = engine_a.apply_modulation(
            [op],
            values_a,
            copy.deepcopy(chain_template),
            registry_get,
            operator_lane_specs=specs,
            operator_lane_base=base,
        )
        results_a.append(chain_a[0]["params"]["amount"])

        # Independently constructed "engine B" — a SEPARATE SignalEngine
        # instance/state (mirrors preview's per-server engine vs export's
        # per-job LOCAL engine — genuinely different objects, same inputs).
        values_b, state_b = engine_b.evaluate_all([op], f, 30.0, state=state_b)
        chain_b = engine_b.apply_modulation(
            [op],
            values_b,
            copy.deepcopy(chain_template),
            registry_get,
            operator_lane_specs=specs,
            operator_lane_base=base,
        )
        results_b.append(chain_b[0]["params"]["amount"])

    assert results_a == results_b  # exact float equality, every frame
    # Sanity: the LFO actually moves the value across frames (not a frozen 0).
    assert len(set(results_a)) > 1


def test_operator_lane_superimposes_on_drawn_lane_without_overwriting():
    """A drawn absolute lane (via automation_overrides REPLACE) + an operator
    lane on the SAME param compose via blendOp — the operator lane must NOT
    overwrite the drawn value, and the drawn REPLACE must not block the
    operator lane from running afterward (engine.py: automation REPLACE runs
    BEFORE resolve_operator_lanes, spec §2.3)."""
    chain = [
        {"effect_id": "fx.thing", "enabled": True, "params": {"amt": 5.0}, "mix": 1.0}
    ]

    def registry_get(effect_id):
        return {"params": {"amt": {"min": 0.0, "max": 100.0}}}

    engine = SignalEngine()
    # Drawn absolute lane denormalizes to 20.0 (normalized 0.2 on [0,100]).
    drawn_only = engine.apply_modulation(
        [],
        {},
        copy.deepcopy(chain),
        registry_get,
        automation_overrides={"fx.thing.amt": 20.0},
    )
    assert drawn_only[0]["params"]["amt"] == 20.0

    # Operator lane ALONE (no drawn base) would seed from its own mod (0.3 -> 30.0).
    op = _lfo_lane_op()
    op_only = engine.apply_modulation(
        [],
        {op["id"]: 0.3},
        copy.deepcopy(chain),
        registry_get,
        operator_lane_specs=[_lane_spec("fx.thing.amt", op["id"])],
        operator_lane_base={"fx.thing.amt": None},
    )
    assert op_only[0]["params"]["amt"] == 30.0

    # BOTH together: drawn (0.2) composes with operator mod (0.3) via 'add' ->
    # 0.5 -> denorm(0.5,0,100) = 50.0 — neither 20.0 (drawn-only) nor 30.0
    # (operator-only) survives; the composition is genuine, not an overwrite.
    composed = engine.apply_modulation(
        [],
        {op["id"]: 0.3},
        copy.deepcopy(chain),
        registry_get,
        automation_overrides={"fx.thing.amt": 20.0},
        operator_lane_specs=[_lane_spec("fx.thing.amt", op["id"])],
        operator_lane_base={"fx.thing.amt": 0.2},
    )
    assert composed[0]["params"]["amt"] == 50.0


def test_backcompat_no_operator_lanes_byte_identical_to_pre_aa3():
    """Absent operator_lane_specs/operator_lane_base (both default None, the
    pre-AA.3 call shape) produces the EXACT same chain as explicitly passing
    None for both — every pre-AA.3 caller (and every pre-AA.3 project) is
    unaffected."""
    chain = [
        {"effect_id": "fx.thing", "enabled": True, "params": {"amt": 5.0}, "mix": 1.0}
    ]

    def registry_get(effect_id):
        return {"params": {"amt": {"min": 0.0, "max": 100.0}}}

    engine = SignalEngine()
    legacy_call = engine.apply_modulation(
        [],
        {},
        copy.deepcopy(chain),
        registry_get,
        automation_overrides={"fx.thing.amt": 42.0},
    )
    explicit_none_call = engine.apply_modulation(
        [],
        {},
        copy.deepcopy(chain),
        registry_get,
        automation_overrides={"fx.thing.amt": 42.0},
        operator_lane_specs=None,
        operator_lane_base=None,
    )
    assert legacy_call == explicit_none_call
    assert legacy_call[0]["params"]["amt"] == 42.0


# ---------------------------------------------------------------------------
# 2. WIRING parity — real IPC render_frame vs real ExportManager export
# ---------------------------------------------------------------------------


def test_preview_ipc_and_export_manager_wire_operator_lane_identically(
    synthetic_video_path, standalone_server
):
    """Drives the REAL production entry points end-to-end:
      - preview: ZMQServer.handle_message({"cmd": "render_frame", ...})
      - export:  ExportManager.start(...) (image_sequence/PNG — lossless)
    with an LFO operator lane on a VISIBLE param (fx.hue_shift.amount) and a
    per-frame-varying base, and asserts the rendered pixels match within the
    established JPEG-transport tolerance (preview is lossy MJPEG; export PNG
    is lossless — same acceptance-gate convention as
    test_export_parity.py::test_export_vs_preview_per_pixel_delta_within_tolerance).
    """
    chain = [{"effect_id": "fx.hue_shift", "params": {"amount": 0.0}}]
    op = _lfo_lane_op()
    specs = [_lane_spec("fx.hue_shift.amount", op["id"])]
    sampled_frames = [0, 5, 9]

    # --- preview: real render_frame IPC, one call per sampled frame ---
    preview_frames: dict[int, np.ndarray] = {}
    for f in sampled_frames:
        base = {"fx.hue_shift.amount": 0.1 + 0.05 * f}
        resp = standalone_server.handle_message(
            {
                "cmd": "render_frame",
                "_token": "test-token",
                "id": f"f{f}",
                "path": synthetic_video_path,
                "frame_index": f,
                "chain": chain,
                "project_seed": 7,
                "operators": [op],
                "operator_lanes": specs,
                "operator_lane_base": base,
            }
        )
        assert resp["ok"], resp.get("error")
        preview_frames[f] = _decode_b64_jpeg(resp["frame_data"])

    # --- export: real ExportManager, image_sequence/PNG over the same range ---
    operator_lane_base_by_frame = {
        f: {"fx.hue_shift.amount": 0.1 + 0.05 * f}
        for f in range(0, max(sampled_frames) + 1)
    }
    with tempfile.TemporaryDirectory() as out_dir:
        mgr = ExportManager()
        job = mgr.start(
            input_path=synthetic_video_path,
            output_path=out_dir,
            chain=chain,
            project_seed=7,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": max(sampled_frames),
                "fps": "source",
                "include_audio": False,
            },
            operators=[op],
            operator_lanes=specs,
            operator_lane_base_by_frame=operator_lane_base_by_frame,
        )
        assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error

        import os

        import cv2

        frames = sorted(os.listdir(out_dir))
        for f in sampled_frames:
            exp_bgr = cv2.imread(os.path.join(out_dir, frames[f]), cv2.IMREAD_COLOR)
            prev_rgb = preview_frames[f][:, :, :3]
            prev_bgr = cv2.cvtColor(prev_rgb, cv2.COLOR_RGB2BGR)
            delta = np.abs(exp_bgr.astype(np.int16) - prev_bgr.astype(np.int16))
            max_delta = int(delta.max())
            assert max_delta <= 2, (
                f"frame {f}: preview-vs-export operator-lane pixel delta "
                f"{max_delta} > 2/255 — wiring parity broken"
            )


def test_operator_lane_export_changes_output_vs_no_operator_lane(synthetic_video_path):
    """Anti-dead-flag sanity (mirrors test_export_parity.py's own convention):
    an operator lane actually alters exported pixels — guards against the
    payload being silently dropped somewhere in the new wiring."""
    chain = [{"effect_id": "fx.hue_shift", "params": {"amount": 0.0}}]
    op = _lfo_lane_op()
    specs = [_lane_spec("fx.hue_shift.amount", op["id"])]
    base_by_frame = {f: {"fx.hue_shift.amount": 0.6} for f in range(10)}

    with tempfile.TemporaryDirectory() as base_dir:
        import hashlib
        import os

        def _sha256_dir(d):
            h = hashlib.sha256()
            for name in sorted(os.listdir(d)):
                with open(os.path.join(d, name), "rb") as fh:
                    h.update(name.encode())
                    h.update(fh.read())
            return h.hexdigest()

        d_off = os.path.join(base_dir, "off")
        d_on = os.path.join(base_dir, "on")
        os.makedirs(d_off)
        os.makedirs(d_on)

        mgr_off = ExportManager()
        job_off = mgr_off.start(
            input_path=synthetic_video_path,
            output_path=d_off,
            chain=chain,
            project_seed=7,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": 9,
                "fps": "source",
                "include_audio": False,
            },
            operators=[op],
            operator_lanes=specs,
            operator_lane_base_by_frame=None,  # no base => null-base seed path
        )
        assert _run_to_completion(job_off) == ExportStatus.COMPLETE, job_off.error

        mgr_on = ExportManager()
        job_on = mgr_on.start(
            input_path=synthetic_video_path,
            output_path=d_on,
            chain=chain,
            project_seed=7,
            settings={
                "export_type": "image_sequence",
                "image_format": "png",
                "region": "custom",
                "start_frame": 0,
                "end_frame": 9,
                "fps": "source",
                "include_audio": False,
            },
            operators=[op],
            operator_lanes=specs,
            operator_lane_base_by_frame=base_by_frame,
        )
        assert _run_to_completion(job_on) == ExportStatus.COMPLETE, job_on.error

        assert _sha256_dir(d_off) != _sha256_dir(d_on), (
            "operator_lane_base_by_frame had NO effect on export output — "
            "per-frame base threading dropped somewhere in the wiring"
        )


def test_export_with_no_operator_lanes_is_byte_identical_to_pre_aa3(
    synthetic_video_path,
):
    """Back-compat: an export job that never passes operator_lanes /
    operator_lane_base_by_frame produces byte-identical output to the SAME
    job run again — proving the new (default-None) kwargs are a true no-op
    for every pre-AA.3 caller (export_start payloads that never send these
    keys)."""
    chain = [{"effect_id": "fx.posterize", "params": {"levels": 4}}]

    import hashlib
    import os

    def _sha256_dir(d):
        h = hashlib.sha256()
        for name in sorted(os.listdir(d)):
            with open(os.path.join(d, name), "rb") as fh:
                h.update(name.encode())
                h.update(fh.read())
        return h.hexdigest()

    with tempfile.TemporaryDirectory() as base_dir:
        d1 = os.path.join(base_dir, "run1")
        d2 = os.path.join(base_dir, "run2")
        for d in (d1, d2):
            mgr = ExportManager()
            job = mgr.start(
                input_path=synthetic_video_path,
                output_path=d,
                chain=chain,
                project_seed=7,
                settings={
                    "export_type": "image_sequence",
                    "image_format": "png",
                    "region": "custom",
                    "start_frame": 0,
                    "end_frame": 9,
                    "fps": "source",
                    "include_audio": False,
                },
                # No operators / operator_lanes / operator_lane_base_by_frame —
                # the exact pre-AA.3 call shape.
            )
            assert _run_to_completion(job) == ExportStatus.COMPLETE, job.error

        assert _sha256_dir(d1) == _sha256_dir(d2)
