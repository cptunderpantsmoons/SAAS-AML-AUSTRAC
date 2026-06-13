from __future__ import annotations

import hashlib
from typing import Any
from unittest.mock import patch
from uuid import UUID

import httpx
import pytest
from austrac_reporting.app import app
from austrac_reporting.config import Settings
from austrac_reporting.crypto_hash import compute_source_hash
from austrac_reporting.generators.ifti_e import IFTIEGenerator
from austrac_reporting.generators.smr import SMRGenerator
from austrac_reporting.generators.ttr import TTRGenerator
from austrac_reporting.models import (
    DeadLetterEntry,
    GatewayResult,
    GenerateReportRequest,
    NarrativeDraft,
    ReportingEntity,
    ReportPayload,
    ReportType,
    SubjectDetails,
    SubjectType,
    SuspicionGrounds,
    TransactionDetail,
)
from austrac_reporting.xml_schemas import XSDValidator
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError


def _make_payload(report_type: ReportType, transactions: list[TransactionDetail] | None = None) -> ReportPayload:
    entity = ReportingEntity(
        name="Test Pty Ltd",
        abn="12345678901",
        sector="REMIT",
        contact_email="test@test.com",
        contact_phone="+61 2 9999 0000",
    )
    subject = SubjectDetails(subject_type=SubjectType.INDIVIDUAL, full_name="John Doe")
    return ReportPayload(
        report_type=report_type,
        reporting_entity=entity,
        subject=subject,
        transactions=transactions or [],
        source_data_hash="aabbccdd",
        suspicion=SuspicionGrounds(grounds=["structuring", "smurfing"], risk_indicators=["rapid succession"]),
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

    def test_report_payload_invalid_risk_score(self) -> None:
        entity = ReportingEntity(
            name="Test", abn="12345678901", sector="REMIT", contact_email="a@b.com", contact_phone="+61",
        )
        subject = SubjectDetails(subject_type=SubjectType.INDIVIDUAL, full_name="John")
        with pytest.raises(ValidationError):
            ReportPayload(report_type=ReportType.SMR, reporting_entity=entity, subject=subject, document_risk_score=1.5)

    def test_transaction_detail_amount_positive(self) -> None:
        with pytest.raises(ValidationError):
            TransactionDetail(transaction_id="T1", date="2024-01-01", amount=-100)

    def test_generate_report_request(self) -> None:
        entity = ReportingEntity(
            name="Test", abn="12345678901", sector="REMIT", contact_email="a@b.com", contact_phone="+61",
        )
        subject = SubjectDetails(subject_type=SubjectType.INDIVIDUAL, full_name="John")
        payload = ReportPayload(report_type=ReportType.SMR, reporting_entity=entity, subject=subject)
        req = GenerateReportRequest(payload=payload, include_narrative=True)
        assert req.include_narrative is True

    def test_dead_letter_entry(self) -> None:
        entry = DeadLetterEntry(message_id=UUID(int=1), payload={"k": "v"}, error_message="timeout")
        assert entry.retry_count == 0


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
        assert s.gateway_timeout_seconds == 30.0
        assert s.dedup_cache_ttl_seconds == 3600
        assert s.llm_provider == "local_llama"


class TestXSDValidation:
    def test_validate_smr_valid(self) -> None:
        xml = '''<?xml version="1.0"?>
        <SuspiciousMatterReport>
            <ReportId>r1</ReportId>
            <ReportingEntity>
                <Name>Test</Name><ABN>123</ABN><Sector>Remit</Sector>
                <ContactEmail>a@b.com</ContactEmail><ContactPhone>+61</ContactPhone>
            </ReportingEntity>
            <Subject><SubjectType>individual</SubjectType><FullName>John</FullName></Subject>
            <SuspicionDetails>
                <Narrative>Test</Narrative>
                <Grounds><Ground>G1</Ground></Grounds>
            </SuspicionDetails>
            <Transactions>
                <Transaction>
                    <TransactionId>T1</TransactionId><Date>2024-01-01</Date>
                    <Amount>1000</Amount><Currency>AUD</Currency>
                </Transaction>
            </Transactions>
            <SourceDataHash>abc123</SourceDataHash>
            <CreatedAt>2024-01-01T00:00:00Z</CreatedAt>
        </SuspiciousMatterReport>'''
        valid, errors = XSDValidator.validate(ReportType.SMR, xml)
        assert valid is True
        assert errors == []

    def test_validate_smr_invalid_missing_element(self) -> None:
        xml = '''<?xml version="1.0"?>
        <SuspiciousMatterReport>
            <ReportId>r1</ReportId>
            <ReportingEntity>
                <Name>Test</Name><ABN>123</ABN><Sector>Remit</Sector>
                <ContactEmail>a@b.com</ContactEmail><ContactPhone>+61</ContactPhone>
            </ReportingEntity>
        </SuspiciousMatterReport>'''
        valid, errors = XSDValidator.validate(ReportType.SMR, xml)
        assert valid is False
        assert len(errors) > 0

    def test_xsd_file_not_found(self, tmp_path) -> None:
        import austrac_reporting.xml_schemas as xml_schemas_mod
        import pytest
        from austrac_reporting.xml_schemas import XSDValidator

        # Reset the schema cache and point XSD_DIR at an empty directory so
        # no XSD file exists for ``ReportType.SMR``.  This exercises the
        # missing-file branch of ``_load_schema``.
        original_dir = xml_schemas_mod.XSD_DIR
        with patch.object(XSDValidator, "_schemas", {}):
            xml_schemas_mod.XSD_DIR = tmp_path
            try:
                with pytest.raises(ValueError, match="XSD schema not found"):
                    XSDValidator._load_schema(ReportType.SMR)
            finally:
                xml_schemas_mod.XSD_DIR = original_dir


class TestSMRGenerator:
    def test_smr_build_valid(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=5000, currency="AUD")
        payload = _make_payload(ReportType.SMR, [tx])
        gen = SMRGenerator(payload)
        xml = gen.build(narrative="Test narrative")
        assert "SuspiciousMatterReport" in xml
        assert "Test narrative" in xml
        valid, errors = XSDValidator.validate(ReportType.SMR, xml)
        assert valid is True, errors

    def test_smr_without_narrative(self) -> None:
        tx = TransactionDetail(transaction_id="T2", date="2024-01-02", amount=3000, currency="AUD")
        payload = _make_payload(ReportType.SMR, [tx])
        gen = SMRGenerator(payload)
        xml = gen.build()
        assert "structuring" in xml
        valid, errors = XSDValidator.validate(ReportType.SMR, xml)
        assert valid is True, errors


class TestTTRGenerator:
    def test_ttr_build_valid(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=15000, currency="AUD", accounts=["ACC1"])
        payload = _make_payload(ReportType.TTR, [tx])
        gen = TTRGenerator(payload)
        xml = gen.build()
        assert "ThresholdTransactionReport" in xml
        assert "ThresholdCrossed" in xml
        assert "true" in xml
        valid, errors = XSDValidator.validate(ReportType.TTR, xml)
        assert valid is True, errors

    def test_ttr_below_threshold(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=1000, currency="AUD")
        payload = _make_payload(ReportType.TTR, [tx])
        gen = TTRGenerator(payload)
        xml = gen.build()
        assert "false" in xml
        valid, errors = XSDValidator.validate(ReportType.TTR, xml)
        assert valid is True, errors


class TestIFTIEGenerator:
    def test_ifti_e_build_valid(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=25000, currency="USD")
        payload = _make_payload(ReportType.IFTI_E, [tx])
        payload.metadata = {
            "ordering_country": "AU",
            "destination_country": "US",
            "ordering_customer": {"full_name": "John Doe", "address": "123 Main St"},
        }
        gen = IFTIEGenerator(payload)
        xml = gen.build()
        assert "InternationalFundsTransferInstruction" in xml
        valid, errors = XSDValidator.validate(ReportType.IFTI_E, xml)
        assert valid is True, errors


class TestPrompts:
    def test_build_system_prompt_contains_json(self) -> None:
        payload = _make_payload(ReportType.SMR)
        from austrac_reporting.llm.prompts import build_system_prompt
        prompt = build_system_prompt(payload)
        assert "STRUCTURED PAYLOAD (JSON)" in prompt
        assert "report_id" in prompt

    def test_prompt_forbids_hallucination(self) -> None:
        payload = _make_payload(ReportType.SMR)
        from austrac_reporting.llm.prompts import build_system_prompt
        prompt = build_system_prompt(payload)
        assert "Do NOT hallucinate" in prompt


class TestLocalLlamaAdapter:
    @pytest.mark.asyncio
    async def test_draft_narrative_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from austrac_reporting.llm.local_llama import LocalLlama3Adapter
        from httpx import Response

        adapter = LocalLlama3Adapter(api_url="http://localhost:11434/api/generate")
        payload = _make_payload(ReportType.SMR)
        from austrac_reporting.llm.prompts import build_system_prompt
        prompt = build_system_prompt(payload)

        async def mock_post(*args: Any, **kwargs: Any) -> Response:
            return Response(200, json={"response": "Narrative text here."}, request=httpx.Request("POST", "http://test"))

        monkeypatch.setattr("httpx.AsyncClient.post", mock_post)
        draft = await adapter.draft_narrative(payload, prompt)
        assert draft.draft_text == "Narrative text here."
        assert draft.requires_human_approval is True
        assert draft.model_used == "llama3"


class TestAzureOpenAIAdapter:
    @pytest.mark.asyncio
    async def test_draft_narrative_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import os

        from austrac_reporting.llm.azure_openai import AzureOpenAIAdapter
        from httpx import Response

        os.environ["AZURE_OPENAI_API_KEY"] = "test-key"
        adapter = AzureOpenAIAdapter(endpoint="https://test.openai.azure.com", deployment="gpt-4")
        payload = _make_payload(ReportType.SMR)
        from austrac_reporting.llm.prompts import build_system_prompt
        prompt = build_system_prompt(payload)

        async def mock_post(*args: Any, **kwargs: Any) -> Response:
            return Response(
                200,
                json={"choices": [{"message": {"content": "Azure narrative."}}]},
                request=httpx.Request("POST", "http://test"),
            )

        monkeypatch.setattr("httpx.AsyncClient.post", mock_post)
        draft = await adapter.draft_narrative(payload, prompt)
        assert draft.draft_text == "Azure narrative."
        assert draft.requires_human_approval is True
        assert "azure-openai" in draft.model_used


class TestLLMFactory:
    def test_factory_defaults_to_local_llama(self) -> None:
        from austrac_reporting.llm import create_llm_adapter
        settings = Settings()
        adapter = create_llm_adapter(settings)
        from austrac_reporting.llm.local_llama import LocalLlama3Adapter
        assert isinstance(adapter, LocalLlama3Adapter)

    def test_factory_azure(self) -> None:
        from austrac_reporting.llm import create_llm_adapter
        settings = Settings(
            llm_provider="azure_openai",
            azure_openai_endpoint="https://test",
            azure_openai_deployment="gpt-4",
        )
        adapter = create_llm_adapter(settings)
        from austrac_reporting.llm.azure_openai import AzureOpenAIAdapter
        assert isinstance(adapter, AzureOpenAIAdapter)


class TestGateway:
    @pytest.mark.asyncio
    async def test_transmit_success(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from austrac_reporting.gateway import AUSTRACGateway

        gateway = AUSTRACGateway()
        xml = _valid_smr_xml()

        async def mock_post(*args: Any, **kwargs: Any) -> httpx.Response:
            return httpx.Response(200, headers={"X-Receipt-Id": "REC-001"}, request=httpx.Request("POST", "http://test"))

        monkeypatch.setattr("httpx.AsyncClient.post", mock_post)
        result = await gateway.transmit("smr", xml, report_id=UUID(int=1))
        assert result.status == "transmitted"
        assert result.receipt_id == "REC-001"
        assert result.http_status == 200
        await gateway.close()

    @pytest.mark.asyncio
    async def test_transmit_validation_fails(self) -> None:
        from austrac_reporting.gateway import AUSTRACGateway, GatewayError

        gateway = AUSTRACGateway()
        with pytest.raises(GatewayError) as exc_info:
            await gateway.transmit("smr", "<invalid>", report_id=UUID(int=2))
        assert "XSD validation failed" in str(exc_info.value)
        await gateway.close()

    @pytest.mark.asyncio
    async def test_transmit_unknown_report_type(self) -> None:
        from austrac_reporting.gateway import AUSTRACGateway, GatewayError

        gateway = AUSTRACGateway()
        with pytest.raises(GatewayError) as exc_info:
            await gateway.transmit("unknown_type", _valid_smr_xml(), report_id=UUID(int=3))
        assert "Unknown report type" in str(exc_info.value)
        await gateway.close()


class TestExponentialBackoff:
    def test_backoff_base(self) -> None:
        from austrac_reporting.dlq import exponential_backoff_delay
        assert exponential_backoff_delay(0) == 5.0

    def test_backoff_doubles(self) -> None:
        from austrac_reporting.dlq import exponential_backoff_delay
        assert exponential_backoff_delay(1) == 10.0
        assert exponential_backoff_delay(2) == 20.0

    def test_backoff_cap(self) -> None:
        from austrac_reporting.dlq import exponential_backoff_delay
        assert exponential_backoff_delay(20) == 3600.0


class TestDeadLetterQueue:
    def test_enqueue_in_memory(self) -> None:
        import asyncio

        from austrac_reporting.dlq import DeadLetterQueue

        dlq = DeadLetterQueue(Settings(sqs_dlq_url=""))
        asyncio.run(dlq.enqueue(UUID(int=1), {"report_type": "smr"}, "Network error"))
        assert len(dlq.list_entries()) == 1
        entry = dlq.list_entries()[0]
        assert entry.retry_count == 0
        assert entry.error_message == "Network error"
        dlq.clear()

    def test_requeue_increments_retry(self) -> None:
        import asyncio
        from datetime import UTC, datetime, timedelta

        from austrac_reporting.dlq import DeadLetterQueue

        dlq = DeadLetterQueue(Settings(sqs_dlq_url=""))
        asyncio.run(dlq.enqueue(UUID(int=2), {"report_type": "smr"}, "Timeout"))
        entry = dlq.list_entries()[0]
        entry.next_retry_at = datetime.now(UTC) - timedelta(seconds=1)
        asyncio.run(dlq.requeue_for_retry(entry))
        all_entries = dlq.list_entries()
        assert len(all_entries) == 2
        retry_entry = next(e for e in all_entries if e.retry_count == 1)
        assert retry_entry.retry_count == 1
        dlq.clear()


def _valid_smr_xml() -> str:
    tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=5000, currency="AUD")
    payload = _make_payload(ReportType.SMR, [tx])
    gen = SMRGenerator(payload)
    return gen.build(narrative="Test narrative")


class TestAppRoutes:
    @pytest.mark.asyncio
    async def test_healthz(self) -> None:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/healthz")
            assert response.status_code == 200
            assert response.json()["status"] == "ok"

    @pytest.mark.asyncio
    async def test_generate_smr(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=5000, currency="AUD")
        payload = _make_payload(ReportType.SMR, [tx])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/reports/generate/smr",
                json={"payload": payload.model_dump(mode="json"), "include_narrative": False},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["report_type"] == "smr"
            assert data["xsd_valid"] is True
            assert "xml_content" in data

    @pytest.mark.asyncio
    async def test_generate_ttr(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=15000, currency="AUD")
        payload = _make_payload(ReportType.TTR, [tx])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/reports/generate/ttr",
                json={"payload": payload.model_dump(mode="json"), "include_narrative": False},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["report_type"] == "ttr"
            assert data["xsd_valid"] is True

    @pytest.mark.asyncio
    async def test_generate_unknown_type(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=15000, currency="AUD")
        payload = _make_payload(ReportType.TTR, [tx])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/reports/generate/unknown",
                json={"payload": payload.model_dump(mode="json"), "include_narrative": False},
            )
            assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_draft_narrative_requires_smr(self) -> None:
        tx = TransactionDetail(transaction_id="T1", date="2024-01-01", amount=5000, currency="AUD")
        payload = _make_payload(ReportType.TTR, [tx])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/reports/narrative/draft",
                json={"payload": payload.model_dump(mode="json"), "include_narrative": False},
            )
            assert response.status_code == 400
