"""Kentaro Cluster operator — an 8-LFO cluster (P4.2).

A Kentaro Cluster bundles up to 8 sub-LFOs under one operator. Each sub-LFO is
evaluated by the SHARED ``evaluate_lfo`` waveform kernel (lfo.py) — this module
NEVER reimplements waveforms. The cluster adds, on top of the per-LFO config:

  * a shared ``master_rate_hz`` / ``master_depth`` mix that scales every sub-LFO,
  * optional ``bpm_sync`` (per-LFO ``rate_hz`` reinterpreted as *beats*, converted
    to Hz via the host BPM), and
  * a ``phase_reset`` counter — when it increments, every sub-LFO restarts its
    phase (achieved by offsetting ``frame_index`` to the reset frame).

Output contract (consumed by SignalEngine.evaluate_all, P4.2):
    ``evaluate_kentaro_cluster(...) -> (values, state_out)``
    where ``values`` is ``{'': master_mix, 'lfo0': v0, …, 'lfoN': vN}``.
    The engine stores the master ('' key) at ``values[op_id]`` and each sub-LFO at
    ``values[f"{op_id}/lfo{i}"]`` so routing can address a single sub-LFO via a
    mapping ``source_key``.

Trust boundary (numeric-trust-boundary rule): EVERY numeric param crossing in
(rates, depths, counts, bpm, phase, the per-LFO list) is type/NaN/Inf guarded.
Bad input degrades to a safe default (0.0 / clamp) and NEVER raises. A
``params['lfos']`` that is not a list yields an empty cluster (master 0.0).
"""

import math

from modulation.lfo import evaluate_lfo

MIN_LFO_COUNT = 2
MAX_LFO_COUNT = 8


def _finite(value: object, default: float) -> float:
    """Coerce *value* to a finite float, else *default*.

    Guards NaN/Inf and non-numeric/bool input — the single numeric trust gate
    every param in this module passes through.
    """
    if isinstance(value, bool):  # bool is an int subclass; reject explicitly.
        return default
    if not isinstance(value, (int, float)):
        return default
    f = float(value)
    if not math.isfinite(f):
        return default
    return f


def _finite_int(value: object, default: int) -> int:
    """Coerce *value* to a finite int, else *default* (NaN/Inf/bool/str safe)."""
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            return default
        return int(value)
    return default


def evaluate_kentaro_cluster(
    params: dict,
    frame_index: int,
    fps: float,
    bpm: float = 120.0,
    state_in: dict | None = None,
) -> tuple[dict[str, float], dict]:
    """Evaluate an 8-LFO Kentaro Cluster at *frame_index*.

    Args:
        params: Operator parameters. Recognized keys:
            ``lfos``: list of ≤8 per-LFO config dicts. Each may carry
                ``shape`` (waveform, default "sine"), ``rate_hz``,
                ``depth`` (0..1), ``phase`` (radians).
            ``lfo_count``: number of active sub-LFOs, clamped to [2, 8].
            ``master_rate_hz``: reserved shared rate (kept for parity / future
                master-LFO mixing; currently informs no waveform but is guarded).
            ``master_depth``: 0..1 scalar multiplying EVERY sub-LFO output and
                the master mix.
            ``bpm_sync``: when truthy, each sub-LFO ``rate_hz`` is interpreted as
                *beats* and converted to Hz: ``effective_hz = rate_beats * bpm/60``.
            ``phase_reset``: integer counter; any change restarts all phases.
        frame_index: Current frame number.
        fps: Frames per second.
        bpm: Host tempo (used only when ``bpm_sync`` is truthy). Guarded.
        state_in: Persistent per-cluster state. Per-LFO state is threaded as
            ``state['lfo{i}']`` sub-dicts (mirrors the engine's per-op pattern).

    Returns:
        ``(values, state_out)`` where ``values`` maps ``''`` -> master mix and
        ``'lfo{i}'`` -> that sub-LFO's scaled value (all in [0.0, 1.0]).
    """
    state = dict(state_in) if state_in else {}

    # --- guard the shared scalars (NaN/Inf/type → safe default) ---------------
    master_depth = _finite(params.get("master_depth", 1.0), 1.0)
    master_depth = max(0.0, min(1.0, master_depth))
    # master_rate_hz is guarded for parity even though it drives no waveform yet.
    _finite(params.get("master_rate_hz", 1.0), 1.0)
    safe_bpm = _finite(bpm, 120.0)
    if safe_bpm <= 0:
        safe_bpm = 120.0
    bpm_sync = bool(params.get("bpm_sync", False))

    # --- phase_reset: a change restarts every sub-LFO's phase -----------------
    # Implemented by anchoring the per-LFO frame counter to the frame at which
    # the reset last fired, so all sub-LFOs see frame 0 of their cycle there.
    reset_counter = _finite_int(params.get("phase_reset", 0), 0)
    last_reset_counter = state.get("_reset_counter")
    last_reset_frame = state.get("_reset_frame", 0)
    if last_reset_counter is None:
        # First evaluation: record the counter, no reset offset.
        state["_reset_counter"] = reset_counter
        state["_reset_frame"] = 0
    elif reset_counter != last_reset_counter:
        # Counter changed → restart phases as of THIS frame.
        state["_reset_counter"] = reset_counter
        state["_reset_frame"] = frame_index
        last_reset_frame = frame_index
    effective_frame = frame_index - last_reset_frame
    if effective_frame < 0:
        effective_frame = 0

    # --- per-LFO config list --------------------------------------------------
    lfos = params.get("lfos", [])
    if not isinstance(lfos, list):
        # Not a list → empty cluster, master 0.0, no crash.
        return {"": 0.0}, state

    # lfo_count clamps to [2, 8]; never exceeds the supplied list length.
    requested = _finite_int(params.get("lfo_count", len(lfos)), len(lfos))
    count = max(MIN_LFO_COUNT, min(MAX_LFO_COUNT, requested))
    count = min(count, len(lfos))  # can't evaluate more LFOs than configured

    values: dict[str, float] = {}
    sub_values: list[float] = []

    for i in range(count):
        cfg = lfos[i]
        if not isinstance(cfg, dict):
            cfg = {}

        waveform = cfg.get("shape", "sine")
        if not isinstance(waveform, str):
            waveform = "sine"

        rate_hz = _finite(cfg.get("rate_hz", 1.0), 1.0)
        if bpm_sync:
            # rate_hz interpreted as BEATS → Hz via host BPM.
            rate_hz = rate_hz * safe_bpm / 60.0

        phase = _finite(cfg.get("phase", 0.0), 0.0)
        depth = _finite(cfg.get("depth", 1.0), 1.0)
        depth = max(0.0, min(1.0, depth))

        lfo_state = state.get(f"lfo{i}", {})
        raw, lfo_state = evaluate_lfo(
            waveform=waveform,
            rate_hz=rate_hz,
            phase_offset=phase,
            frame_index=effective_frame,
            fps=fps,
            state_in=lfo_state,
        )
        state[f"lfo{i}"] = lfo_state if isinstance(lfo_state, dict) else {}

        # Master depth scales every sub-LFO output (and the master mix below).
        scaled = max(0.0, min(1.0, raw * depth * master_depth))
        values[f"lfo{i}"] = scaled
        sub_values.append(scaled)

    # Master mix: mean of the active sub-LFOs (already master_depth-scaled), so
    # master_depth scales the mix too. Empty → 0.0.
    master_mix = sum(sub_values) / len(sub_values) if sub_values else 0.0
    values[""] = max(0.0, min(1.0, master_mix))

    return values, state
