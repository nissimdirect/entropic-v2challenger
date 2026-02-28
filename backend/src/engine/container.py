"""Effect container — wraps pure effect functions with mask + mix pipeline."""

import logging
import math

import numpy as np
import sentry_sdk

from engine.determinism import derive_seed

logger = logging.getLogger(__name__)


def _capture_with_context(e: Exception, effect_id: str, extra: dict):
    """Capture exception to Sentry with effect-level context and fingerprint dedup."""
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("effect_id", effect_id)
        scope.fingerprint = ["effect-crash", effect_id, type(e).__name__]
        scope.set_context("effect", extra)
        sentry_sdk.capture_exception(e, scope=scope)


class EffectContainer:
    """Container that wraps an effect's apply() function.

    Pipeline: mask → process → mix
    Effect authors write only the processing stage.
    """

    def __init__(self, effect_fn, effect_id: str):
        self.effect_fn = effect_fn
        self.effect_id = effect_id
        self.last_error: Exception | None = None

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
        self.last_error = None

        # 1. Compute deterministic seed
        user_seed = params.get("seed", 0)
        seed = derive_seed(project_seed, self.effect_id, frame_index, user_seed)

        # 2. Extract container params (pop so effect doesn't see them)
        # Sanitize NaN/Inf values — drop them so effect uses its default
        effect_params = {
            k: v
            for k, v in params.items()
            if not (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))
        }
        mask = effect_params.pop("_mask", None)
        mix = effect_params.pop("_mix", 1.0)

        # Context for Sentry (PII-safe: keys only, no values)
        sentry_ctx = {
            "frame_index": frame_index,
            "param_keys": list(effect_params.keys()),
            "seed": seed,
            "resolution": resolution,
            "frame_shape": list(frame.shape),
        }

        # 3. Run effect (the pure function)
        try:
            wet_frame, state_out = self.effect_fn(
                frame,
                effect_params,
                state_in,
                frame_index=frame_index,
                seed=seed,
                resolution=resolution,
            )
        except Exception as e:
            self.last_error = e
            _capture_with_context(e, self.effect_id, sentry_ctx)
            logger.error(
                "Effect %s failed on frame %d: %s",
                self.effect_id,
                frame_index,
                type(e).__name__,
            )
            logger.debug("Effect %s exception detail: %s", self.effect_id, e)
            return frame.copy(), state_in

        # 4. Validate effect output
        try:
            if not isinstance(wet_frame, np.ndarray):
                raise TypeError(
                    f"Effect returned {type(wet_frame).__name__}, expected ndarray"
                )
            if wet_frame.shape != frame.shape:
                raise ValueError(
                    f"Effect returned shape {wet_frame.shape}, expected {frame.shape}"
                )
            if wet_frame.dtype != np.uint8:
                wet_frame = np.clip(wet_frame, 0, 255).astype(np.uint8)
        except (TypeError, ValueError) as e:
            self.last_error = e
            _capture_with_context(e, self.effect_id, sentry_ctx)
            logger.error(
                "Effect %s produced invalid output on frame %d: %s",
                self.effect_id,
                frame_index,
                type(e).__name__,
            )
            logger.debug("Effect %s output error detail: %s", self.effect_id, e)
            return frame.copy(), state_in

        # 5. Mix dry/wet
        try:
            if mix < 1.0:
                output = np.clip(
                    frame.astype(np.float32) * (1.0 - mix)
                    + wet_frame.astype(np.float32) * mix,
                    0,
                    255,
                ).astype(np.uint8)
            else:
                output = wet_frame

            # 6. Apply mask blend (if mask provided)
            if mask is not None:
                mask_4d = mask[:, :, np.newaxis]  # (H, W, 1) for broadcasting to RGBA
                output = np.clip(
                    frame.astype(np.float32) * (1.0 - mask_4d)
                    + output.astype(np.float32) * mask_4d,
                    0,
                    255,
                ).astype(np.uint8)
        except Exception as e:
            self.last_error = e
            _capture_with_context(e, self.effect_id, sentry_ctx)
            logger.error(
                "Effect %s mix/mask failed on frame %d: %s",
                self.effect_id,
                frame_index,
                type(e).__name__,
            )
            return frame.copy(), state_in

        return output, state_out
