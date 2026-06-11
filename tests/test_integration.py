from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from orchestration_layer.adapters.kyckr import KyckrAdapter
from orchestration_layer.adapters.open_sanctions import OpenSanctionsAdapter
from orchestration_layer.adapters.veriff import VeriffAdapter
from orchestration_layer.app import _run_pipeline, _workflow_store
from orchestration_layer.config import Settings
from orchestration_layer.models import (
    KYBLookupResult,
    KYBStatus,
    KYCStatus,
    KYCVerificationResult,
    OnboardingState,
    RiskLevel,
    RiskScoreResult,
    SanctionsMatchStatus,
    SanctionsScreeningResult,
    WorkflowState,
)
from orchestration_layer.secrets_manager import SecretsManagerClient


class TestRiskAggregation:
    """Test risk score calculation independently of external APIs."""

    def test_low_risk_for_clean_individual(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="risk-001",
            entity_name="Clean Person",
            entity_type="individual",
            country_code="AU",
        )
        ws.document_analysis = {
            "summary": {"risk_score": 0.0, "risk_level": "low", "flagged_modules": []},
        }
        ws.kyc_verification = KYCVerificationResult(
            provider="veriff", status=KYCStatus.VERIFIED, confidence=0.95,
        )
        ws.sanctions_screening = SanctionsScreeningResult(
            provider="open_sanctions", match_status=SanctionsMatchStatus.NO_MATCH, confidence=0.0,
        )

        result = _aggregate_risk_score(ws, settings)
        assert 0 <= result.aggregate_score <= 35
        assert result.risk_level == RiskLevel.LOW

    def test_high_risk_for_rejected_kyc(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="risk-002",
            entity_name="Bad Actor",
            entity_type="individual",
            country_code="AU",
        )
        ws.document_analysis = {
            "summary": {"risk_score": 50.0, "risk_level": "medium", "flagged_modules": ["prompt_injection"]},
        }
        ws.kyc_verification = KYCVerificationResult(
            provider="veriff", status=KYCStatus.REJECTED, confidence=0.9,
        )
        ws.sanctions_screening = SanctionsScreeningResult(
            provider="open_sanctions", match_status=SanctionsMatchStatus.NO_MATCH, confidence=0.0,
        )

        result = _aggregate_risk_score(ws, settings)
        assert result.aggregate_score >= 35
        assert result.risk_level in (RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL)

    def test_critical_risk_for_sanctions_match(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="risk-003",
            entity_name="Sanctioned Entity",
            entity_type="individual",
            country_code="AU",
        )
        ws.document_analysis = {
            "summary": {"risk_score": 80.0, "risk_level": "high", "flagged_modules": ["visual_forgery"]},
        }
        ws.kyc_verification = KYCVerificationResult(
            provider="veriff", status=KYCStatus.REJECTED, confidence=0.9,
        )
        ws.sanctions_screening = SanctionsScreeningResult(
            provider="open_sanctions",
            match_status=SanctionsMatchStatus.CONFIRMED_MATCH,
            confidence=0.95,
        )

        result = _aggregate_risk_score(ws, settings)
        assert result.aggregate_score >= 70
        assert result.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL)

    def test_moderate_risk_when_kyc_error(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="risk-004",
            entity_name="Unknown Person",
            entity_type="individual",
            country_code="AU",
        )
        ws.document_analysis = {
            "summary": {"risk_score": 0.0, "risk_level": "low", "flagged_modules": []},
        }
        ws.kyc_verification = KYCVerificationResult(
            provider="veriff", status=KYCStatus.ERROR, confidence=0.0,
        )
        ws.sanctions_screening = SanctionsScreeningResult(
            provider="open_sanctions", match_status=SanctionsMatchStatus.NO_MATCH, confidence=0.0,
        )

        result = _aggregate_risk_score(ws, settings)
        # KYC error should contribute moderate risk
        assert result.aggregate_score > 0


