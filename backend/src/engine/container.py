"""Effect container — wraps pure effect functions with mask + mix pipeline."""

import numpy as np

from engine.determinism import derive_seed


class EffectContainer:
    """Container that wraps an effect's apply() function.

    Pipeline: mask → process → mix
    Effect authors write only the processing stage.
    """

    def __init__(self, effect_fn, effect_id: str):
        self.effect_fn = effect_fn
        self.effect_id = effect_id

    def process(
        self,
        frame: np.ndarray,
        params: dict,
        state_in: dict | None,
        *,
        frame_index: int,
        project_seed: int,
        resolution: tuple[int, int],
    ) -> tuple[np.ndarray, dict | None]:
        # 1. Compute deterministic seed
        user_seed = params.get("seed", 0)
        seed = derive_seed(project_seed, self.effect_id, frame_index, user_seed)

        # 2. Extract container params (pop so effect doesn't see them)
        effect_params = dict(params)  # Copy to avoid mutating caller's dict
        mask = effect_params.pop("_mask", None)
        mix = effect_params.pop("_mix", 1.0)

        # 3. Run effect (the pure function)
        wet_frame, state_out = self.effect_fn(
            frame,
            effect_params,
            state_in,
            frame_index=frame_index,
            seed=seed,
            resolution=resolution,
        )

        # 4. Mix dry/wet
        if mix < 1.0:
            output = np.clip(
                frame.astype(np.float32) * (1.0 - mix)
                + wet_frame.astype(np.float32) * mix,
                0,
                255,
            ).astype(np.uint8)
        else:
            output = wet_frame

        # 5. Apply mask blend (if mask provided)
        if mask is not None:
            mask_4d = mask[:, :, np.newaxis]  # (H, W, 1) for broadcasting to RGBA
            output = np.clip(
                frame.astype(np.float32) * (1.0 - mask_4d)
                + output.astype(np.float32) * mask_4d,
                0,
                255,
            ).astype(np.uint8)

        return output, state_out
