from __future__ import annotations

import pytest
from orchestration_layer.models import OnboardingState, WorkflowState
from orchestration_layer.state_machine import WorkflowStateMachine
from transitions.core import MachineError


class TestWorkflowStateMachine:
    def test_initial_state_is_initiated(self) -> None:
        ws = WorkflowState(
            onboarding_id="test-001",
            entity_name="John Doe",
            entity_type="individual",
            country_code="AU",
        )
        sm = WorkflowStateMachine(ws)
        assert sm.state == OnboardingState.INITIATED.value

    def test_individual_pipeline_transitions(self) -> None:
        ws = WorkflowState(
            onboarding_id="test-002",
            entity_name="Jane Smith",
            entity_type="individual",
            country_code="AU",
        )
        sm = WorkflowStateMachine(ws)

        sm.start_document_analysis()  # type: ignore[attr-defined]
        assert ws.state == OnboardingState.DOCUMENT_ANALYSIS

        sm.complete_document_analysis()  # type: ignore[attr-defined]
        assert ws.state == OnboardingState.KYC_VERIFICATION

        sm.complete_kyc_verification()  # type: ignore[attr-defined]
        assert ws.state == OnboardingState.SANCTIONS_SCREENING

        sm.complete_sanctions_screening()  # type: ignore[attr-defined]
        # Individual should skip KYB and go straight to risk aggregation
        assert ws.state == OnboardingState.RISK_AGGREGATION

        sm.complete_risk_aggregation()  # type: ignore[attr-defined]
        assert ws.state == OnboardingState.COMPLETED

    def test_organisation_pipeline_includes_kyb(self) -> None:
        ws = WorkflowState(
            onboarding_id="test-003",
            entity_name="Acme Corp",
            entity_type="organisation",
            country_code="AU",
        )
        sm = WorkflowStateMachine(ws)

        sm.start_document_analysis()  # type: ignore[attr-defined]
        sm.complete_document_analysis()  # type: ignore[attr-defined]
        sm.complete_kyc_verification()  # type: ignore[attr-defined]
        sm.complete_sanctions_screening()  # type: ignore[attr-defined]
        # Organisation should go to KYB lookup, not risk aggregation
        assert ws.state == OnboardingState.KYB_LOOKUP

        sm.complete_kyb_lookup()  # type: ignore[attr-defined]
        # After KYB, organisation goes to UBO calculation
        assert ws.state == OnboardingState.UBO_CALCULATION

        sm.complete_ubo_calculation()  # type: ignore[attr-defined]
        assert ws.state == OnboardingState.RISK_AGGREGATION

        sm.complete_risk_aggregation()  # type: ignore[attr-defined]
        assert ws.state == OnboardingState.COMPLETED

    def test_fail_transitions_to_failed_state(self) -> None:
        ws = WorkflowState(
            onboarding_id="test-004",
            entity_name="Bad Actor",
            entity_type="individual",
            country_code="AU",
        )
        sm = WorkflowStateMachine(ws)
        sm.start_document_analysis()  # type: ignore[attr-defined]

        sm.fail("document analysis timed out")
        assert ws.state == OnboardingState.FAILED
        assert ws.error_message == "document analysis timed out"

    def test_invalid_transition_raises(self) -> None:
        ws = WorkflowState(
            onboarding_id="test-005",
            entity_name="Test",
            entity_type="individual",
            country_code="AU",
        )
        sm = WorkflowStateMachine(ws)

        # Can't go directly from INITIATED to KYC
        with pytest.raises(MachineError):
            sm.complete_kyc_verification()  # type: ignore[attr-defined]

    def test_touch_updates_timestamp(self) -> None:
        ws = WorkflowState(
            onboarding_id="test-006",
            entity_name="Timestamp Test",
            entity_type="individual",
            country_code="AU",
        )
        original_updated = ws.updated_at
        sm = WorkflowStateMachine(ws)
        sm.start_document_analysis()  # type: ignore[attr-defined]
        assert ws.updated_at != original_updated

    def test_fail_from_any_active_state(self) -> None:
        """Verify fail_pipeline works from all non-terminal states."""
        for state in [
            OnboardingState.DOCUMENT_ANALYSIS,
            OnboardingState.KYC_VERIFICATION,
            OnboardingState.SANCTIONS_SCREENING,
            OnboardingState.KYB_LOOKUP,
            OnboardingState.UBO_CALCULATION,
            OnboardingState.RISK_AGGREGATION,
        ]:
            ws = WorkflowState(
                onboarding_id=f"fail-test-{state.value}",
                entity_name="Test",
                entity_type="individual",
                country_code="AU",
            )
            ws.state = state
            sm = WorkflowStateMachine(ws)
            sm.fail("test failure")
            assert ws.state == OnboardingState.FAILED, f"Failed to transition from {state.value}"
