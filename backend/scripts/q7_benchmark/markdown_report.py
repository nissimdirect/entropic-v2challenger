"""Markdown report renderer (PR #7).

Turns a 0.3.0+ JSON report into a human-readable markdown document with
verdict, per-backbone latency tables, per-sparsity jitter breakdown,
queue throughput summary, memory snapshot, and a Tier 5 recommendation.

Charts (matplotlib PNGs) are rendered separately in charts.py; the
markdown writer optionally references those PNG paths if provided.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RenderOptions:
    """Knobs for markdown rendering."""

    include_charts: bool = True
    chart_paths: dict[str, Path] | None = None
    include_raw_json_appendix: bool = False


def _verdict_banner(verdict: dict) -> str:
    state = verdict["state"]
    emoji = {
        "TIER_5_GO": "✓",
        "TIER_5_CONDITIONAL": "⚠",
        "TIER_5_NO_GO": "✗",
    }.get(state, "?")
    p95 = verdict["canonical_p95_ms"]
    flags = verdict.get("flags", [])
    flag_str = f" — flags: {', '.join(flags)}" if flags else ""
    return f"## {emoji} **{state}** (canonical p95 = {p95:.2f} ms){flag_str}"


def _format_latency_table(heads: dict) -> str:
    rows = [
        "| Backbone | Backend | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | stddev | cold-load (s) | high-variance | error |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for name in ("dinov2", "clip", "clap"):
        head = heads.get(name, {})
        lat = head.get("encode_latency", {})
        cold = head.get("cold_load_seconds")
        cold_str = f"{cold:.2f}" if isinstance(cold, (int, float)) else "—"
        hv = "⚠ yes" if head.get("high_variance") else "no"
        err = head.get("error") or "—"
        rows.append(
            f"| {name} | {head.get('backend', '—')} | "
            f"{lat.get('p50_ms', 0):.2f} | {lat.get('p95_ms', 0):.2f} | "
            f"{lat.get('p99_ms', 0):.2f} | {lat.get('max_ms', 0):.2f} | "
            f"{lat.get('stddev_ms', 0):.2f} | {cold_str} | {hv} | {err} |"
        )
    return "\n".join(rows)


def _format_sparsity_table(interp: dict) -> str:
    rows = [
        "| Sparsity | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | frames |",
        "|---|---|---|---|---|---|",
    ]
    by_sparsity = interp.get("by_sparsity", {})
    canonical = interp.get("canonical_sparsity", 8)
    for sparsity in (4, 8, 16, 32):
        key = str(sparsity)
        s = by_sparsity.get(key, {})
        marker = " ←canonical" if sparsity == canonical else ""
        rows.append(
            f"| 1:{sparsity}{marker} | "
            f"{s.get('jitter_p50_ms', 0):.2f} | "
            f"{s.get('jitter_p95_ms', 0):.2f} | "
            f"{s.get('jitter_p99_ms', 0):.2f} | "
            f"{s.get('jitter_max_ms', 0):.2f} | "
            f"{s.get('n_frames', 0)} |"
        )
    return "\n".join(rows)


def _format_queue(queue: dict) -> str:
    return (
        f"- **Throughput:** {queue.get('throughput_per_second', 0):.2f} encodes/sec\n"
        f"- **Threads:** {queue.get('n_threads', 0)}\n"
        f"- **Window:** {queue.get('window_seconds', 0):.1f} s\n"
        f"- **Total encodes:** {queue.get('total_encodes', 0)}\n"
        f"- **Per-thread counts:** {queue.get('per_thread_counts', [])}"
    )


def _format_memory(memory: dict) -> str:
    return (
        f"- **Resident:** {memory.get('resident_mb', 0):.1f} MB\n"
        f"- **Peak:** {memory.get('peak_mb', 0):.1f} MB"
    )


def _recommendation(verdict: dict, interp: dict) -> str:
    state = verdict["state"]
    p95 = verdict["canonical_p95_ms"]
    note = verdict.get("note", "")
    if state == "TIER_5_GO":
        rec = (
            "**Proceed with Tier 5 implementation in Session 2.** "
            "All Tier 5 features (C5 Latent-Trajectory, C6 Frame-as-Self-Wavetable, "
            "C8 Feedback-Through-L, D4 Latent Granulator) are GO."
        )
    elif state == "TIER_5_CONDITIONAL":
        rec = (
            "**Re-run after cold boot + thermal cool-down before committing.** "
            f"Current p95 ({p95:.1f}ms) is between {50}ms (GO threshold) and {100}ms "
            "(NO_GO). Likely thermal-throttling or first-run cache effects."
        )
    else:
        rec = (
            "**Defer L-axis features to v1.1 per Vision §11 contingency.** "
            "Tiers 0-4 (effects, color, blending, freeze, automation, performance, "
            "operators) ship without L-axis modulation. Re-evaluate when MLX or "
            "quantization matures."
        )

    flags = verdict.get("flags", [])
    flag_notes = []
    if "HIGH_VARIANCE" in flags:
        flag_notes.append(
            "  - **HIGH_VARIANCE:** stddev > p50 in at least one head. Tier 5 may have "
            "occasional visible hitches even though the gate passed."
        )
    if "DEGRADES_UNDER_LOAD" in flags:
        flag_notes.append(
            "  - **DEGRADES_UNDER_LOAD:** jitter increased >2x under simulated 10-effect "
            "render-chain load. SG-8 memory monitor will mitigate at runtime, but expect "
            "Tier 5 to be the first thing degraded under sustained load."
        )

    parts = [rec, "", note]
    if flag_notes:
        parts.append("\n**Advisory flags:**\n" + "\n".join(flag_notes))
    return "\n".join(parts)


def render_markdown(report: dict, opts: RenderOptions | None = None) -> str:
    """Render a 0.3.0 report dict to markdown."""
    opts = opts or RenderOptions()
    verdict = report.get("verdict", {})
    measurement = report.get("measurement", {})
    heads = measurement.get("heads", {})
    interp = measurement.get("interpolation", {})
    queue = measurement.get("queue", {})
    memory = measurement.get("memory", {})

    lines: list[str] = []
    lines.append("# Q7 Multi-Headed L Backbone — Tier 5 Verdict")
    lines.append("")
    lines.append(
        f"**Report:** {report.get('schema_version', '?')} · "
        f"**Mode:** {report.get('mode', '?')} · "
        f"**Backend:** {report.get('backend', '?')} · "
        f"**Generated:** {report.get('generated_at', '?')}"
    )
    lines.append("")
    lines.append(_verdict_banner(verdict))
    lines.append("")

    lines.append("## Recommendation")
    lines.append("")
    lines.append(_recommendation(verdict, interp))
    lines.append("")

    lines.append("## Per-Backbone Encode Latency")
    lines.append("")
    lines.append(_format_latency_table(heads))
    lines.append("")
    if (
        opts.include_charts
        and opts.chart_paths
        and "latency_by_backbone" in opts.chart_paths
    ):
        lines.append(
            f"![Per-backbone latency]({opts.chart_paths['latency_by_backbone']})"
        )
        lines.append("")

    lines.append("## Interpolation Jitter by Sparsity")
    lines.append("")
    lines.append(_format_sparsity_table(interp))
    lines.append("")
    lines.append(
        f"- **Canonical sparsity:** 1:{interp.get('canonical_sparsity', 8)} "
        "(per DEC-Q7-009)"
    )
    lines.append(
        f"- **Below 50ms threshold:** {'✓ yes' if interp.get('below_threshold_50ms') else '✗ no'}"
    )
    lines.append(
        f"- **Degrades under load:** {'⚠ yes' if interp.get('degradation_under_load') else 'no'}"
    )
    lines.append("")
    if (
        opts.include_charts
        and opts.chart_paths
        and "jitter_by_sparsity" in opts.chart_paths
    ):
        lines.append(f"![Jitter by sparsity]({opts.chart_paths['jitter_by_sparsity']})")
        lines.append("")

    lines.append("## Queue Saturation")
    lines.append("")
    lines.append(_format_queue(queue))
    lines.append("")

    lines.append("## Memory")
    lines.append("")
    lines.append(_format_memory(memory))
    lines.append("")

    lines.append("## Cross-References")
    lines.append("")
    lines.append("- Vision: `~/.claude/plans/entropic-synth-paradigm-vision.md`")
    lines.append(
        "- SPEC-5 (L backbone): `~/.claude/plans/entropic-spec-5-l-backbone.md`"
    )
    lines.append(
        "- DEC-Q7-007 (jitter threshold): `docs/decisions/q7/DEC-Q7-007-jitter-threshold.md`"
    )
    lines.append(
        "- DEC-Q7-009 (canonical sparsity): `docs/decisions/q7/DEC-Q7-009-canonical-sparsity.md`"
    )
    lines.append(
        "- DEC-Q7-014 (Intel Mac): `docs/decisions/q7/DEC-Q7-014-intel-mac-unsupported.md`"
    )
    lines.append("")

    if opts.include_raw_json_appendix:
        lines.append("## Appendix: Raw JSON")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(report, indent=2, sort_keys=True))
        lines.append("```")

    return "\n".join(lines)


def render_to_file(
    report: dict, out_path: Path, opts: RenderOptions | None = None
) -> Path:
    """Render markdown and write to disk. Returns out_path."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render_markdown(report, opts))
    return out_path
