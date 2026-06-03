"""`.dna` portable patch format package (SPEC-6).

Strict no-regression forward+backward compatibility. Unknown fields
preserved verbatim on read so future schema additions don't break
older readers' round-trip. SG-2 resource budget descriptor embedded.
"""

from .codec import (
    DNAFormatError,
    DNAPatch,
    DNAVersionError,
    MAGIC,
    SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
    read_dna,
    write_dna,
)
from .budget import BudgetDescriptor, default_budget, validate_budget

__all__ = [
    "DNAFormatError",
    "DNAPatch",
    "DNAVersionError",
    "MAGIC",
    "SCHEMA_VERSION",
    "SUPPORTED_SCHEMA_VERSIONS",
    "BudgetDescriptor",
    "default_budget",
    "validate_budget",
    "read_dna",
    "write_dna",
]
