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


# --------------------------------------------------------------------------- #
#  MK.8 — key-params-as-lanes: resolve `mask.<node_id>.<param>` modulation
# --------------------------------------------------------------------------- #

# Lane-addressable key params → (min, max) bounds for the base+offset map. These
# mirror the shipped key effects' PARAMS ranges (DO-NOT-TOUCH; sourced from
# masking.key_kernels). `mode` (luma choice) is intentionally NOT lane-able.
_KEY_PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "hue": (0.0, 360.0),
    "tolerance": (1.0, 180.0),
    "softness": (0.0, 50.0),
    "spill": (0.0, 1.0),
    "threshold": (0.0, 1.0),
}

# Per-kind allowlist of which params may be modulated (defends against a stray
# `mask.<node>.mode` or a param that doesn't belong to the node's kind).
_KEY_LANE_PARAMS_BY_KIND: dict[str, frozenset[str]] = {
    "chroma_key": frozenset({"hue", "tolerance", "softness", "spill"}),
    "luma_key": frozenset({"threshold", "softness"}),
}


def resolve_mask_modulations(
    operator_values: dict[str, float],
    operators: list[dict],
    mask_stack: list[dict] | None,
) -> list[dict] | None:
    """Apply operator modulation to key-node params in *mask_stack* (MK.8).

    Recognizes modulation targets of the form ``mask.<node_id>.<param>`` and
    writes the resolved (LFO / sidechain / beat-gated) value into the matching
    MatteNode's ``params[<param>]`` — so the modulated value feeds the chroma/
    luma kernel THAT frame, BEFORE inject_device_masks / resolve_chain_mask
    rasterize the mattes.

    Trust boundary (same discipline as MK.3): a target whose prefix isn't
    ``mask``, whose node_id isn't in the stack, or whose param isn't lane-able
    for that node's kind is SKIPPED — never raises. node_id parsing is safe to
    split on '.' because MK.1's schema id regex forbids dots
    (``^[A-Za-z0-9_-]{1,64}$``), so ``target.split('.', 2)`` is unambiguous.

    Returns a deep-copied, modulated mask_stack (or the input unchanged when
    there is nothing to modulate / no mask_stack).
    """
    if not mask_stack or not isinstance(mask_stack, list):
        return mask_stack

    # Build node lookup by id (only dict nodes with a string id count).
    node_map: dict[str, dict] = {}
    for node in mask_stack:
        if isinstance(node, dict):
            nid = node.get("id")
            if isinstance(nid, str):
                node_map[nid] = node

    if not node_map:
        return mask_stack

    # Accumulate deltas per (node_id, param) — reuse the chain blend semantics.
    deltas: dict[tuple[str, str], list[tuple[float, float, float, float, str]]] = (
        defaultdict(list)
    )

    for op in operators:
        if not op.get("is_enabled", op.get("isEnabled", True)):
            continue
        signal = operator_values.get(op.get("id", ""), 0.0)

        for mapping in op.get("mappings", []):
            target = mapping.get("target_param_key", mapping.get("targetParamKey", ""))
            if not target or not target.startswith("mask."):
                continue
            # mask.<node_id>.<param> — split into exactly 3 (node ids have no dots).
            parts = target.split(".", 2)
            if len(parts) != 3 or parts[0] != "mask":
                continue
            _, node_id, param = parts
            if node_id not in node_map or not param:
                continue

            depth = float(mapping.get("depth", 1.0))
            m_min = float(mapping.get("min", 0.0))
            m_max = float(mapping.get("max", 1.0))
            blend = mapping.get("blend_mode", mapping.get("blendMode", "add"))
            deltas[(node_id, param)].append((signal, depth, m_min, m_max, blend))

    if not deltas:
        return mask_stack

    modulated = copy.deepcopy(mask_stack)
    # Rebuild the lookup against the COPY so we mutate the returned structure.
    copy_map: dict[str, dict] = {}
    for node in modulated:
        if isinstance(node, dict) and isinstance(node.get("id"), str):
            copy_map[node["id"]] = node

    for (node_id, param), contributions in deltas.items():
        node = copy_map.get(node_id)
        if node is None:
            continue
        kind = node.get("kind", "")
        allowed = _KEY_LANE_PARAMS_BY_KIND.get(kind)
        if allowed is None or param not in allowed:
            continue  # not a key node, or param not lane-able for this kind

        params = node.setdefault("params", {})
        if not isinstance(params, dict):
            continue
        # Base value: the param's current value, else the param's range min.
        p_min, p_max = _KEY_PARAM_BOUNDS.get(param, (0.0, 1.0))
        base_value = params.get(param)
        if not isinstance(base_value, (int, float)):
            base_value = p_min

        mod_value = _blend_contributions(contributions)
        new_value = base_value + mod_value * (p_max - p_min)
        params[param] = max(p_min, min(p_max, new_value))

    return modulated