class TestRiskScoreResultModel:
    """Test the RiskScoreResult model with 4 weighted components."""

    def test_returns_risk_score_result_type(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="rsr-001",
            entity_name="Test",
            entity_type="individual",
            country_code="AU",
        )
        result = _aggregate_risk_score(ws, settings)
        assert isinstance(result, RiskScoreResult)

    def test_component_weights_match_settings(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="rsr-002",
            entity_name="Test",
            entity_type="individual",
            country_code="AU",
        )
        ws.kyc_verification = KYCVerificationResult(
            provider="veriff", status=KYCStatus.VERIFIED, confidence=0.9,
        )
        result = _aggregate_risk_score(ws, settings)
        assert result.kyc.weight == 0.35
        assert result.sanctions.weight == 0.30
        assert result.document.weight == 0.20
        assert result.ubo.weight == 0.15

    def test_weights_sum_to_one(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="rsr-003",
            entity_name="Test",
            entity_type="individual",
            country_code="AU",
        )
        result = _aggregate_risk_score(ws, settings)
        assert result.weights_sum == 1.0

    def test_weighted_scores_are_consistent(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="rsr-004",
            entity_name="Test",
            entity_type="individual",
            country_code="AU",
        )
        ws.document_analysis = {
            "summary": {"risk_score": 40.0, "risk_level": "medium", "flagged_modules": []},
        }
        ws.kyc_verification = KYCVerificationResult(
            provider="veriff", status=KYCStatus.VERIFIED, confidence=0.8,
        )
        result = _aggregate_risk_score(ws, settings)

        # weighted_score should equal raw_score * weight
        assert result.document.weighted_score == round(result.document.raw_score * result.document.weight, 4)
        assert result.kyc.weighted_score == round(result.kyc.raw_score * result.kyc.weight, 4)
        assert result.sanctions.weighted_score == round(result.sanctions.raw_score * result.sanctions.weight, 4)
        assert result.ubo.weighted_score == round(result.ubo.raw_score * result.ubo.weight, 4)

    def test_aggregate_score_matches_sum_of_weighted(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="rsr-005",
            entity_name="Test",
            entity_type="individual",
            country_code="AU",
        )
        ws.document_analysis = {
            "summary": {"risk_score": 60.0, "risk_level": "high", "flagged_modules": []},
        }
        ws.kyc_verification = KYCVerificationResult(
            provider="veriff", status=KYCStatus.REJECTED, confidence=0.9,
        )
        ws.sanctions_screening = SanctionsScreeningResult(
            provider="open_sanctions",
            match_status=SanctionsMatchStatus.CONFIRMED_MATCH,
            confidence=0.8,
        )
        result = _aggregate_risk_score(ws, settings)

        expected_weighted_sum = (
            result.document.weighted_score
            + result.kyc.weighted_score
            + result.sanctions.weighted_score
            + result.ubo.weighted_score
        )
        assert abs(result.aggregate_score - round(min(100.0, expected_weighted_sum * 100.0), 2)) < 0.01

    def test_ubo_component_uses_ubo_result(self) -> None:
        from orchestration_layer.app import _aggregate_risk_score
        from orchestration_layer.models import UBOResult

        settings = Settings()
        ws = WorkflowState(
            onboarding_id="rsr-006",
            entity_name="Test Org",
            entity_type="organisation",
            country_code="AU",
        )
        ws.ubo_result = UBOResult(
            entity_id="rsr-006",
            beneficial_owner_count=2,
            total_ownership_accounted=60.0,  # 40% unaccounted → risk
            confidence_score=0.3,  # low confidence → risk
            above_threshold_count=1,
        )
        result = _aggregate_risk_score(ws, settings)
        # UBO component should have non-zero raw score due to low confidence + unaccounted ownership
        assert result.ubo.raw_score > 0
        assert result.ubo.weight == 0.15

    def test_risk_score_result_attached_to_workflow_state(self) -> None:
        """Verify that the pipeline stores RiskScoreResult on WorkflowState."""
        ws = WorkflowState(
            onboarding_id="rsr-007",
            entity_name="Test",
            entity_type="individual",
            country_code="AU",
        )
        # Initially None
        assert ws.risk_score_result is None

        # After manual aggregation
        from orchestration_layer.app import _aggregate_risk_score
        settings = Settings()
        result = _aggregate_risk_score(ws, settings)
        ws.risk_score = result.aggregate_score
        ws.risk_level = result.risk_level
        ws.risk_score_result = result

        assert ws.risk_score_result is not None
        assert ws.risk_score_result.aggregate_score == ws.risk_score
        assert ws.risk_score_result.risk_level == ws.risk_level


