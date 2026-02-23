"""Effect pipeline — applies a chain of effects to a frame."""

import numpy as np

from effects import registry
from engine.container import EffectContainer

# SEC-7: Maximum effects in a single chain
MAX_CHAIN_DEPTH = 10


def apply_chain(
    frame: np.ndarray,
    chain: list[dict],
    project_seed: int,
    frame_index: int,
    resolution: tuple[int, int],
    states: dict[str, dict | None] | None = None,
) -> tuple[np.ndarray, dict[str, dict | None]]:
    """Apply an ordered chain of effects to a frame.

    Args:
        frame:        Input RGBA frame (H, W, 4) uint8.
        chain:        List of effect instances, each:
                      {"effect_id": str, "params": dict, "enabled": bool}.
        project_seed: Project-level seed for determinism.
        frame_index:  Current frame number (0-based).
        resolution:   (width, height) of the output.
        states:       Per-effect state from previous frame, keyed by effect_id.

    Returns:
        Tuple of (output_frame, new_states).

    Raises:
        ValueError: If chain exceeds MAX_CHAIN_DEPTH or contains unknown effects.
    """
    if len(chain) > MAX_CHAIN_DEPTH:
        raise ValueError(
            f"Chain depth {len(chain)} exceeds maximum {MAX_CHAIN_DEPTH} (SEC-7)"
        )

    if states is None:
        states = {}

    output = frame
    new_states: dict[str, dict | None] = {}

    for effect_instance in chain:
        # Skip disabled effects
        if not effect_instance.get("enabled", True):
            continue

        effect_id = effect_instance.get("effect_id")
        params = dict(effect_instance.get("params", {}))

        # Inject top-level mix into params as _mix for EffectContainer
        if "mix" in effect_instance:
            params["_mix"] = effect_instance["mix"]

        effect_info = registry.get(effect_id)
        if effect_info is None:
            raise ValueError(f"unknown effect: {effect_id}")

        container = EffectContainer(effect_info["fn"], effect_id)
        state_in = states.get(effect_id)

        output, state_out = container.process(
            output,
            params,
            state_in,
            frame_index=frame_index,
            project_seed=project_seed,
            resolution=resolution,
        )

        new_states[effect_id] = state_out

    return output, new_states
