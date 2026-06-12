#!/usr/bin/env python3
"""
PUX.1 token migration script.
Converts top-20 hardcoded hex values to CSS custom property references.
Decision logic is per-property/context, not blanket-replace.
Run from repo root: python3 migrate_tokens.py [--dry-run] [--verbose]

Handles multi-declaration lines (minified CSS) by finding the nearest
property name preceding each hex value.
"""

import re
import sys
from pathlib import Path

STYLES_DIR = Path("frontend/src/renderer/styles")

# Hex pattern: 3-8 hex digits (covers alpha variants like #0008)
HEX_PAT = re.compile(r"#[0-9a-fA-F]{3,8}\b")

# CSS property name pattern: word chars + hyphens, immediately before a colon
# Used to find the nearest property name before a hex in a multi-decl line.
# Matches things like "background", "border-left", "color", etc.
PROP_PAT = re.compile(r"([\w-]+)\s*:\s*[^;]*$")


def nearest_prop(line_text: str, hex_start: int) -> str:
    """
    Find the CSS property name most immediately preceding hex_start in line_text.
    Handles both single-decl lines ('  color: #888;') and
    multi-decl lines ('background: #333; border: 1px solid #444;').
    Returns the property name (lowercased), or '' if not found.
    """
    # Look at the substring from line start up to the hex position
    before = line_text[:hex_start]
    # Find the last property: value sequence ending just before the hex
    # A property declaration starts after ';' or '{' or start-of-line
    # We split on ';' and '{' to find the segment containing the hex
    segments = re.split(r"[;{]", before)
    last_seg = segments[-1] if segments else ""
    m = re.search(r"([\w-]+)\s*:", last_seg)
    if m:
        return m.group(1).lower()
    return ""


