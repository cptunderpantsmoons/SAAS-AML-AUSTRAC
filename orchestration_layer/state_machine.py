from __future__ import annotations

import logging
from typing import Any

from transitions import Machine

from orchestration_layer.models import OnboardingState, WorkflowState

logger = logging.getLogger("orchestration_layer.state_machine")

# ── State transition definitions ────────────────────────────────────────────

TRANSITIONS: list[dict[str, Any]] = [
    {
        "trigger": "start_document_analysis",
        "source": OnboardingState.INITIATED.value,
        "dest": OnboardingState.DOCUMENT_ANALYSIS.value,
    },
    {
        "trigger": "complete_document_analysis",
        "source": OnboardingState.DOCUMENT_ANALYSIS.value,
        "dest": OnboardingState.KYC_VERIFICATION.value,
    },
    {
        "trigger": "start_kyc_verification",
        "source": OnboardingState.KYC_VERIFICATION.value,
        "dest": OnboardingState.KYC_VERIFICATION.value,
    },
    {
        "trigger": "complete_kyc_verification",
        "source": OnboardingState.KYC_VERIFICATION.value,
        "dest": OnboardingState.SANCTIONS_SCREENING.value,
    },
    {
        "trigger": "start_sanctions_screening",
        "source": OnboardingState.SANCTIONS_SCREENING.value,
        "dest": OnboardingState.SANCTIONS_SCREENING.value,
    },
    {
        "trigger": "complete_sanctions_screening",
        "source": OnboardingState.SANCTIONS_SCREENING.value,
        "dest": OnboardingState.KYB_LOOKUP.value,
        "conditions": ["_is_organisation"],
    },
    {
        "trigger": "complete_sanctions_screening",
        "source": OnboardingState.SANCTIONS_SCREENING.value,
        "dest": OnboardingState.RISK_AGGREGATION.value,
        "conditions": ["_is_individual"],
    },
    {
        "trigger": "complete_kyb_lookup",
        "source": OnboardingState.KYB_LOOKUP.value,
        "dest": OnboardingState.UBO_CALCULATION.value,
    },
    {
        "trigger": "complete_ubo_calculation",
        "source": OnboardingState.UBO_CALCULATION.value,
        "dest": OnboardingState.RISK_AGGREGATION.value,
    },
    {
        "trigger": "complete_risk_aggregation",
        "source": OnboardingState.RISK_AGGREGATION.value,
        "dest": OnboardingState.COMPLETED.value,
    },
    {
        "trigger": "fail_pipeline",
        "source": [
            OnboardingState.DOCUMENT_ANALYSIS.value,
            OnboardingState.KYC_VERIFICATION.value,
            OnboardingState.SANCTIONS_SCREENING.value,
            OnboardingState.KYB_LOOKUP.value,
            OnboardingState.UBO_CALCULATION.value,
            OnboardingState.RISK_AGGREGATION.value,
        ],
        "dest": OnboardingState.FAILED.value,
    },
]


class WorkflowStateMachine:
    """Wraps a :class:`WorkflowState` with a finite-state-machine powered by
    the ``transitions`` library.

    Usage::

        ws = WorkflowState(onboarding_id="...", ...)
        machine = WorkflowStateMachine(ws)
        machine.start_document_analysis()
        # ws.state is now DOCUMENT_ANALYSIS
    """

    def __init__(self, workflow_state: WorkflowState) -> None:
        self._ws = workflow_state
        self._machine = Machine(
            model=self,
            states=[s.value for s in OnboardingState],
            initial=workflow_state.state.value,
            transitions=TRANSITIONS,
            auto_transitions=False,
            after_state_change="_sync_state",
        )

    # ``transitions`` injects this attribute at runtime.
    state: str

    # ── Conditions ──────────────────────────────────────────────────────

    def _is_individual(self) -> bool:
        return self._ws.entity_type == "individual"

    def _is_organisation(self) -> bool:
        return self._ws.entity_type == "organisation"

    # ── After-transition hook ───────────────────────────────────────────

    def _sync_state(self, **kwargs: Any) -> None:
        """Keep the Pydantic model in sync with the FSM state."""
        self._ws.state = OnboardingState(self.state)
        self._ws.touch()
        logger.info(
            "onboarding_id=%s state=%s",
            self._ws.onboarding_id,
            self._ws.state.value,
        )

    # ── Public helpers ─────────────────────────────────────────────────

    @property
    def workflow_state(self) -> WorkflowState:
        return self._ws

    def fail(self, error_message: str) -> None:
        """Transition to FAILED with an error message."""
        self._ws.error_message = error_message
        try:
            self.fail_pipeline()  # type: ignore[attr-defined]
        except Exception:
            # If we're already in a state that can't transition to FAILED,
            # force-set it so we never lose the error.
            self._ws.state = OnboardingState.FAILED
            self._ws.touch()
