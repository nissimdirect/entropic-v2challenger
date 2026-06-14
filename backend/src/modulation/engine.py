"""Signal engine orchestrator — evaluates all operators and resolves routings."""

import time
import logging

from modulation.lfo import evaluate_lfo
from modulation.kentaro_cluster import evaluate_kentaro_cluster
from modulation.envelope import evaluate_envelope
from modulation.step_sequencer import evaluate_step_seq
from modulation.audio_follower import evaluate_audio
from modulation.video_analyzer import downscale_proxy, evaluate_video_analyzer
from modulation.fusion import evaluate_fusion
from modulation.sidechain import evaluate_sidechain
from modulation.gate import evaluate_gate
from modulation.midi_env_stutter import evaluate_midi_env_stutter
from modulation.processor import process_signal
from modulation.routing import resolve_routings

# P4.1: import authoritative cap from security (qa-redteam M2).
# Mirrors frontend/src/shared/limits.ts:LIMITS.MAX_OPERATORS (= 64).
from security import MAX_OPERATORS_PER_PROJECT

logger = logging.getLogger(__name__)

MAX_OPERATORS = MAX_OPERATORS_PER_PROJECT  # 64; was 16 before P4.1


class ModulationCycleError(Exception):
    """Raised when the operator routing graph contains a cycle (INJ-2).

    Previously the engine silently fell back to declaration order (stale 0.0
    reads). Raising makes the cycle explicit so the caller can choose a policy
    (today: graceful degrade to declaration order; SG-5: deterministic break).
    B9 tensor routing + SG-5 depend on this being an explicit, typed failure.
    """

    def __init__(self, unresolved_ids: list[str]):
        self.unresolved_ids = unresolved_ids
        super().__init__(
            "Modulation routing graph contains a cycle; unresolved operators: "
            + ", ".join(str(x) for x in unresolved_ids)
        )


def _topological_sort(active_ops: list[dict]) -> list[dict]:
    """Order operators so source operators evaluate before their consumers.

    Any operator may read another operator's value via
    `parameters.sources[].operator_id` (Fusion today; B9 tensor routing later) —
    this walks ALL such operator-to-operator edges, not just Fusion (INJ-2).

    Stable: preserves declaration order for operators with no dependencies.
    Raises `ModulationCycleError` if the graph contains a cycle (INJ-2); the
    caller decides the policy (graceful degrade today, SG-5 deterministic break).
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
        # Walk operator-to-operator edges on ANY operator, not just Fusion —
        # B9 tensor routing introduces non-Fusion cross-operator sources (INJ-2).
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
        resolved = set(ordered)
        unresolved = [
            active_ops[i].get("id", f"<idx {i}>") for i in range(n) if i not in resolved
        ]
        raise ModulationCycleError(unresolved)

    return [active_ops[i] for i in ordered]


class SignalEngine:
    """Evaluates all operators and applies modulation to an effect chain."""

    # P4.1: render-budget guard state — rate-limit budget warnings to once/sec,
    # and track the degrade flag so the NEXT frame can skip video_analyzer proxies.
    # Skipping the proxy is the cheapest lossy fallback: video_analyzer is the only
    # op that processes raw frame data; skipping keeps LFOs/envelopes/etc. intact.
    _budget_warn_last_t: float = 0.0
    _degrade_next_frame: bool = False

    def evaluate_all(
        self,
        operators: list[dict],
        frame_index: int,
        fps: float,
        audio_pcm=None,
        audio_sample_rate: int = 44100,
        video_frame=None,
        state: dict | None = None,
        bpm: float = 120.0,
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
            bpm: Host tempo, passed to bpm_sync-enabled operators (P4.2
                kentaroCluster). Defaults to 120.0.

        Returns:
            (operator_values, new_state) where operator_values maps op_id -> float.
        """
        if state is None:
            state = {}

        values: dict[str, float] = {}

        # P4.1: render-budget guard — if the previous frame overran 16ms, suppress
        # video_analyzer proxy evaluation on this frame (skip the downscale).
        # video_frame still flows through for consistency; only the proxy is skipped.
        effective_video_frame = None if self._degrade_next_frame else video_frame
        self._degrade_next_frame = False  # reset; re-set below if this frame overruns

        # Cap at MAX_OPERATORS, then topo-sort so source operators resolve before
        # their consumers (otherwise consumers read 0.0 silently).
        try:
            active_ops = _topological_sort(operators[:MAX_OPERATORS])
        except ModulationCycleError as exc:
            # INJ-2: the sort now raises on a cycle. SG-5 will replace this with
            # deterministic cycle-break ordering. Until then, degrade gracefully —
            # keep declaration order so the render never crashes; affected
            # consumers may read 0.0 (the prior silent behavior, now logged loud).
            logger.warning("%s — falling back to declaration order", exc)
            active_ops = operators[:MAX_OPERATORS]

        _eval_start = time.perf_counter()

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
                    # P4.1: use effective_video_frame (None when degrading last frame)
                    if effective_video_frame is not None:
                        proxy = downscale_proxy(effective_video_frame)
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
                elif op_type == "kentaroCluster":
                    # P4.2: 8-LFO cluster. Returns {'': master_mix, 'lfo{i}': v}.
                    # Master mix becomes this op's value (values[op_id] below);
                    # each sub-LFO is exposed at values[f"{op_id}/lfo{i}"] so a
                    # mapping source_key can address one sub-LFO. The '/' can't
                    # collide: op ids are `op-{ts}-{n}` (no slash).
                    cluster_vals, op_state = evaluate_kentaro_cluster(
                        params=params,
                        frame_index=frame_index,
                        fps=fps,
                        bpm=bpm,
                        state_in=op_state,
                    )
                    value = cluster_vals.get("", 0.0)
                    for sub_key, sub_val in cluster_vals.items():
                        if sub_key == "":
                            continue
                        values[f"{op_id}/{sub_key}"] = sub_val
                elif op_type == "sidechain":
                    # P4.3: amplitude follower via the shared RMS kernel.
                    # v1 keys off PROJECT audio only (source_track_id reserved).
                    value, op_state = evaluate_sidechain(
                        pcm=audio_pcm,
                        params=params,
                        sample_rate=audio_sample_rate,
                        state_in=op_state,
                    )
                elif op_type == "gate":
                    # P4.3: threshold a source operator's value. Reads the
                    # already-evaluated `values` dict (mirrors fusion) — the
                    # toposort guarantees the source resolved first.
                    value, op_state = evaluate_gate(
                        params=params,
                        operator_values=values,
                        state_in=op_state,
                    )
                elif op_type == "midiEnvStutter":
                    # P4.3: retriggerable ADSR via the shared envelope kernel.
                    value, op_state = evaluate_midi_env_stutter(
                        params=params,
                        frame_index=frame_index,
                        state_in=op_state,
                    )
                else:
                    # Unknown operator type — evaluates to 0.0 without crashing.
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

        # P4.1: render-budget guard — warn (rate-limited to 1/sec) and set degrade
        # flag for the next frame if eval exceeded 16ms.
        _eval_elapsed = time.perf_counter() - _eval_start
        _BUDGET_MS = 0.016  # 16ms
        if _eval_elapsed > _BUDGET_MS:
            _now = time.perf_counter()
            if _now - self._budget_warn_last_t >= 1.0:
                logger.warning(
                    "SignalEngine.evaluate_all exceeded 16ms budget: %.1fms "
                    "(frame %d, %d operators). Degrading next frame.",
                    _eval_elapsed * 1000,
                    frame_index,
                    len(active_ops),
                )
                self._budget_warn_last_t = _now
            self._degrade_next_frame = True

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
