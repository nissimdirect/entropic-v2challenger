"""E5 Hardware MIDI Learn (Vision §E5 Tier 3).

Backend MIDI mapping registry. A mapping ties a MIDI source
(channel + CC# or note#) to a destination param path. Templates ship
for the Novation Launchpad family; arbitrary-CC Learn lets users wire
any controller without a template.

Frontend invokes:
- mapping_registry.start_learn(dst_param_path)
- on next MIDI event, the registry captures + binds
- mapping_registry.persist(project_path) round-trips via .dna
"""

from .registry import (
    MIDIBinding,
    MIDIMapping,
    MIDIMappingRegistry,
    MIDISource,
    MIDIEvent,
    LearnSession,
    global_midi_registry,
    reset_global_midi_registry_for_testing,
)
from .templates import (
    LAUNCHPAD_X_TEMPLATE,
    LAUNCHPAD_MINI_MK3_TEMPLATE,
    LAUNCHPAD_PRO_MK3_TEMPLATE,
    SUPPORTED_TEMPLATES,
    load_template,
)

__all__ = [
    "MIDIBinding",
    "MIDIMapping",
    "MIDIMappingRegistry",
    "MIDISource",
    "MIDIEvent",
    "LearnSession",
    "LAUNCHPAD_X_TEMPLATE",
    "LAUNCHPAD_MINI_MK3_TEMPLATE",
    "LAUNCHPAD_PRO_MK3_TEMPLATE",
    "SUPPORTED_TEMPLATES",
    "global_midi_registry",
    "load_template",
    "reset_global_midi_registry_for_testing",
]
