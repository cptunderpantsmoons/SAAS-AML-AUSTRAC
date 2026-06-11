from __future__ import annotations

import logging
from typing import Any

import httpx

from orchestration_layer.adapters.base import BaseKYBAdapter
from orchestration_layer.adapters.circuit_breaker import CircuitBreaker, exponential_backoff
from orchestration_layer.models import KYBLookupResult, KYBStatus

logger = logging.getLogger("orchestration_layer.adapters.kyckr")

_KYCKR_API_BASE = "https://api.kyckr.com/v1"


class KyckrAdapter(BaseKYBAdapter):
    """Kyckr business registry / KYB adapter.

    API reference: https://docs.kyckr.com/
    Supports entity search by name, ACN/ABN, and enhanced entity resolution.
    """

    def __init__(
        self,
        api_key: str,
        circuit_breaker: CircuitBreaker | None = None,
        base_url: str = _KYCKR_API_BASE,
    ) -> None:
        super().__init__(
            provider_name="kyckr",
            circuit_breaker=circuit_breaker or CircuitBreaker("kyckr"),
        )
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.circuit_breaker.call(self._client.get, "/health")
            return resp.status_code == 200
        except Exception:
            return False

    async def lookup_entity(
        self,
        *,
        name: str,
        country_code: str = "AU",
        registration_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> KYBLookupResult:
        params: dict[str, Any] = {"countryCode": country_code, "name": name}
        if registration_id:
            params["registrationId"] = registration_id

        async def _call() -> httpx.Response:
            return await self._client.get("/entities", params=params)

        try:
            resp = await exponential_backoff(
                self.circuit_breaker.call,
                _call,
                max_retries=3,
                base_seconds=1.0,
            )
        except Exception as exc:
            logger.error("kyckr lookup failed: %s", exc)
            return KYBLookupResult(
                provider="kyckr",
                status=KYBStatus.ERROR,
                details=[str(exc)],
            )

        data = resp.json()
        return self._parse_lookup_result(data)

    async def resolve_entity(
        self,
        *,
        name: str,
        country_code: str = "AU",
        registration_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> KYBLookupResult:
        """Enhanced entity resolution with additional corporate data."""
        lookup = await self.lookup_entity(
            name=name,
            country_code=country_code,
            registration_id=registration_id,
            metadata=metadata,
        )

        if lookup.status != KYBStatus.FOUND or not lookup.registration_id:
            return lookup

        # Fetch enhanced details for the found entity
        entity_id = lookup.registration_id

        async def _call() -> httpx.Response:
            return await self._client.get(f"/entities/{country_code}/{entity_id}")

        try:
            resp = await exponential_backoff(
                self.circuit_breaker.call,
                _call,
                max_retries=3,
                base_seconds=1.0,
            )
        except Exception as exc:
            logger.warning("kyckr resolve detail fetch failed: %s", exc)
            return lookup  # Return basic lookup rather than fail entirely

        detail_data = resp.json()
        return self._parse_resolve_result(lookup, detail_data)

    def _parse_lookup_result(self, data: dict[str, Any]) -> KYBLookupResult:
        entities = data.get("entities", data.get("results", []))
        if not entities:
            return KYBLookupResult(
                provider="kyckr",
                status=KYBStatus.NOT_FOUND,
                entity_name="",
                details=["no entities found"],
                raw_response=data,
            )

        first = entities[0]
        return KYBLookupResult(
            provider="kyckr",
            status=KYBStatus.FOUND,
            entity_name=first.get("name", ""),
            registration_id=first.get("registrationId", first.get("acn", first.get("abn", ""))),
            jurisdiction=first.get("jurisdiction", first.get("countryCode", "")),
            confidence=min(1.0, first.get("matchScore", 0.8)),
            details=[f"found {len(entities)} result(s)"],
            raw_response=data,
        )

    def _parse_resolve_result(self, base: KYBLookupResult, detail: dict[str, Any]) -> KYBLookupResult:
        """Merge resolved detail data into the base lookup result."""
        resolved = detail.get("entity", detail)
        return KYBLookupResult(
            provider="kyckr",
            status=KYBStatus.FOUND,
            entity_name=resolved.get("name", base.entity_name),
            registration_id=resolved.get("registrationId", base.registration_id),
            jurisdiction=resolved.get("jurisdiction", base.jurisdiction),
            confidence=min(1.0, resolved.get("confidence", base.confidence)),
            details=[*base.details, "entity resolved with enhanced data"],
            raw_response={"lookup": base.raw_response, "resolve": detail},
        )

    async def aclose(self) -> None:
        await self._client.aclose()