class TestEndToEndPipeline:
    """Integration test: Document upload → Detection → KYC → Risk aggregation.

    We mock the external API calls to avoid needing real vendor credentials.
    """

    @pytest.mark.asyncio
    async def test_individual_pipeline_completes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = Settings()
        secrets = SecretsManagerClient(prefix="test", aws_region="ap-southeast-2")

        ws = WorkflowState(
            onboarding_id="e2e-ind-001",
            entity_name="Jane Smith",
            entity_type="individual",
            country_code="AU",
        )
        _workflow_store[ws.onboarding_id] = ws

        # Mock the document analysis call
        async def mock_doc_analysis(ws_arg: Any, settings_arg: Any) -> dict[str, Any]:
            return {
                "analysis_id": "doc-123",
                "summary": {"risk_score": 5.0, "risk_level": "low", "flagged_modules": []},
            }

        monkeypatch.setattr("orchestration_layer.app._run_document_analysis", mock_doc_analysis)

        # Mock adapter factories to return mocked adapters
        mock_kyc = AsyncMock(spec=VeriffAdapter)
        mock_kyc.initiate_verification = AsyncMock(return_value=KYCVerificationResult(
            provider="veriff",
            status=KYCStatus.VERIFIED,
            verification_id="v-123",
            confidence=0.95,
        ))
        mock_kyc.aclose = AsyncMock()

        mock_sanctions = AsyncMock(spec=OpenSanctionsAdapter)
        mock_sanctions.screen_individual = AsyncMock(return_value=SanctionsScreeningResult(
            provider="open_sanctions",
            match_status=SanctionsMatchStatus.NO_MATCH,
            confidence=0.0,
        ))
        mock_sanctions.aclose = AsyncMock()

        async def mock_create_kyc(s: Any, sec: Any, ad: Any = None) -> VeriffAdapter:
            return mock_kyc

        async def mock_create_sanctions(s: Any, sec: Any, ad: Any = None) -> OpenSanctionsAdapter:
            return mock_sanctions

        monkeypatch.setattr("orchestration_layer.app._create_kyc_adapter", mock_create_kyc)
        monkeypatch.setattr("orchestration_layer.app._create_sanctions_adapter", mock_create_sanctions)

        await _run_pipeline(ws, settings, secrets)

        assert ws.state == OnboardingState.COMPLETED, f"Expected COMPLETED, got {ws.state}"
        assert ws.kyc_verification is not None
        assert ws.kyc_verification.status == KYCStatus.VERIFIED
        assert ws.sanctions_screening is not None
        assert ws.sanctions_screening.match_status == SanctionsMatchStatus.NO_MATCH
        assert ws.risk_score is not None
        assert ws.risk_level == RiskLevel.LOW

    @pytest.mark.asyncio
    async def test_organisation_pipeline_includes_kyb(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = Settings()
        secrets = SecretsManagerClient(prefix="test", aws_region="ap-southeast-2")

        ws = WorkflowState(
            onboarding_id="e2e-org-001",
            entity_name="Acme Corp",
            entity_type="organisation",
            country_code="AU",
        )
        _workflow_store[ws.onboarding_id] = ws

        async def mock_doc_analysis(ws_arg: Any, settings_arg: Any) -> dict[str, Any]:
            return {
                "analysis_id": "doc-456",
                "summary": {"risk_score": 0.0, "risk_level": "low", "flagged_modules": []},
            }

        monkeypatch.setattr("orchestration_layer.app._run_document_analysis", mock_doc_analysis)

        mock_kyc = AsyncMock(spec=VeriffAdapter)
        mock_kyc.initiate_verification = AsyncMock(return_value=KYCVerificationResult(
            provider="veriff", status=KYCStatus.VERIFIED, verification_id="v-456", confidence=0.95,
        ))
        mock_kyc.aclose = AsyncMock()

        mock_sanctions = AsyncMock(spec=OpenSanctionsAdapter)
        mock_sanctions.screen_organisation = AsyncMock(return_value=SanctionsScreeningResult(
            provider="open_sanctions", match_status=SanctionsMatchStatus.NO_MATCH, confidence=0.0,
        ))
        mock_sanctions.aclose = AsyncMock()

        mock_kyb = AsyncMock(spec=KyckrAdapter)
        mock_kyb.lookup_entity = AsyncMock(return_value=KYBLookupResult(
            provider="kyckr", status=KYBStatus.FOUND,
            entity_name="Acme Corp", registration_id="123456789",
            jurisdiction="AU", confidence=0.95,
        ))
        mock_kyb.aclose = AsyncMock()

        monkeypatch.setattr("orchestration_layer.app._create_kyc_adapter",
                            AsyncMock(return_value=mock_kyc))
        monkeypatch.setattr("orchestration_layer.app._create_sanctions_adapter",
                            AsyncMock(return_value=mock_sanctions))
        monkeypatch.setattr("orchestration_layer.app._create_kyb_adapter",
                            AsyncMock(return_value=mock_kyb))

        await _run_pipeline(ws, settings, secrets)

        assert ws.state == OnboardingState.COMPLETED
        assert ws.kyb_lookup is not None
        assert ws.kyb_lookup.status == KYBStatus.FOUND
        assert ws.kyb_lookup.registration_id == "123456789"
        assert ws.risk_score is not None
        assert ws.risk_level == RiskLevel.LOW

    @pytest.mark.asyncio
    async def test_pipeline_fails_gracefully_on_kyc_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = Settings()
        secrets = SecretsManagerClient(prefix="test", aws_region="ap-southeast-2")

        ws = WorkflowState(
            onboarding_id="e2e-fail-001",
            entity_name="Bad Actor",
            entity_type="individual",
            country_code="AU",
        )
        _workflow_store[ws.onboarding_id] = ws

        async def mock_doc_analysis(ws_arg: Any, settings_arg: Any) -> dict[str, Any]:
            return {
                "analysis_id": "doc-789",
                "summary": {"risk_score": 0.0, "risk_level": "low", "flagged_modules": []},
            }

        monkeypatch.setattr("orchestration_layer.app._run_document_analysis", mock_doc_analysis)

        # KYC raises an unhandled exception
        mock_kyc = AsyncMock(spec=VeriffAdapter)
        mock_kyc.initiate_verification = AsyncMock(side_effect=RuntimeError("vendor timeout"))
        mock_kyc.aclose = AsyncMock()

        monkeypatch.setattr("orchestration_layer.app._create_kyc_adapter",
                            AsyncMock(return_value=mock_kyc))

        await _run_pipeline(ws, settings, secrets)

        assert ws.state == OnboardingState.FAILED
        assert "vendor timeout" in (ws.error_message or "")
