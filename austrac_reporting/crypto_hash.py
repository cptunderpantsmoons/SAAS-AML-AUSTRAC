from __future__ import annotations

import hashlib


def compute_source_hash(data: bytes) -> str:
    """Compute SHA-256 hash of source document data for AUSTRAC integrity."""
    return hashlib.sha256(data).hexdigest()
