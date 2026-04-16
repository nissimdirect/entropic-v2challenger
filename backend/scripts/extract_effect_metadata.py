"""Extract effect metadata for oracle-category classification.

Walks backend/src/effects/fx/*.py, extracts EFFECT_ID, EFFECT_CATEGORY,
PARAMS keys, and the first ~30 lines of each apply() body. Emits JSON so
a classifier (LLM or regex) can categorize effects into oracle-test
categories (transform/filter/spatial_permutation/channel/temporal/symbolic).
"""

from __future__ import annotations

import ast
import json
from pathlib import Path


EFFECTS_DIR = Path(__file__).resolve().parent.parent / "src" / "effects" / "fx"
OUTPUT = (
    Path(__file__).resolve().parent.parent
    / "tests"
    / "oracles"
    / "_effect_metadata.json"
)


def extract_one(py_file: Path) -> dict | None:
    src = py_file.read_text()
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return None

    meta: dict = {
        "module": py_file.stem,
        "file": str(py_file.relative_to(py_file.parents[3])),
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                name = target.id
                if name in ("EFFECT_ID", "EFFECT_NAME", "EFFECT_CATEGORY"):
                    if isinstance(node.value, ast.Constant):
                        meta[name.lower()] = node.value.value
                elif name == "PARAMS" and isinstance(node.value, ast.Dict):
                    meta["param_keys"] = [
                        k.value for k in node.value.keys if isinstance(k, ast.Constant)
                    ]

        if isinstance(node, ast.FunctionDef) and node.name == "apply":
            lines = src.splitlines()
            start = node.lineno - 1
            end = min(start + 40, len(lines))
            meta["apply_body"] = "\n".join(lines[start:end])
            meta["uses_state_in"] = (
                "state_in" in meta["apply_body"]
                and "state_in is not None" in meta["apply_body"]
            )
            meta["returns_state"] = (
                "return " in meta["apply_body"]
                and "None" not in meta["apply_body"].split("return")[-1][:80]
            )

    return meta if "effect_id" in meta else None


def main() -> None:
    files = sorted(EFFECTS_DIR.glob("*.py"))
    files = [f for f in files if f.name != "__init__.py"]
    rows = []
    for f in files:
        m = extract_one(f)
        if m is not None:
            rows.append(m)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(rows, indent=2))
    print(f"Wrote {len(rows)} effects to {OUTPUT.relative_to(Path.home())}")


if __name__ == "__main__":
    main()
