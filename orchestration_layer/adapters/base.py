from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from orchestration_layer.adapters.circuit_breaker import CircuitBreaker
from orchestration_layer.models import (
    KYBLookupResult,
    KYCVerificationResult,
    SanctionsScreeningResult,
)


class BaseAdapter(ABC):
    """Common contract for all third-party adapters.

    Every adapter owns a :class:`CircuitBreaker` instance named after the
    provider, so callers get resilience without thinking about it.
    """

    def __init__(self, provider_name: str, circuit_breaker: CircuitBreaker) -> None:
        self.provider_name = provider_name
        self.circuit_breaker = circuit_breaker

    @abstractmethod
    async def health_check(self) -> bool:
        """Return ``True`` if the upstream service is reachable."""


class BaseKYCAdapter(BaseAdapter):
    """Identity verification adapter (e.g. Veriff, iDenfy, AU10TIX)."""

    @abstractmethod
    async def initiate_verification(
        self,
        *,
        full_name: str,
        document_type: str = "passport",
        country_of_issue: str = "AU",
        date_of_birth: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> KYCVerificationResult:
        """Start a KYC verification session and return an initial result."""

    @abstractmethod
    async def poll_verification_status(self, verification_id: str) -> KYCVerificationResult:
        """Poll for the latest status of an in-progress verification."""

    @abstractmethod
    async def handle_webhook(self, payload: dict[str, Any]) -> KYCVerificationResult:
        """Parse a vendor webhook payload into a standardised result."""


class BaseSanctionsAdapter(BaseAdapter):
    """Sanctions / PEP screening adapter (e.g. OpenSanctions, ComplyAdvantage)."""

    @abstractmethod
    async def screen_individual(
        self,
        *,
        full_name: str,
        date_of_birth: str | None = None,
        country_code: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SanctionsScreeningResult:
        """Screen an individual against sanctions and PEP lists."""

    @abstractmethod
    async def screen_organisation(
        self,
        *,
        name: str,
        country_code: str | None = None,
        registration_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SanctionsScreeningResult:
        """Screen an organisation against sanctions lists."""

    @abstractmethod
    async def batch_screen(
        self,
        entities: list[dict[str, Any]],
    ) -> list[SanctionsScreeningResult]:
        """Batch-screen multiple entities in a single call."""


class BaseKYBAdapter(BaseAdapter):
    """Business registry / KYB adapter (e.g. Kyckr, Creditsafe)."""

    @abstractmethod
    async def lookup_entity(
        self,
        *,
        name: str,
        country_code: str = "AU",
        registration_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> KYBLookupResult:
        """Look up a business entity by name or registration ID (ACN/ABN)."""

    @abstractmethod
    async def resolve_entity(
        self,
        *,
        name: str,
        country_code: str = "AU",
        registration_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> KYBLookupResult:
        """Resolve an entity to its canonical registration with enhanced data."""
