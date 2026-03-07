"""Fusion operator — weighted blend of 2+ operator signals.

Combines multiple source signals using configurable weights and blend mode.
Sources reference other operators by ID. If a source is missing or disabled,
it contributes 0.0.
"""

import math


def evaluate_fusion(
    sources: list[dict],
    operator_values: dict[str, float],
    blend_mode: str = "weighted_average",
) -> float:
    """Evaluate a fusion of multiple operator signals.

    Args:
        sources: List of {operator_id: str, weight: float} dicts.
        operator_values: Current signal values keyed by operator ID.
        blend_mode: One of 'weighted_average', 'max', 'min', 'multiply', 'add'.

    Returns:
        Blended value clamped to 0.0-1.0.
    """
    if not sources:
        return 0.0

    values_weights: list[tuple[float, float]] = []
    for src in sources:
        op_id = src.get("operator_id", "")
        weight = float(src.get("weight", 1.0))
        if math.isnan(weight) or math.isinf(weight):
            weight = 1.0
        val = operator_values.get(op_id, 0.0)
        if math.isnan(val) or math.isinf(val):
            val = 0.0
        values_weights.append((val, weight))

    if not values_weights:
        return 0.0

    if blend_mode == "weighted_average":
        total_weight = sum(w for _, w in values_weights)
        if total_weight <= 0:
            return 0.0
        result = sum(v * w for v, w in values_weights) / total_weight
    elif blend_mode == "max":
        result = max(v * w for v, w in values_weights)
    elif blend_mode == "min":
        result = min(v * w for v, w in values_weights)
    elif blend_mode == "multiply":
        result = 1.0
        for v, w in values_weights:
            result *= v * w
    elif blend_mode == "add":
        result = sum(v * w for v, w in values_weights)
    else:
        # Default to weighted average
        total_weight = sum(w for _, w in values_weights)
        if total_weight <= 0:
            return 0.0
        result = sum(v * w for v, w in values_weights) / total_weight

    if math.isnan(result) or math.isinf(result):
        return 0.0

    return max(0.0, min(1.0, result))
