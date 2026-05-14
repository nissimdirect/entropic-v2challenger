---
title: Entropic Effect Registry is Explicit-Import, Not Auto-Discovery
date: 2026-05-14
tags: [effects, registry, integration, stale-memory, gotcha]
problem: New effect file silently fails to register; CLI says "unknown effect: fx.X"
severity: medium
---

# Problem

When adding a new effect at `backend/src/effects/fx/<name>.py`, the file is correctly written with `EFFECT_ID`, `EFFECT_NAME`, `EFFECT_CATEGORY`, `PARAMS`, and `apply()`, but the CLI returns:

```
ERROR: unknown effect: fx.<name>
       run `python src/cli.py list` to see available effects
```

Unit tests that call `apply()` directly pass. Oracle tests that go through `cli.py` fail at `run_cli_apply`.

# Root Cause

The `entropic.md` memory file claims (and an empty `fx/__init__.py` superficially supports) that "the registry walks the dir" for auto-discovery. **This is wrong.** As of 2026-05-14 (verified live), `backend/src/effects/registry.py` uses an **explicit-import** mechanism in `_auto_register()`:

```python
def _auto_register():
    # --- Original effects (65) ---
    from effects.fx import (
        invert,
        hue_shift,
        # ... ~60 more explicit names
        emboss,
        # NEW EFFECTS MUST BE ADDED HERE ↑
        torn_edges,
    )
    # ... more import blocks for Phase 8, 12, etc.

    mods = [
        invert,
        hue_shift,
        # ... mirrored list of module objects
        emboss,
        torn_edges,  # ← AND HERE
    ]

    # ... then the register loop:
    for mod in mods + phase8_mods + ...:
        register(mod.EFFECT_ID, mod.apply, mod.PARAMS, mod.EFFECT_NAME, mod.EFFECT_CATEGORY)
```

A new effect file is invisible to the runtime registry until it appears in **both** the `from effects.fx import (...)` block **and** the corresponding `mods` (or `phaseN_mods`) list.

The memory was 27 days old when consulted; the system reminder flagged staleness on read. Architectural claims about live code paths must be verified against the file, not trusted from memory.

# Solution

When adding a new effect:

1. Write `backend/src/effects/fx/<name>.py` with the standard pure-function ABI.
2. Open `backend/src/effects/registry.py`.
3. Add `<name>,` to the appropriate `from effects.fx import (...)` block. Place near a semantically similar effect (e.g. new texture effect → near `emboss` and `noise`). Each effect appears in one import block based on its release phase.
4. Add `<name>,` to the matching `mods = [...]` (or `phase8_mods`, `phase12_mods`) list — keep order parallel to the import block for readability.
5. Verify with:
   ```python
   from effects import registry
   assert registry.get("fx.<name>") is not None
   ```
6. Verify with the CLI:
   ```bash
   PYTHONPATH=src python3 src/cli.py list | grep fx.<name>
   ```

**Trick:** if a sibling effect already exists in both lists, use a unique short anchor in `Edit(replace_all=True)` to add the new entry in both places with one tool call:

```
old: "        emboss,"
new: "        emboss,
        <name>,"
```

Confirm with `grep -c "        emboss,"` returns exactly `2` first — one occurrence per list.

# Prevention

- **Always verify memory before recommending architecture.** If the memory file has a staleness warning on read (system-reminder: "This memory is N days old"), don't quote architectural claims without re-checking the live file. The relevant rule is `feedback_verify-before-architecting.md`.
- **Add a registry probe to the test suite for new effects.** A 3-line assertion that `registry.get("fx.<name>") is not None` catches the "wrote the file, forgot the registry" mistake at unit-test time, not oracle-test time:
  ```python
  def test_effect_is_registered():
      from effects import registry
      assert registry.get("fx.<name>") is not None, "Effect not in registry — add to registry.py _auto_register()"
  ```
- **Refresh `entropic.md`** to remove the "registry walks the dir" claim and replace with "registry uses explicit-import in registry.py:_auto_register()." This avoids future agents reading the stale claim and skipping the registry edit.

# Related

- Plan-level pass missed this because no agent grepped the registry; the memory file claim was trusted. Cost: one round-trip after the oracle test failed.
- The `_categorization.json` file was ALSO restructured on main between memory snapshot and this session (deleted entirely — hand-tuned oracles replaced auto-categorization). Same lesson: verify before architecting.
- See `feedback_verify-before-architecting.md` and `feedback_audits-are-evidence-generators.md`.