# --------------------------------------------------------------------------- #
#  B3.2 — sampler-params-as-lanes: resolve `sampler.<id>.<param>` modulation
# --------------------------------------------------------------------------- #

# Lane-addressable sampler params → (min, max) bounds for the base+offset map.
# `scrub` is a normalized playhead position [0,1] across the sampler's range;
# `speed` mirrors SAMPLER_SPEED_MIN/MAX (types.ts) and the export clamp.
_SAMPLER_PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "scrub": (0.0, 1.0),
    "speed": (-8.0, 8.0),
}

# Only these params may be modulated. Anything else (clipId, opacity, loop, …)
# is NOT lane-able and is SKIPPED — never raises.
_SAMPLER_LANE_PARAMS: frozenset[str] = frozenset({"scrub", "speed"})


def resolve_sampler_modulations(
    operator_values: dict[str, float],
    operators: list[dict],
    instruments: dict[str, dict] | None,
) -> dict[str, dict] | None:
    """Apply operator modulation to sampler params in *instruments* (B3.2).

    Recognizes modulation targets of the form ``sampler.<id>.<param>`` and
    writes the resolved (LFO / envelope / velocity) value into the matching
    sampler instrument's ``scrub`` / ``speed`` for THAT frame — so the modulated
    value feeds the footage-frame computation (``_compute_voice_footage_frame``)
    BEFORE the consumer decodes the frame. This mirrors MK.8's
    ``resolve_mask_modulations`` exactly.

      * ``scrub`` → a normalized playhead position in [0, 1] across the sampler's
        playable range ([loopIn, loopOut] when looping, else [startFrame,
        endFrame|lastFrame]). The footage-frame math maps it onto a frame index.
      * ``speed`` → the resolved value REPLACES the sampler's base playback speed
        for the frame (base + modulated offset within [-8, 8]).

    Trust boundary (same discipline as MK.8 / MK.3): a target whose prefix isn't
    ``sampler``, whose id isn't a live sampler instrument, or whose param isn't
    ``scrub``/``speed`` is SKIPPED — never raises. ``id`` parsing is safe to
    split on '.' because sampler ids match ``^[A-Za-z0-9_-]`` (MK.1 schema id
    regex forbids dots), so ``target.split('.', 2)`` is unambiguous.

    Returns a deep-copied, modulated instruments dict (or the input unchanged
    when there is nothing to modulate / no instruments).
    """
    if not instruments or not isinstance(instruments, dict):
        return instruments

    # Accumulate deltas per (inst_id, param) — reuse the chain blend semantics.
    deltas: dict[tuple[str, str], list[tuple[float, float, float, float, str]]] = (
        defaultdict(list)
    )

    for op in operators:
        if not op.get("is_enabled", op.get("isEnabled", True)):
            continue
        signal = operator_values.get(op.get("id", ""), 0.0)

        for mapping in op.get("mappings", []):
            target = mapping.get("target_param_key", mapping.get("targetParamKey", ""))
            if not target or not target.startswith("sampler."):
                continue
            # sampler.<id>.<param> — split into exactly 3 (ids have no dots).
            parts = target.split(".", 2)
            if len(parts) != 3 or parts[0] != "sampler":
                continue
            _, inst_id, param = parts
            if inst_id not in instruments or param not in _SAMPLER_LANE_PARAMS:
                continue

            depth = float(mapping.get("depth", 1.0))
            m_min = float(mapping.get("min", 0.0))
            m_max = float(mapping.get("max", 1.0))
            blend = mapping.get("blend_mode", mapping.get("blendMode", "add"))
            deltas[(inst_id, param)].append((signal, depth, m_min, m_max, blend))

    if not deltas:
        return instruments

    modulated = copy.deepcopy(instruments)

    for (inst_id, param), contributions in deltas.items():
        inst = modulated.get(inst_id)
        if not isinstance(inst, dict):
            continue

        p_min, p_max = _SAMPLER_PARAM_BOUNDS.get(param, (0.0, 1.0))
        # Base value: the param's current value if numeric, else the range min.
        # `scrub` has no persisted base (it's a pure modulation destination) so
        # it starts at 0.0; `speed`'s base is the instrument's set speed.
        base_value = inst.get(param)
        if not isinstance(base_value, (int, float)) or isinstance(base_value, bool):
            base_value = p_min

        mod_value = _blend_contributions(contributions)
        new_value = base_value + mod_value * (p_max - p_min)
        inst[param] = max(p_min, min(p_max, new_value))

    return modulated