def classify_hex(hex_val: str, prop: str, selector: str) -> str | None:
    """
    Returns token var() to substitute, or None to leave as-is.
    prop: CSS property name (lowercased)
    selector: current selector block text (lowercased)
    """
    h = hex_val.lower()
    p = prop.strip()
    ctx = selector

    # ---- #1a1a1a — dark bg ----
    if h == "#1a1a1a":
        if any(
            x in ctx for x in ["body {", "body{", "app__transport", ".app {", ".app{"]
        ):
            return "var(--cx-bg-app)"
        return "var(--cx-bg-panel)"

    # ---- #4ade80 — tailwind green → ACID ----
    if h == "#4ade80":
        return "var(--cx-action)"

    # ---- #444 — medium gray ----
    if h == "#444":
        if any(x in p for x in ["border", "outline"]):
            return "var(--cx-line-2)"
        if "box-shadow" in p:
            return "var(--cx-line-2)"
        if "background" in p:
            return "var(--cx-bg-hover)"
        # color, stroke, fill → line-2 (structural gray)
        return "var(--cx-line-2)"

    # ---- #333 — surface-3 / raised ----
    if h == "#333":
        if "border" in p:
            return "var(--cx-line-1)"
        if "background" in p:
            return "var(--cx-bg-raised)"
        return "var(--cx-bg-raised)"

    # ---- #888 — mid gray text ----
    if h == "#888":
        if any(
            x in ctx
            for x in [
                "shortcut",
                "hint",
                "placeholder",
                "muted",
                "summary",
                "details",
                "description",
                "__secondary",
            ]
        ):
            return "var(--cx-text-3)"
        return "var(--cx-text-2)"

    # ---- #e0e0e0 / #e0e0e4 — near-white ----
    if h in ("#e0e0e0", "#e0e0e4"):
        return "var(--cx-text-1)"

    # ---- #fff — white ----
    if h == "#fff":
        if any(x in ctx for x in ["--error", "--danger", "--record", "destructive"]):
            return "var(--cx-danger-on)"
        return "var(--cx-text-1)"

    # ---- #ef4444 — tailwind red ----
    if h == "#ef4444":
        if "background" in p or "fill" in p:
            return "var(--cx-danger-fill)"
        return "var(--cx-danger-text)"

    # ---- #aaa — lighter gray ----
    if h == "#aaa":
        return "var(--cx-text-2)"

    # ---- #666 / #555 — dim gray ----
    if h in ("#666", "#555"):
        if any(x in ctx for x in ["--disabled", "disabled", "placeholder", "hint"]):
            return "var(--cx-text-disabled)"
        if "border" in p:
            return "var(--cx-line-2)"
        return "var(--cx-text-3)"

    # ---- #2a2a2a — raised panel ----
    if h == "#2a2a2a":
        return "var(--cx-bg-raised)"

    # ---- #ccc — near-white secondary ----
    if h == "#ccc":
        return "var(--cx-text-1)"

    # ---- #222 — deep panel ----
    if h == "#222":
        return "var(--cx-bg-panel)"

    # ---- #f59e0b — amber/warning ----
    if h == "#f59e0b":
        return "var(--cx-warn)"

    # ---- #22c55e — success green → ACID ----
    if h == "#22c55e":
        return "var(--cx-action)"

    # ---- purple/blue family → MOD/selection ----
    if h in ("#9b7bb5", "#3b82f6", "#6366f1", "#818cf8", "#a855f7", "#2196f3"):
        return "var(--cx-selection)"

    # ---- Extended surface ladder variants ----
    # These are near-matches to the token ladder — map to nearest step.
    # #000 → on-color-text for ACID fills (color: #000), or surface-0 for bg
    if h == "#000":
        if "background" in p or "fill" in p:
            return "var(--cx-surface-0)"
        # color: #000 = black text on active/accent bg → use action-on
        return "var(--cx-action-on)"
    # #0a0a0e → surface-0 (blue-tinted near-black)
    if h == "#0a0a0e":
        return "var(--cx-surface-0)"
    # #111 — between surface-0 and surface-1
    if h == "#111":
        return "var(--cx-bg-app)"
    # #1a1a22, #16161e, #1a1a2e — surface-1 variants with slight hue
    if h in ("#1a1a22", "#16161e", "#1a1a2e"):
        return "var(--cx-bg-app)"
    # #18181e, #1c1c24 — surface-2 variants
    if h in ("#18181e", "#1c1c24"):
        return "var(--cx-bg-panel)"
    # #1e1e1e, #1f1f1f, #1f1f2a, #232323 — surface-2/3 boundary
    if h in ("#1e1e1e", "#1f1f1f", "#1f1f2a", "#232323"):
        return "var(--cx-bg-raised)"
    # #20202a — matches --cx-surface-3 almost exactly
    if h == "#20202a":
        return "var(--cx-surface-3)"
    # #24242e, #252525, #252526 — surface-3 zone
    if h in ("#24242e", "#252525"):
        return "var(--cx-bg-raised)"
    # #2a2a34, #2a2a3e — surface-4 zone
    if h in ("#2a2a34", "#2a2a3e"):
        return "var(--cx-bg-hover)"
    # #3a3a3a — surface-4 zone
    if h == "#3a3a3a":
        return "var(--cx-bg-hover)"

    # ---- Additional text-tone variants ----
    # #777 — between text-2 and text-3; use text-3 (hint)
    if h == "#777":
        return "var(--cx-text-3)"
    # #999 — between text-2 and text-3; use text-2
    if h == "#999":
        return "var(--cx-text-2)"
    # #bbb, #ddd, #e5e5e5, #eee — near-white variants
    if h in ("#bbb", "#ddd", "#e5e5e5", "#eee"):
        return "var(--cx-text-1)"
    # #6b7280 — tailwind gray-500 (similar to text-3)
    if h == "#6b7280":
        return "var(--cx-text-3)"

    # ---- Additional accent variants ----
    # #dc2626 — deeper red → danger-fill
    if h == "#dc2626":
        return "var(--cx-danger-fill)"
    # #facc15, #fbbf24 — amber variants → warn
    if h in ("#facc15", "#fbbf24"):
        return "var(--cx-warn)"
    # #8b5cf6, #a5b4fc, #c7d2fe — purple variants → selection
    if h in ("#8b5cf6", "#a5b4fc", "#c7d2fe"):
        return "var(--cx-selection)"

    # ---- Performance track green tints (timeline.css) ----
    # These are green-tinted backgrounds for the performance track row.
    # Map to action-wash or surface variants (the track color is ACID-flavored).
    # #2a3a2e, #3a5a40 — dark green tinted panels → action-wash over surface-3
    # #3cc970 — lighter green → action (close to ACID)
    if h in ("#2a3a2e", "#3a5a40"):
        return "var(--cx-action-wash)"
    if h == "#3cc970":
        return "var(--cx-action)"

    # NOTE: The following are intentionally NOT migrated (kept as hex):
    # #ec4899 — magenta/pink (not in the Live Signal palette; operators.css special fx)
    # #06b6d4 — cyan (not in palette; operators.css special fx)
    # #1e3a5f, #2563eb, #93c5fd — update-banner blue tints (component-specific)
    # These are the tail the ratchet will handle in subsequent PRs.

    return None


