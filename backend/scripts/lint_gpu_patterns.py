#!/usr/bin/env python3
"""Forbidden-pattern AST lint for GPU/Metal usage (SPEC-3 §2.2, gap 5).

SG-1's contract is that EVERY Metal/MLX GPU allocation is owned by an
RAII wrapper (`MLXGPUResource`) at allocation time. This lint enforces
that statically by walking `backend/src/` and flagging:

  (a) Raw `mlx.core` allocation calls — `zeros`, `ones`, `array`, `full`
      (and the `mx.*` / `mlx.core.*` aliases) — anywhere OUTSIDE the
      sanctioned wrapper module `safety/mlx_resources.py`.
  (b) Module-level GPU objects: an `mlx.core` allocation evaluated at
      import time (no clear ownership / lifetime).
  (c) Any Metal / MTL pyobjc usage (`import Metal`, `MTLCreateSystemDefaultDevice`,
      `*.makeTexture`, `MTLDevice`, etc.) ANYWHERE — the project's Metal
      backend is MLX; raw pyobjc-Metal bypasses the whole RAII layer.

Exit 0 with no findings; exit 1 listing every finding (file:line: msg).

ALLOWLIST is intentionally EMPTY. Adding an entry requires a one-line
justification comment next to it. Per the P6.4 packet: as of authoring,
`git grep mlx backend/src` is empty (only tests reference MLX), so a
clean tree must produce ZERO findings. A finding means new code merged
since — investigate, do not blanket-allowlist.
"""

from __future__ import annotations

import argparse
import ast
import sys
from pathlib import Path

# The ONLY module permitted to make raw mlx.core allocation calls — it is
# the RAII wrapper itself (`MLXGPUResource.allocate`). Relative to backend/src.
ALLOWED_RAW_ALLOC_MODULES: frozenset[str] = frozenset(
    {
        "safety/mlx_resources.py",
    }
)

# mlx.core functions that allocate device memory and therefore must be
# owned by a wrapper.
MLX_ALLOC_FUNCS: frozenset[str] = frozenset(
    {"zeros", "ones", "array", "full", "empty", "arange", "ones_like", "zeros_like"}
)

# Aliases under which mlx.core is commonly imported.
MLX_MODULE_ALIASES: frozenset[str] = frozenset({"mlx", "mx", "core"})

# Substrings that indicate raw pyobjc-Metal usage (forbidden everywhere).
METAL_PYOBJC_MARKERS: tuple[str, ...] = (
    "MTLCreateSystemDefaultDevice",
    "MTLDevice",
    "MTLTexture",
    "MTLBuffer",
    "MTLCommandQueue",
    "makeTexture",
    "newBufferWithLength",
    "newTextureWithDescriptor",
)


class Finding:
    __slots__ = ("path", "line", "col", "msg")

    def __init__(self, path: str, line: int, col: int, msg: str) -> None:
        self.path = path
        self.line = line
        self.col = col
        self.msg = msg

    def __str__(self) -> str:
        return f"{self.path}:{self.line}:{self.col}: {self.msg}"


def _attr_chain(node: ast.AST) -> str:
    """Render a dotted attribute/name chain, e.g. `mlx.core.zeros`."""
    parts: list[str] = []
    cur: ast.AST | None = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    return ".".join(reversed(parts))


def _is_mlx_alloc_call(call: ast.Call) -> tuple[bool, str]:
    """Return (is_mlx_alloc, rendered_chain) for a Call node.

    Matches `mlx.core.zeros(...)`, `mx.zeros(...)`, `core.array(...)`,
    `mlx.zeros(...)` — any attribute call whose final attr is an alloc
    func AND whose root name is an mlx alias.
    """
    func = call.func
    if not isinstance(func, ast.Attribute):
        return (False, "")
    if func.attr not in MLX_ALLOC_FUNCS:
        return (False, "")
    chain = _attr_chain(func)
    root = chain.split(".", 1)[0]
    if root in MLX_MODULE_ALIASES:
        return (True, chain)
    return (False, "")