# --------------------------------------------------------------------------- #
#  B4.2 — Sample Rack macros: 8 macros/rack, one-to-many param fan-out.
#
#  A macro is a single control (0..1) that drives ONE-OR-MANY param destinations
#  on the rack's pads. Each route addresses a pad-instrument param via a target
#  path ``pad.<pad_id>.<param>``; the resolved value ``macro.value * route.depth``
#  is written into that param BEFORE render (same discipline + placement as
#  ``resolve_sampler_modulations``: write the resolved value, then the consumer
#  reads the already-driven param). A macro at 0, with no routes, or whose routes
#  all miss → NO effect (regression-safe).
#
#  The FAN-OUT CAPS (MAX_MODROUTES_PER_MACRO / MAX_TOTAL_EDGES) are the trust
#  boundary and live in ``security.validate_rack_macros`` — enforced on load and
#  on the IPC/render boundary BEFORE this resolver ever runs, so this resolver
#  itself stays a pure best-effort writer (skip unknowns, never raise).
# --------------------------------------------------------------------------- #

# Pad-instrument params a macro route may drive → (min, max) clamp bounds.
# Mirrors the sampler lane bounds + per-pad opacity. Anything else (clipId,
# loop, blendMode, …) is NOT macro-able and is SKIPPED — never raises.
_RACK_MACRO_PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "scrub": (0.0, 1.0),
    "speed": (-8.0, 8.0),
    "opacity": (0.0, 1.0),
}
_RACK_MACRO_PARAMS: frozenset[str] = frozenset(_RACK_MACRO_PARAM_BOUNDS.keys())


def _clamp01(x: object) -> float:
    """Coerce x to a finite float in [0, 1]; non-finite/non-number → 0.0."""
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return 0.0
    xf = float(x)
    if xf != xf or xf in (float("inf"), float("-inf")):
        return 0.0
    return max(0.0, min(1.0, xf))


def _finite_depth(x: object) -> float:
    """Coerce a route depth to a finite float; NaN/Inf/non-number → 0.0.

    Trust boundary (gate 3): a NaN/Inf depth must NOT poison the target param.
    A 0.0 depth makes the route a no-op, which is the safe degrade.
    """
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return 0.0
    xf = float(x)
    if xf != xf or xf in (float("inf"), float("-inf")):
        return 0.0
    return xf