def migrate_file(filepath: Path, dry_run: bool = False) -> tuple[int, int, list[str]]:
    """Returns (before_count, after_count, changes_list)."""
    if filepath.name == "tokens.css":
        return 0, 0, []

    text = filepath.read_text()
    orig_count = len(HEX_PAT.findall(text))

    lines = text.splitlines()
    result = []
    current_selector = ""
    changes: list[str] = []

    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()

        # Update selector context on block-opener lines
        if (
            stripped.endswith("{")
            and not stripped.startswith("/*")
            and not stripped.startswith("//")
        ):
            current_selector = stripped.lower()

        if not HEX_PAT.search(line):
            result.append(line)
            continue

        # Replace each hex, finding its nearest property name first
        def make_replacer(ln_text, sel, ln_no, fname):
            # We need a closure over the current line text for offset tracking.
            # We rebuild the line incrementally so offsets shift — use a list trick.
            # Actually use a callback that receives the match and uses match.start()
            # against the *original* line text to find nearest_prop.
            def replacer(m):
                hv = m.group(0)
                # Use position in original line text to find the right prop
                prop = nearest_prop(ln_text, m.start())
                token = classify_hex(hv, prop, sel)
                if token:
                    changes.append(f"  {fname}:{ln_no}: {prop}: {hv} -> {token}")
                    return token
                return hv

            return replacer

        new_line = HEX_PAT.sub(
            make_replacer(line, current_selector, lineno, filepath.name), line
        )
        result.append(new_line)

    new_text = "\n".join(result)
    if text.endswith("\n") and not new_text.endswith("\n"):
        new_text += "\n"

    new_count = len(HEX_PAT.findall(new_text))

    if not dry_run and new_text != text:
        filepath.write_text(new_text)

    return orig_count, new_count, changes


def main():
    dry_run = "--dry-run" in sys.argv
    verbose = "--verbose" in sys.argv

    print(f"PUX.1 token migration {'(DRY RUN) ' if dry_run else ''}")
    print(f"Styles dir: {STYLES_DIR.resolve()}")
    print()

    total_before = 0
    total_after = 0
    all_changes: list[str] = []

    css_files = sorted(STYLES_DIR.glob("*.css"))
    print(f"  {'File':<28} {'Before':>8} {'After':>8} {'Delta':>8}")
    print("  " + "-" * 56)

    for f in css_files:
        if f.name == "tokens.css":
            print(f"  {'tokens.css':<28} {'(exempt)':>8}")
            continue
        before, after, changes = migrate_file(f, dry_run=dry_run)
        delta = after - before
        total_before += before
        total_after += after
        all_changes.extend(changes)
        marker = " <--" if delta < 0 else ""
        print(f"  {f.name:<28} {before:>8} {after:>8} {delta:>+8}{marker}")

    print("  " + "-" * 56)
    print(
        f"  {'TOTAL':<28} {total_before:>8} {total_after:>8} {total_after - total_before:>+8}"
    )
    print()
    print(f"  Substitutions made: {len(all_changes)}")

    if verbose:
        print()
        for c in all_changes:
            print(c)


if __name__ == "__main__":
    main()
