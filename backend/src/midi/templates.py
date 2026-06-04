"""Hardware templates for common controllers (Vision §E5 priorities).

Templates load into MIDIMappingRegistry as the active mapping. Users can
then customize or override individual bindings via Learn.

Three templates ship in v1 per Vision Round 1 decisions:
- Novation Launchpad X (88-key grid; 8 top CC knobs)
- Novation Launchpad Mini Mk3 (64-key grid only)
- Novation Launchpad Pro Mk3 (96-key + 8 macro CCs + 8 scene CCs)
"""

from __future__ import annotations

from .registry import (
    MIDIBinding,
    MIDIMapping,
    MIDISource,
    MIDISourceKind,
)


def _make_launchpad_x_template() -> MIDIMapping:
    """Launchpad X — 8x8 grid + 8 top CCs.

    Maps:
      - Top row CC 21-28 → perform mode knobs 1-8
      - Pads (channel 0, notes 11-88) → pad triggers 1-64
      - Right column scene buttons → choke group selectors
    """
    m = MIDIMapping(
        name="Launchpad X (default)",
        description="Novation Launchpad X — perform knobs + 8x8 pad grid",
    )

    # 8 CC knobs on top row
    for i in range(8):
        m.add(
            MIDIBinding(
                source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=21 + i),
                dst_param_path=f"perform.knob{i + 1}",
                scale_min=0.0,
                scale_max=1.0,
            )
        )

    # 64 pad triggers — grid notes 11-18, 21-28, ..., 81-88
    pad_index = 0
    for row in range(8):
        for col in range(8):
            note = (row + 1) * 10 + (col + 1)
            m.add(
                MIDIBinding(
                    source=MIDISource(kind=MIDISourceKind.NOTE, channel=0, number=note),
                    dst_param_path=f"perform.pad{pad_index + 1}",
                )
            )
            pad_index += 1

    return m


def _make_launchpad_mini_mk3_template() -> MIDIMapping:
    """Launchpad Mini Mk3 — 8x8 pad grid only (no CC knobs)."""
    m = MIDIMapping(
        name="Launchpad Mini Mk3 (default)",
        description="Novation Launchpad Mini Mk3 — 8x8 pad grid",
    )
    pad_index = 0
    for row in range(8):
        for col in range(8):
            note = (row + 1) * 10 + (col + 1)
            m.add(
                MIDIBinding(
                    source=MIDISource(kind=MIDISourceKind.NOTE, channel=0, number=note),
                    dst_param_path=f"perform.pad{pad_index + 1}",
                )
            )
            pad_index += 1
    return m


def _make_launchpad_pro_mk3_template() -> MIDIMapping:
    """Launchpad Pro Mk3 — 8x8 + 8 macro CCs + 8 scene CCs."""
    m = MIDIMapping(
        name="Launchpad Pro Mk3 (default)",
        description="Novation Launchpad Pro Mk3 — 8 macros + 8 scenes + 8x8 grid",
    )
    # 8 macro CCs (top row, CC 70-77 default Mk3 layout)
    for i in range(8):
        m.add(
            MIDIBinding(
                source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=70 + i),
                dst_param_path=f"perform.macro{i + 1}",
            )
        )
    # 8 scene CCs (CC 89-96)
    for i in range(8):
        m.add(
            MIDIBinding(
                source=MIDISource(kind=MIDISourceKind.CC, channel=0, number=89 + i),
                dst_param_path=f"perform.scene{i + 1}",
            )
        )
    # 64 pads
    pad_index = 0
    for row in range(8):
        for col in range(8):
            note = (row + 1) * 10 + (col + 1)
            m.add(
                MIDIBinding(
                    source=MIDISource(kind=MIDISourceKind.NOTE, channel=0, number=note),
                    dst_param_path=f"perform.pad{pad_index + 1}",
                )
            )
            pad_index += 1
    return m


LAUNCHPAD_X_TEMPLATE = _make_launchpad_x_template
LAUNCHPAD_MINI_MK3_TEMPLATE = _make_launchpad_mini_mk3_template
LAUNCHPAD_PRO_MK3_TEMPLATE = _make_launchpad_pro_mk3_template

SUPPORTED_TEMPLATES = (
    "launchpad_x",
    "launchpad_mini_mk3",
    "launchpad_pro_mk3",
)


def load_template(name: str) -> MIDIMapping:
    if name == "launchpad_x":
        return LAUNCHPAD_X_TEMPLATE()
    if name == "launchpad_mini_mk3":
        return LAUNCHPAD_MINI_MK3_TEMPLATE()
    if name == "launchpad_pro_mk3":
        return LAUNCHPAD_PRO_MK3_TEMPLATE()
    raise ValueError(f"unknown template {name!r}; supported: {SUPPORTED_TEMPLATES}")
