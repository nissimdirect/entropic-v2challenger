"""Signal routing — maps operator outputs to effect parameters."""

import copy
from collections import defaultdict, deque


def resolve_routings(
    operator_values: dict[str, float],
    operators: list[dict],
    chain: list[dict],
    effect_registry_fn=None,
) -> list[dict]:
    """Apply operator modulation values to an effect chain.

    Args:
        operator_values: Dict of operator_id -> current signal value (0.0-1.0).
        operators: List of operator configs (each has 'id', 'mappings', 'isEnabled').
        chain: The effect chain (list of dicts, snake_case backend format).
        effect_registry_fn: Optional callable(effect_id) -> effect info dict with params.

    Returns:
        Deep copy of chain with modulated parameter values.
    """
    modulated = copy.deepcopy(chain)

    # Build effect lookup by id.
    # F-0516-9: inject top-level `mix` into params as `_mix` so it can be a
    # modulation target. The container later pops `_mix` back out and uses it
    # for blend. pipeline.py defers to whatever value is already in params,
    # so routing-set `_mix` survives.
    effect_map: dict[str, dict] = {}
    for effect in modulated:
        eid = effect.get("effect_id", "")
        if eid:
            effect_map[eid] = effect
        params = effect.setdefault("params", {})
        if "_mix" not in params and "mix" in effect:
            params["_mix"] = effect["mix"]

    # Accumulate deltas per (effect_id, param_key)
    # Each entry: list of (value, depth, min, max, blend_mode)
    deltas: dict[tuple[str, str], list[tuple[float, float, float, float, str]]] = (
        defaultdict(list)
    )

    for op in operators:
        if not op.get("is_enabled", op.get("isEnabled", True)):
            continue
        op_id = op.get("id", "")
        signal = operator_values.get(op_id, 0.0)

        for mapping in op.get("mappings", []):
            target_effect = mapping.get(
                "target_effect_id", mapping.get("targetEffectId", "")
            )
            target_param = mapping.get(
                "target_param_key", mapping.get("targetParamKey", "")
            )
            depth = float(mapping.get("depth", 1.0))
            m_min = float(mapping.get("min", 0.0))
            m_max = float(mapping.get("max", 1.0))
            blend = mapping.get("blend_mode", mapping.get("blendMode", "add"))

            if not target_effect or not target_param:
                continue

            deltas[(target_effect, target_param)].append(
                (signal, depth, m_min, m_max, blend)
            )

    # Apply accumulated deltas
    for (effect_id, param_key), contributions in deltas.items():
        if effect_id not in effect_map:
            continue
        effect = effect_map[effect_id]
        params = effect.get("params", {})
        base_value = params.get(param_key)
        if base_value is None:
            continue
        if not isinstance(base_value, (int, float)):
            continue

        # Get param bounds from registry if available
        param_min, param_max = _get_param_bounds(
            effect.get("effect_id", ""), param_key, effect_registry_fn
        )

        # Compute modulation value based on blend mode
        mod_value = _blend_contributions(contributions)

        # Apply: base + modulated offset within param bounds
        param_range = param_max - param_min
        new_value = base_value + mod_value * param_range
        new_value = max(param_min, min(param_max, new_value))
        params[param_key] = new_value

    return modulated


def _blend_contributions(
    contributions: list[tuple[float, float, float, float, str]],
) -> float:
    """Blend multiple operator contributions to the same param."""
    if not contributions:
        return 0.0

    # Group by blend mode
    values_by_mode: dict[str, list[float]] = defaultdict(list)
    for signal, depth, m_min, m_max, blend in contributions:
        # Map signal through min/max range, then scale by depth
        mapped = m_min + signal * (m_max - m_min)
        scaled = mapped * depth
        values_by_mode[blend].append(scaled)

    # Compute per-mode results then combine additively
    result = 0.0
    for mode, values in values_by_mode.items():
        if mode == "add":
            result += sum(values)
        elif mode == "multiply":
            product = 1.0
            for v in values:
                product *= v
            result += product
        elif mode == "max":
            result += max(values)
        elif mode == "min":
            result += min(values)
        elif mode == "average":
            result += sum(values) / len(values)
        else:
            result += sum(values)

    return result


def _get_param_bounds(
    effect_id: str, param_key: str, registry_fn=None
) -> tuple[float, float]:
    """Get min/max bounds for an effect parameter."""
    # F-0516-9: _mix is a synthetic param that lives on the EffectInstance,
    # not in info.params. Hard-code its [0.0, 1.0] range.
    if param_key == "_mix":
        return 0.0, 1.0
    if registry_fn:
        info = registry_fn(effect_id)
        if info and "params" in info:
            param_def = info["params"].get(param_key, {})
            return (
                float(param_def.get("min", 0.0)),
                float(param_def.get("max", 1.0)),
            )
    return 0.0, 1.0


def check_cycle(routings: list[tuple[str, str]], new_edge: tuple[str, str]) -> bool:
    """Check if adding new_edge would create a cycle in the routing DAG.

    Args:
        routings: Existing edges as (source, target) pairs.
        new_edge: Proposed new edge (source, target).

    Returns:
        True if adding the edge would create a cycle (invalid).
    """
    # Build adjacency list
    adj: dict[str, list[str]] = defaultdict(list)
    for src, tgt in routings:
        adj[src].append(tgt)
    # Add proposed edge
    adj[new_edge[0]].append(new_edge[1])

    # BFS from new_edge target — if we can reach new_edge source, it's a cycle
    visited = set()
    queue = deque([new_edge[1]])
    while queue:
        node = queue.popleft()
        if node == new_edge[0]:
            return True
        if node in visited:
            continue
        visited.add(node)
        for neighbor in adj.get(node, []):
            queue.append(neighbor)

    return False