class _GPUPatternVisitor(ast.NodeVisitor):
    def __init__(self, rel_path: str, allow_raw_alloc: bool) -> None:
        self.rel_path = rel_path
        self.allow_raw_alloc = allow_raw_alloc
        self.findings: list[Finding] = []
        # Stack of scope kinds so we can detect module-level allocations.
        self._scope_depth = 0  # 0 == module level

    # --- scope tracking ---------------------------------------------------
    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._scope_depth += 1
        self.generic_visit(node)
        self._scope_depth -= 1

    visit_AsyncFunctionDef = visit_FunctionDef  # type: ignore[assignment]

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        # Class body is still "module-ish" for ownership purposes (a class
        # attribute holding a GPU buffer is exactly the forbidden case),
        # but treat method bodies (FunctionDef children) via their own
        # depth bump. Bump so a bare `x = mx.zeros(...)` inside a class
        # body is flagged as module-level-ish ownership.
        self.generic_visit(node)

    # --- imports ----------------------------------------------------------
    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.name == "Metal" or alias.name.startswith("Metal"):
                self.findings.append(
                    Finding(
                        self.rel_path,
                        node.lineno,
                        node.col_offset,
                        f"forbidden raw pyobjc-Metal import {alias.name!r} — "
                        "use MLXGPUResource (the MLX backend) instead",
                    )
                )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        if node.module and (node.module == "Metal" or node.module.startswith("Metal")):
            self.findings.append(
                Finding(
                    self.rel_path,
                    node.lineno,
                    node.col_offset,
                    f"forbidden raw pyobjc-Metal import from {node.module!r} — "
                    "use MLXGPUResource instead",
                )
            )
        self.generic_visit(node)

    # --- calls ------------------------------------------------------------
    def visit_Call(self, node: ast.Call) -> None:
        is_alloc, chain = _is_mlx_alloc_call(node)
        if is_alloc and not self.allow_raw_alloc:
            self.findings.append(
                Finding(
                    self.rel_path,
                    node.lineno,
                    node.col_offset,
                    f"raw mlx allocation {chain!r}() outside a GPUResource "
                    "wrapper — allocate via MLXGPUResource.allocate()",
                )
            )
        elif is_alloc and self.allow_raw_alloc and self._scope_depth == 0:
            # Even in the sanctioned wrapper module, a module-level (import
            # time) allocation has no owner / lifetime — always forbidden.
            self.findings.append(
                Finding(
                    self.rel_path,
                    node.lineno,
                    node.col_offset,
                    f"module-level GPU allocation {chain!r}() — no clear "
                    "ownership; allocate inside a function/method",
                )
            )

        # Metal pyobjc marker on the call target (e.g. dev.makeTexture()).
        chain_str = (
            _attr_chain(node.func)
            if isinstance(node.func, ast.Attribute)
            else (node.func.id if isinstance(node.func, ast.Name) else "")
        )
        for marker in METAL_PYOBJC_MARKERS:
            if marker in chain_str:
                self.findings.append(
                    Finding(
                        self.rel_path,
                        node.lineno,
                        node.col_offset,
                        f"forbidden raw Metal/MTL usage {chain_str!r} — "
                        "GPU memory must go through MLXGPUResource",
                    )
                )
                break
        self.generic_visit(node)

    # --- bare names (MTLDevice referenced as a type, etc.) ----------------
    def visit_Name(self, node: ast.Name) -> None:
        for marker in METAL_PYOBJC_MARKERS:
            if marker in node.id:
                self.findings.append(
                    Finding(
                        self.rel_path,
                        node.lineno,
                        node.col_offset,
                        f"forbidden raw Metal/MTL reference {node.id!r} — "
                        "GPU memory must go through MLXGPUResource",
                    )
                )
                break
        self.generic_visit(node)


def lint_source(source: str, rel_path: str) -> list[Finding]:
    """Lint a single source string. `rel_path` decides the alloc allowlist."""
    allow_raw_alloc = rel_path in ALLOWED_RAW_ALLOC_MODULES
    try:
        tree = ast.parse(source, filename=rel_path)
    except SyntaxError as exc:
        return [
            Finding(
                rel_path, exc.lineno or 0, exc.offset or 0, f"syntax error: {exc.msg}"
            )
        ]
    visitor = _GPUPatternVisitor(rel_path, allow_raw_alloc)
    visitor.visit(tree)
    return visitor.findings


def lint_tree(src_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for py in sorted(src_root.rglob("*.py")):
        rel = py.relative_to(src_root).as_posix()
        try:
            source = py.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            findings.append(Finding(rel, 0, 0, f"could not read: {exc}"))
            continue
        findings.extend(lint_source(source, rel))
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--src",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "src",
        help="backend/src root to lint (default: ../src relative to this script)",
    )
    args = parser.parse_args(argv)

    src_root: Path = args.src
    if not src_root.is_dir():
        print(f"lint_gpu_patterns: src root not found: {src_root}", file=sys.stderr)
        return 2

    findings = lint_tree(src_root)
    if findings:
        print(f"GPU-pattern lint: {len(findings)} finding(s):", file=sys.stderr)
        for f in findings:
            print(f"  {f}", file=sys.stderr)
        print(
            "\nEvery GPU allocation must be owned by MLXGPUResource. "
            "If a finding is a false positive, add it to ALLOWED_RAW_ALLOC_MODULES "
            "with a justification comment — do NOT blanket-allowlist.",
            file=sys.stderr,
        )
        return 1

    print(f"GPU-pattern lint: clean ({src_root}) — 0 findings.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
