import hashlib
from uuid import UUID

from austrac_reporting.config import Settings
from austrac_reporting.crypto_hash import compute_source_hash
from austrac_reporting.models import (
    GatewayResult,
    NarrativeDraft,
    ReportingEntity,
    ReportPayload,
    ReportType,
    SubjectDetails,
    SubjectType,
)


class TestModels:
    def test_report_payload_default_uuid(self) -> None:
        entity = ReportingEntity(
            name="Test Pty Ltd",
            abn="12345678901",
            sector="REMIT",
            contact_email="test@test.com",
            contact_phone="+61 2 9999 0000",
        )
        subject = SubjectDetails(subject_type=SubjectType.INDIVIDUAL, full_name="John Doe")
        payload = ReportPayload(report_type=ReportType.SMR, reporting_entity=entity, subject=subject)
        assert isinstance(payload.report_id, UUID)

    def test_narrative_draft_requires_approval(self) -> None:
        draft = NarrativeDraft(draft_text="Suspicious activity observed.")
        assert draft.requires_human_approval is True

    def test_gateway_result(self) -> None:
        result = GatewayResult(message_id=UUID(int=1), status="transmitted", http_status=200, receipt_id="R-001")
        assert result.receipt_id == "R-001"


class TestCryptoHash:
    def test_compute_source_hash(self) -> None:
        data = b"source document payload"
        h = compute_source_hash(data)
        assert len(h) == 64
        assert h == hashlib.sha256(data).hexdigest()


class TestConfig:
    def test_settings_defaults(self) -> None:
        s = Settings()
        assert s.austrac_api_url == "https://api-sandbox.austrac.gov.au/v1"
        assert s.max_transmit_retries == 3
