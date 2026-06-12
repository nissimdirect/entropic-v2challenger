"""Safety contracts package.

Hosts the cross-cutting safety gates (SG-*) as sibling modules:

- ``gpu_resources`` (SG-1): GPU handle RAII finalizer + pool ceiling + leak==0.
- ``pressure`` (SG-8): memory-pressure auto-disable + canonical 10-stage degrade order.

Import submodules directly, e.g.::

    from safety.gpu_resources import GPUResourcePool
    from safety.pressure import PressureMonitor

The package root stays import-free on purpose, so each gate can land in any
merge order without coupling its import to a sibling module's presence.
"""
