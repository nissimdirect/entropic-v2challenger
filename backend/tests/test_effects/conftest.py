"""Directory-local guard against effect-registry pollution.

F4b regression: TestReservedParamNamespace.test_register_allows_normal_param_keys
(test_registry.py) registers `test._reserved_namespace_ok` with a bad-signature
`_noop(self, frame, params, state)` fn directly into the shared, module-level
`effects.registry._REGISTRY` dict and never unregisters it. Under
`pytest-xdist --dist loadfile`, whenever that test lands on the same worker
process as `test_integration.py::test_all_effects_process_without_crash`
(which iterates every registered effect and calls it with real render
kwargs), the leaked entry crashes with:
    TypeError: TestReservedParamNamespace._noop() got an unexpected
    keyword argument 'frame_index'

Snapshot/restore the registry around every test in this directory so no
test-only registration can survive past the test that created it.
"""

import pytest

from effects.registry import _REGISTRY


@pytest.fixture(autouse=True)
def _restore_effect_registry():
    snapshot = dict(_REGISTRY)
    try:
        yield
    finally:
        _REGISTRY.clear()
        _REGISTRY.update(snapshot)
