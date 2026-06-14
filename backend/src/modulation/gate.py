"""Gate operator — threshold the value of a source operator (P4.3).

A gate reads ONE source operator's current value (via the same
``parameters.sources[].operator_id`` pattern Fusion uses — see fusion.py) and
emits a binary signal: 1.0 when the source is above the threshold, else 0.0.

Optional ``hysteresis`` widens the threshold into a two-level band to prevent
flutter (rapid 0/1 toggling) when the source oscillates around the threshold:
the gate OPENS at ``threshold + hysteresis/2`` and only CLOSES once the source
falls below ``threshold - hysteresis/2``. The open/closed state is latched in
``state`` between frames.

Trust boundary (numeric-trust-boundary rule): ``threshold`` and ``hysteresis``
are type/NaN/Inf guarded; a NaN/Inf source value or threshold degrades to a
closed gate (0.0) and NEVER raises. A missing/empty/dangling source → 0.0.
"""

import math

DEFAULT_HYSTERESIS = 0.0


def _finite(value: object, default: float) -> float:
    """Coerce *value* to a finite float, else *default* (NaN/Inf/bool/type safe)."""
    if isinstance(value, bool):  # bool is an int subclass; reject explicitly.
        return default
    if not isinstance(value, (int, float)):
        return default
    f = float(value)
    if not math.isfinite(f):
        return default
    return f


def evaluate_gate(
    params: dict,
    operator_values: dict[str, float],
    state_in: dict | None = None,
) -> tuple[float, dict]:
    """Evaluate a gate at a given frame.

    Args:
        params: Operator parameters. Recognized keys:
            ``sources``: list of {operator_id: str, ...} dicts — the FIRST entry's
                ``operator_id`` names the source operator (Fusion read pattern).
            ``threshold``: open/close threshold (default 0.5). NaN/Inf → 0.0 out.
            ``hysteresis``: band width (default 0.0). NaN/Inf/negative → 0.0.
        operator_values: Current signal values keyed by operator ID (the engine's
            already-evaluated ``values`` dict; the gate must be ordered AFTER its
            source by the toposort).
        state_in: Persistent state (latches the open/closed gate state).

    Returns:
        (value, state_out) where value is exactly 0.0 or 1.0.
    """
    state = dict(state_in) if state_in else {}

    # --- read the source operator value (Fusion's sources[].operator_id read) -
    sources = params.get("sources", [])
    if not isinstance(sources, list) or not sources:
        state["_open"] = False
        return 0.0, state
    first = sources[0]
    op_id = first.get("operator_id", "") if isinstance(first, dict) else ""
    source_value = operator_values.get(op_id, 0.0)
    source_value = _finite(source_value, 0.0)

    # --- numeric trust gate: threshold + hysteresis ---------------------------
    threshold = _finite(params.get("threshold", 0.5), 0.5)
    hysteresis = _finite(
        params.get("hysteresis", DEFAULT_HYSTERESIS), DEFAULT_HYSTERESIS
    )
    if hysteresis < 0:
        hysteresis = 0.0

    open_level = threshold + hysteresis / 2.0
    close_level = threshold - hysteresis / 2.0

    was_open = bool(state.get("_open", False))
    if was_open:
        # Stay open until the source drops below the lower band edge.
        is_open = source_value > close_level
    else:
        # Stay closed until the source rises above the upper band edge.
        is_open = source_value > open_level

    state["_open"] = is_open
    return (1.0 if is_open else 0.0), state
