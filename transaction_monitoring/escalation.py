from __future__ import annotations

from transaction_monitoring.models import Severity

SEVERITY_ORDER = [Severity.LOW, Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL]


def _severity_index(sev: Severity) -> int:
    return SEVERITY_ORDER.index(sev)


def escalate_severity(
    base_severity: Severity,
    document_risk_score: float,
    structuring_detected: bool = False,
) -> Severity:
    """Escalate alert severity based on document risk and structuring.

    Rules:
    - document_risk_score >= 0.7 boosts by 2 levels (capped at CRITICAL)
    - document_risk_score >= 0.4 boosts by 1 level
    - structuring_detected boosts by 1 additional level
    """
    idx = _severity_index(base_severity)

    if document_risk_score >= 0.7:
        idx += 2
    elif document_risk_score >= 0.4:
        idx += 1

    if structuring_detected:
        idx += 1

    return SEVERITY_ORDER[min(idx, len(SEVERITY_ORDER) - 1)]
