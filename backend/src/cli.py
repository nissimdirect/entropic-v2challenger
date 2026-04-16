"""entropic-cli — headless command-line interface to the Entropic engine.

Allows applying effect chains to video files without launching Electron or
spinning up the ZMQ server. Designed for:
  - Oracle validators in tests/oracles/ (engine-correctness regression)
  - Differential replay against prior versions
  - Scripting batch effect runs

Usage from backend/:
    python src/cli.py list
    python src/cli.py apply input.mp4 --effect fx.color_invert -o out.mp4
    python src/cli.py apply input.mp4 \\
        --effect fx.color_invert --effect fx.blur \\
        --params '{"fx.blur": {"radius": 5.0}}' \\
        -o chained.mp4

See plan: ~/.claude/plans/lucid-swarm-loom.md (Part B)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Make src/ resolvable when invoked as `python src/cli.py` from any cwd.
_SRC = Path(__file__).resolve().parent
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from effects import registry  # noqa: E402  (path setup must precede)
from engine.export import ExportManager, ExportStatus  # noqa: E402


def cmd_list(_args: argparse.Namespace) -> int:
    """Print all registered effects, sorted by id."""
    effects = sorted(registry.list_all(), key=lambda e: e["id"])
    for fx in effects:
        print(f"{fx['id']:35s}  {fx['category']:20s}  {fx['name']}")
    print(f"\n{len(effects)} effects registered", file=sys.stderr)
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    """Apply effect chain to input video, write output."""
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_path.exists():
        print(f"ERROR: input not found: {input_path}", file=sys.stderr)
        return 2

    # Parse params: --params can be inline JSON or @path/to/file.json
    params_arg = args.params
    if params_arg.startswith("@"):
        params_arg = Path(params_arg[1:]).expanduser().read_text()
    try:
        params = json.loads(params_arg)
    except json.JSONDecodeError as exc:
        print(f"ERROR: --params is not valid JSON: {exc}", file=sys.stderr)
        return 2
    if not isinstance(params, dict):
        print(
            "ERROR: --params must be a JSON object: {effect_id: {...}}", file=sys.stderr
        )
        return 2

    # Build chain in declared order
    chain: list[dict] = []
    for effect_id in args.effect:
        if registry.get(effect_id) is None:
            print(f"ERROR: unknown effect: {effect_id}", file=sys.stderr)
            print(
                "       run `python src/cli.py list` to see available effects",
                file=sys.stderr,
            )
            return 2
        chain.append(
            {
                "effect_id": effect_id,
                "params": params.get(effect_id, {}),
                "enabled": True,
            }
        )

    # Build settings dict (only include user-provided overrides)
    settings: dict = {}
    if args.codec:
        settings["codec"] = args.codec
    if args.fps:
        settings["fps"] = int(args.fps) if args.fps.isdigit() else args.fps
    if args.crf is not None:
        settings["crf"] = args.crf

    # Ensure output dir exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"  input:  {input_path}", file=sys.stderr)
    print(f"  chain:  {' -> '.join(args.effect)}", file=sys.stderr)
    print(f"  output: {output_path}", file=sys.stderr)

    # Run export (background thread; we poll until done)
    manager = ExportManager()
    job = manager.start(
        input_path=str(input_path),
        output_path=str(output_path),
        chain=chain,
        project_seed=args.seed,
        settings=settings,
    )

    last_pct = -1
    while job.status == ExportStatus.RUNNING:
        if job.total_frames > 0:
            pct = int(job.progress * 100)
            if pct != last_pct and pct % 10 == 0:
                print(
                    f"  exporting: {pct}% ({job.current_frame}/{job.total_frames})",
                    file=sys.stderr,
                )
                last_pct = pct
        time.sleep(0.25)

    if job.status == ExportStatus.ERROR:
        print(f"ERROR: export failed: {job.error}", file=sys.stderr)
        return 1
    if job.status == ExportStatus.CANCELLED:
        print("ERROR: export cancelled", file=sys.stderr)
        return 1

    if not output_path.exists():
        print(
            f"ERROR: export reported COMPLETE but output missing: {output_path}",
            file=sys.stderr,
        )
        return 1

    size_mb = output_path.stat().st_size / 1_048_576
    print(f"  wrote {output_path.name} ({size_mb:.2f} MB, {job.current_frame} frames)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="entropic-cli",
        description="Headless CLI for the Entropic engine. Apply effect chains to video files.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    list_p = sub.add_parser("list", help="List all registered effects")
    list_p.set_defaults(func=cmd_list)

    apply_p = sub.add_parser("apply", help="Apply effect chain to a video file")
    apply_p.add_argument("input", help="Input video file path")
    apply_p.add_argument(
        "--effect",
        action="append",
        required=True,
        metavar="EFFECT_ID",
        help="Effect ID to apply, repeatable (chain order = declaration order)",
    )
    apply_p.add_argument(
        "--params",
        default="{}",
        help='JSON object: {"effect_id": {"param": value}} OR @path/to/file.json',
    )
    apply_p.add_argument("-o", "--output", required=True, help="Output file path")
    apply_p.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Project seed for determinism (default: 42)",
    )
    apply_p.add_argument("--codec", help="Codec override (e.g. h264, prores, vp9)")
    apply_p.add_argument("--fps", help="FPS override (e.g. 30, 60, source)")
    apply_p.add_argument(
        "--crf", type=int, help="CRF quality override (lower = higher quality)"
    )
    apply_p.set_defaults(func=cmd_apply)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
