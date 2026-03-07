"""Signal engine orchestrator — evaluates all operators and resolves routings."""

import time
import logging

from modulation.lfo import evaluate_lfo
from modulation.envelope import evaluate_envelope
from modulation.step_sequencer import evaluate_step_seq
from modulation.audio_follower import evaluate_audio
from modulation.processor import process_signal
from modulation.routing import resolve_routings

logger = logging.getLogger(__name__)

MAX_OPERATORS = 16


class SignalEngine:
    """Evaluates all operators and applies modulation to an effect chain."""

    def evaluate_all(
        self,
        operators: list[dict],
        frame_index: int,
        fps: float,
        audio_pcm=None,
        audio_sample_rate: int = 44100,
        state: dict | None = None,
    ) -> tuple[dict[str, float], dict]:
        """Evaluate all operators and return their signal values.

        Args:
            operators: List of operator config dicts.
            frame_index: Current frame number.
            fps: Frames per second.
            audio_pcm: Optional audio samples for audio follower.
            audio_sample_rate: Audio sample rate.
            state: Persistent state dict keyed by operator id.

        Returns:
            (operator_values, new_state) where operator_values maps op_id -> float.
        """
        if state is None:
            state = {}

        values: dict[str, float] = {}

        # Cap at MAX_OPERATORS
        active_ops = operators[:MAX_OPERATORS]

        for op in active_ops:
            op_id = op.get("id", "")
            op_type = op.get("type", "")
            is_enabled = op.get("is_enabled", op.get("isEnabled", True))

            if not is_enabled or not op_id:
                continue

            params = op.get("parameters", op.get("params", {}))
            processing = op.get("processing", [])
            op_state = state.get(op_id, {})

            try:
                if op_type == "lfo":
                    value, op_state = evaluate_lfo(
                        waveform=str(params.get("waveform", "sine")),
                        rate_hz=float(params.get("rate_hz", 1.0)),
                        phase_offset=float(params.get("phase_offset", 0.0)),
                        frame_index=frame_index,
                        fps=fps,
                        state_in=op_state,
                    )
                elif op_type == "envelope":
                    value, op_state = evaluate_envelope(
                        trigger=bool(params.get("trigger", False)),
                        attack=float(params.get("attack", 0)),
                        decay=float(params.get("decay", 0)),
                        sustain=float(params.get("sustain", 1.0)),
                        release=float(params.get("release", 0)),
                        frame_index=frame_index,
                        state_in=op_state,
                    )
                elif op_type == "step_sequencer":
                    steps = params.get("steps", [])
                    if not isinstance(steps, list):
                        steps = []
                    value = evaluate_step_seq(
                        steps=[float(s) for s in steps],
                        rate_hz=float(params.get("rate_hz", 1.0)),
                        frame_index=frame_index,
                        fps=fps,
                    )
                    # Step seq is stateless
                elif op_type == "audio_follower":
                    value, op_state = evaluate_audio(
                        pcm=audio_pcm,
                        method=str(params.get("method", "rms")),
                        params=params,
                        sample_rate=audio_sample_rate,
                        state_in=op_state,
                    )
                elif op_type in ("video_analyzer", "fusion"):
                    # Deferred to 6B
                    value = 0.0
                else:
                    value = 0.0

                # Apply processing chain
                if processing:
                    value = process_signal(value, processing)

                values[op_id] = value
                state[op_id] = op_state if isinstance(op_state, dict) else {}

            except Exception:
                logger.warning(
                    "Operator %s (%s) failed, skipping", op_id, op_type, exc_info=True
                )
                values[op_id] = 0.0

        return values, state

    def apply_modulation(
        self,
        operators: list[dict],
        operator_values: dict[str, float],
        chain: list[dict],
        effect_registry_fn=None,
    ) -> list[dict]:
        """Apply operator modulation values to an effect chain.

        Delegates to routing.resolve_routings.
        """
        return resolve_routings(operator_values, operators, chain, effect_registry_fn)
