"""Safety package — promoted from safety.py to support SG-8 + future contracts.

The legacy module-level safety.py is preserved as backward-compat shim until
the import path migration completes (see PR #11). PR #6 adds `pressure`
subpackage for SG-8 memory-pressure auto-disable (DEC-Q7-010 + DEC-Q7-011).
"""