def resolve_rack_macros(rack: dict | None) -> dict | None:
    """Apply a rack's macro values to its pads' instrument params (B4.2).

    For every macro, for every route ``pad.<pad_id>.<param>``, writes
    ``macro.value * route.depth`` (additively across routes that share a target)
    into the matching pad instrument's param, clamped to the param's bounds, so
    the modulated value feeds the render (``buildRackLayers`` /
    ``_compute_voice_footage_frame``) BEFORE the consumer reads it. This mirrors
    ``resolve_sampler_modulations`` exactly (write resolved value, then render).

    One macro → MANY routes: a single macro value fans out to every target param
    its routes name (one-to-many). Multiple macros hitting the same target sum.

    Trust boundary (same discipline as MK.8 / B3.2): a route whose prefix isn't
    ``pad``, whose pad_id isn't a live pad in this rack, whose param isn't a
    macro-able param, or that is otherwise malformed is SKIPPED — never raises.
    A NaN/Inf depth is clamped to 0.0 (a no-op route). ``pad_id`` parsing is safe
    to split on '.' because pad ids match the schema id regex (no dots), so
    ``target.split('.', 2)`` is unambiguous.

    Returns a deep-copied rack with the driven params (or the input unchanged
    when there is nothing to resolve — no macros / all macros at 0 / no routes).
    The FAN-OUT CAPS are enforced separately in ``security.validate_rack_macros``
    BEFORE this runs; this resolver does not re-validate counts.
    """
    if not isinstance(rack, dict):
        return rack

    macros = rack.get("macros")
    if not isinstance(macros, list) or not macros:
        return rack  # no-macros → byte-identical to B4.1 (regression-safe)

    pads = rack.get("pads")
    if not isinstance(pads, list) or not pads:
        return rack

    # Build pad lookup by id (only dict pads with a string id count).
    pad_map: dict[str, dict] = {}
    for pad in pads:
        if isinstance(pad, dict):
            pid = pad.get("id")
            if isinstance(pid, str):
                pad_map[pid] = pad

    if not pad_map:
        return rack

    # Accumulate the additive offset per (pad_id, param) across ALL macros/routes.
    deltas: dict[tuple[str, str], float] = defaultdict(float)

    for macro in macros:
        if not isinstance(macro, dict):
            continue
        value = _clamp01(macro.get("value"))
        if value == 0.0:
            continue  # a macro at 0 contributes nothing (regression-safe)
        routes = macro.get("routes")
        if not isinstance(routes, list):
            continue

        for route in routes:
            if not isinstance(route, dict):
                continue
            target = route.get("targetPath", route.get("target_path", ""))
            if not isinstance(target, str) or not target.startswith("pad."):
                continue
            # pad.<pad_id>.<param> — split into exactly 3 (pad ids have no dots).
            parts = target.split(".", 2)
            if len(parts) != 3 or parts[0] != "pad":
                continue
            _, pad_id, param = parts
            if pad_id not in pad_map or param not in _RACK_MACRO_PARAMS:
                continue  # unknown pad / non-macro-able param → SKIP, never raise

            depth = _finite_depth(route.get("depth", 1.0))
            contribution = value * depth
            # A zero-magnitude contribution (depth 0, or a NaN/Inf depth clamped
            # to 0) is a TRUE no-op: it must NOT materialize the target param
            # (else an absent scrub would be written as 0.0 — gate 3 trust
            # boundary: NaN/Inf depth leaves the param untouched).
            if contribution == 0.0:
                continue
            deltas[(pad_id, param)] += contribution

    if not deltas:
        return rack  # all routes missed / all depths 0 → no effect

    modulated = copy.deepcopy(rack)
    # Rebuild the pad lookup against the COPY so we mutate the returned structure.
    copy_map: dict[str, dict] = {}
    for pad in modulated.get("pads", []):
        if isinstance(pad, dict) and isinstance(pad.get("id"), str):
            copy_map[pad["id"]] = pad

    for (pad_id, param), offset in deltas.items():
        pad = copy_map.get(pad_id)
        if pad is None:
            continue
        inst = pad.get("instrument")
        if not isinstance(inst, dict):
            continue
        p_min, p_max = _RACK_MACRO_PARAM_BOUNDS[param]
        # Base value: the param's current value if numeric, else the range min.
        # `scrub` has no persisted base (pure destination) → starts at 0.0; the
        # others (speed/opacity) modulate around the instrument's set value.
        base_value = inst.get(param)
        if not isinstance(base_value, (int, float)) or isinstance(base_value, bool):
            base_value = p_min
        inst[param] = max(p_min, min(p_max, float(base_value) + offset))

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
