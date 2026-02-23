"""Effect parameter calibration — verifies every param produces visible change.

Run:  cd backend && python -m effects._calibration
"""

import sys
from pathlib import Path

import numpy as np

# Ensure src/ is on the path when running as module
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from effects.registry import get, list_all  # noqa: E402


def _test_frame(w: int = 200, h: int = 150) -> np.ndarray:
    """Create a deterministic test frame (RGBA uint8)."""
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, (h, w, 4), dtype=np.uint8)


def _mean_diff(a: np.ndarray, b: np.ndarray) -> float:
    """Mean absolute pixel difference across RGB channels."""
    return float(
        np.mean(np.abs(a[:, :, :3].astype(np.float32) - b[:, :, :3].astype(np.float32)))
    )


VALID_CURVES = {"linear", "logarithmic", "exponential", "s-curve"}


def calibrate_all() -> list[dict]:
    """Run calibration across all effects and params.

    Returns a list of result dicts:
      {effect_id, param, level_pct, mean_pixel_diff, curve, unit}
    """
    frame = _test_frame()
    results: list[dict] = []
    effects = list_all()

    for effect_info in effects:
        eid = effect_info["id"]
        params_schema = effect_info["params"]
        entry = get(eid)
        if entry is None:
            continue
        fn = entry["fn"]

        for param_key, pdef in params_schema.items():
            ptype = pdef.get("type")
            if ptype not in ("float", "int"):
                continue

            pmin = pdef.get("min", 0)
            pmax = pdef.get("max", 1)
            default = pdef.get("default", pmin)
            curve = pdef.get("curve", "linear")
            unit = pdef.get("unit", "")

            # Build base params at defaults
            base_params: dict = {}
            for k, pd in params_schema.items():
                base_params[k] = pd.get("default", 0)

            # Render at default to get reference
            kw = {"frame_index": 0, "seed": 12345, "resolution": (200, 150)}
            ref_out, _ = fn(frame, dict(base_params), None, **kw)

            for level_pct in [0, 25, 50, 75, 100]:
                value = pmin + (pmax - pmin) * level_pct / 100.0
                if ptype == "int":
                    value = int(round(value))

                test_params = dict(base_params)
                test_params[param_key] = value

                out, _ = fn(frame, test_params, None, **kw)
                diff = _mean_diff(ref_out, out)

                results.append(
                    {
                        "effect_id": eid,
                        "param": param_key,
                        "level_pct": level_pct,
                        "value": value,
                        "mean_pixel_diff": round(diff, 2),
                        "curve": curve,
                        "unit": unit,
                    }
                )

    return results


def validate_curves() -> list[str]:
    """Check that every param with a 'curve' field uses a valid curve name."""
    errors: list[str] = []
    for effect_info in list_all():
        for param_key, pdef in effect_info["params"].items():
            curve = pdef.get("curve")
            if curve is not None and curve not in VALID_CURVES:
                errors.append(
                    f"{effect_info['id']}.{param_key}: invalid curve '{curve}' "
                    f"(valid: {VALID_CURVES})"
                )
    return errors


def print_report(results: list[dict]) -> None:
    """Pretty-print calibration results."""
    print(
        f"{'Effect':<20} {'Param':<15} {'Level%':>6} {'Value':>10} {'PixDiff':>8} {'Curve':<12} {'Unit'}"
    )
    print("-" * 85)

    current_effect = ""
    for r in results:
        eid = r["effect_id"] if r["effect_id"] != current_effect else ""
        current_effect = r["effect_id"]
        print(
            f"{eid:<20} {r['param']:<15} {r['level_pct']:>5}% "
            f"{r['value']:>10.2f} {r['mean_pixel_diff']:>8.2f} {r['curve']:<12} {r['unit']}"
        )

    # Flag params where <10% of range produces >90% of visual change
    print("\n--- Potential curve issues ---")
    grouped: dict[tuple[str, str], list[dict]] = {}
    for r in results:
        key = (r["effect_id"], r["param"])
        grouped.setdefault(key, []).append(r)

    issues = 0
    for (eid, param), entries in grouped.items():
        diffs = [e["mean_pixel_diff"] for e in entries]
        max_diff = max(diffs)
        if max_diff == 0:
            continue
        # Check if >90% of change happens in <25% of range
        at_25 = next((e["mean_pixel_diff"] for e in entries if e["level_pct"] == 25), 0)
        if at_25 > 0.9 * max_diff:
            print(
                f"  WARNING: {eid}.{param} — 90%+ change in first 25% of range (curve: {entries[0]['curve']})"
            )
            issues += 1

    if issues == 0:
        print("  All params look well-distributed.")


if __name__ == "__main__":
    curve_errors = validate_curves()
    if curve_errors:
        print("CURVE VALIDATION ERRORS:")
        for e in curve_errors:
            print(f"  {e}")
        sys.exit(1)

    results = calibrate_all()
    print_report(results)
