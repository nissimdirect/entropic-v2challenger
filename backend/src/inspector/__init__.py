"""I1 Inspector — Surface A probes (Vision PRD).

The inspector exposes "probe points" along the render pipeline so users
can see live values flowing through their effect chain: param input,
param after modulation, lane output, modulation amount. The frontend
subscribes to probe events via ZMQ; the backend emits them when the
inspector is mounted (otherwise emission is gated to avoid overhead
in non-inspecting renders).
"""

from .registry import (
    MAX_PROBES,
    Probe,
    ProbeKind,
    ProbeRegistry,
    ProbeSnapshot,
    global_probe_registry,
    reset_global_probe_registry_for_testing,
)

__all__ = [
    "MAX_PROBES",
    "Probe",
    "ProbeKind",
    "ProbeRegistry",
    "ProbeSnapshot",
    "global_probe_registry",
    "reset_global_probe_registry_for_testing",
]
