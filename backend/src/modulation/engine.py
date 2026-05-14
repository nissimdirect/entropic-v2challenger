"""Signal engine orchestrator — evaluates all operators and resolves routings."""

import time
import logging

from modulation.lfo import evaluate_lfo
from modulation.envelope import evaluate_envelope
from modulation.step_sequencer import evaluate_step_seq
from modulation.audio_follower import evaluate_audio
from modulation.video_analyzer import downscale_proxy, evaluate_video_analyzer
from modulation.fusion import evaluate_fusion
from modulation.processor import process_signal
from modulation.routing import resolve_routings

logger = logging.getLogger(__name__)

MAX_OPERATORS = 16


def _topological_sort(active_ops: list[dict]) -> list[dict]:
    """Order operators so Fusion sources evaluate before Fusion consumers.

    Fusion operators read other operators' values via `parameters.sources[].operator_id`.
    The previous declaration-order loop returned 0.0 for any source declared after its
    consumer (silent stale read, not a crash). This sort fixes that.

    Stable: preserves declaration order for operators with no fusion dependencies.
    Cycle-safe: if a cycle is detected, falls back to declaration order with a warning.
    """
    n = len(active_ops)
    if n <= 1:
        return active_ops

    op_idx: dict[str, int] = {}
    for i, op in enumerate(active_ops):
        op_id = op.get("id", "")
        if op_id and op_id not in op_idx:
            op_idx[op_id] = i

    # deps[i] = set of declaration indices that op i depends on
    deps: list[set[int]] = [set() for _ in range(n)]
    for i, op in enumerate(active_ops):
        if op.get("type") != "fusion":
            continue
        params = op.get("parameters", op.get("params", {}))
        sources = params.get("sources", [])
        if not isinstance(sources, list):
            continue
        for src in sources:
            if not isinstance(src, dict):
                continue
            src_id = src.get("operator_id", "")
            j = op_idx.get(src_id)
            if j is not None and j != i:
                deps[i].add(j)

    # Stable Kahn's algorithm: ready set kept sorted by declaration index
    in_degree = [len(d) for d in deps]
    ready = sorted(i for i in range(n) if in_degree[i] == 0)
    ordered: list[int] = []
    while ready:
        i = ready.pop(0)
        ordered.append(i)
        for j in range(n):
            if i in deps[j]:
                deps[j].discard(i)
                in_degree[j] -= 1
                if in_degree[j] == 0:
                    # Insert preserving sort
                    pos = 0
                    while pos < len(ready) and ready[pos] < j:
                        pos += 1
                    ready.insert(pos, j)

    if len(ordered) < n:
        logger.warning(
            "Modulation graph contains a cycle in fusion sources; "
            "falling back to declaration order. Some operators may read 0.0."
        )
        return active_ops

    return [active_ops[i] for i in ordered]


class SignalEngine:
    """Evaluates all operators and applies modulation to an effect chain."""

    def evaluate_all(
        self,
        operators: list[dict],
        frame_index: int,
        fps: float,
        audio_pcm=None,
        audio_sample_rate: int = 44100,
        video_frame=None,
        state: dict | None = None,
    ) -> tuple[dict[str, float], dict]:
        """Evaluate all operators and return their signal values.

        Args:
            operators: List of operator config dicts.
            frame_index: Current frame number.
            fps: Frames per second.
            audio_pcm: Optional audio samples for audio follower.
            audio_sample_rate: Audio sample rate.
            video_frame: Optional numpy array (HxWx3 uint8) for video analyzer.
            state: Persistent state dict keyed by operator id.

        Returns:
            (operator_values, new_state) where operator_values maps op_id -> float.
        """
        if state is None:
            state = {}

        values: dict[str, float] = {}

        # Cap at MAX_OPERATORS, then topo-sort so Fusion sources resolve before
        # their consumers (otherwise Fusion reads 0.0 silently — see _topological_sort).
        active_ops = _topological_sort(operators[:MAX_OPERATORS])

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
                elif op_type == "video_analyzer":
                    method = str(params.get("method", "luminance"))
                    if video_frame is not None:
                        proxy = downscale_proxy(video_frame)
                    else:
                        proxy = None
                    value, op_state = evaluate_video_analyzer(
                        method=method,
                        proxy=proxy,
                        state_in=op_state,
                    )
                elif op_type == "fusion":
                    fusion_sources = params.get("sources", [])
                    if not isinstance(fusion_sources, list):
                        fusion_sources = []
                    blend = str(params.get("blend_mode", "weighted_average"))
                    value = evaluate_fusion(
                        sources=fusion_sources,
                        operator_values=values,
                        blend_mode=blend,
                    )
                else:
                    value = 0.0

                # Apply processing chain (thread state for smooth/slew)
                if processing:
                    proc_state = (op_state or {}).get("_proc", None)
                    value, proc_state = process_signal(value, processing, proc_state)
                    if op_state is None:
                        op_state = {}
                    op_state["_proc"] = proc_state

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
        automation_overrides: dict[str, float] | None = None,
    ) -> list[dict]:
        """Apply operator modulation values to an effect chain.

        Signal order: Base → +OpMod → AutoReplace → Clamp.
        Delegates operator modulation to routing.resolve_routings,
        then applies automation overrides (replace, not add).
        """
        modulated = resolve_routings(
            operator_values, operators, chain, effect_registry_fn
        )

        # Phase 7: Apply automation overrides AFTER operator modulation
        if automation_overrides:
            from modulation.routing import _get_param_bounds

            for effect in modulated:
                eid = effect.get("effect_id", "")
                if not eid:
                    continue
                params = effect.get("params", {})
                for param_key in list(params.keys()):
                    override_key = f"{eid}.{param_key}"
                    if override_key in automation_overrides:
                        value = automation_overrides[override_key]
                        if not isinstance(value, (int, float)):
                            continue
                        # Clamp to param bounds
                        p_min, p_max = _get_param_bounds(
                            eid, param_key, effect_registry_fn
                        )
                        params[param_key] = max(p_min, min(p_max, float(value)))

        return modulated
