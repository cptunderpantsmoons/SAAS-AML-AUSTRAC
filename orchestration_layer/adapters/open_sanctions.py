from __future__ import annotations

import logging
from typing import Any

import httpx

from orchestration_layer.adapters.base import BaseSanctionsAdapter
from orchestration_layer.adapters.circuit_breaker import CircuitBreaker, exponential_backoff
from orchestration_layer.models import SanctionsMatchStatus, SanctionsScreeningResult

logger = logging.getLogger("orchestration_layer.adapters.open_sanctions")

_OPENSANCTIONS_API_BASE = "https://api.opensanctions.org/v1"


class OpenSanctionsAdapter(BaseSanctionsAdapter):
    """OpenSanctions sanctions / PEP screening adapter.

    API reference: https://docs.opensanctions.org/
    Supports both real-time queries and batch matching.
    """

    def __init__(
        self,
        api_key: str,
        circuit_breaker: CircuitBreaker | None = None,
        base_url: str = _OPENSANCTIONS_API_BASE,
    ) -> None:
        super().__init__(
            provider_name="open_sanctions",
            circuit_breaker=circuit_breaker or CircuitBreaker("open_sanctions"),
        )
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            params={"api_key": self._api_key},
            headers={"Content-Type": "application/json"},
            timeout=30.0,
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.circuit_breaker.call(self._client.get, "/status")
            return resp.status_code == 200
        except Exception:
            return False

    async def screen_individual(
        self,
        *,
        full_name: str,
        date_of_birth: str | None = None,
        country_code: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SanctionsScreeningResult:
        query: dict[str, Any] = {"schema": "Person", "properties": {"name": [full_name]}}
        if date_of_birth:
            query["properties"]["birthDate"] = [date_of_birth]
        if country_code:
            query["properties"]["country"] = [country_code]

        return await self._search(query, metadata)

    async def screen_organisation(
        self,
        *,
        name: str,
        country_code: str | None = None,
        registration_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SanctionsScreeningResult:
        query: dict[str, Any] = {"schema": "Organization", "properties": {"name": [name]}}
        if country_code:
            query["properties"]["country"] = [country_code]
        if registration_id:
            query["properties"]["registrationNumber"] = [registration_id]

        return await self._search(query, metadata)

    async def batch_screen(
        self,
        entities: list[dict[str, Any]],
    ) -> list[SanctionsScreeningResult]:
        results: list[SanctionsScreeningResult] = []
        for entity in entities:
            entity_type = entity.get("entity_type", "individual")
            if entity_type == "individual":
                result = await self.screen_individual(
                    full_name=entity.get("name", ""),
                    date_of_birth=entity.get("date_of_birth"),
                    country_code=entity.get("country_code"),
                    metadata=entity.get("metadata"),
                )
            else:
                result = await self.screen_organisation(
                    name=entity.get("name", ""),
                    country_code=entity.get("country_code"),
                    registration_id=entity.get("registration_id"),
                    metadata=entity.get("metadata"),
                )
            results.append(result)
        return results

    async def _search(
        self,
        query: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> SanctionsScreeningResult:
        payload: dict[str, Any] = {"query": query}
        if metadata:
            payload["context"] = metadata

        async def _call() -> httpx.Response:
            return await self._client.post("/search", json=payload)

        try:
            resp = await exponential_backoff(
                self.circuit_breaker.call,
                _call,
                max_retries=3,
                base_seconds=1.0,
            )
        except Exception as exc:
            logger.error("opensanctions search failed: %s", exc)
            return SanctionsScreeningResult(
                provider="open_sanctions",
                match_status=SanctionsMatchStatus.ERROR,
                details=[str(exc)],
            )

        data = resp.json()
        return self._parse_search_result(data)

    def _parse_search_result(self, data: dict[str, Any]) -> SanctionsScreeningResult:
        results = data.get("results", [])
        matches: list[dict[str, Any]] = []
        best_score = 0.0

        for result in results:
            score = result.get("score", 0.0)
            if score > best_score:
                best_score = score
            matches.append({
                "id": result.get("id", ""),
                "name": result.get("caption", ""),
                "score": score,
                "schema": result.get("schema", ""),
                "datasets": result.get("datasets", []),
            })

        if not matches:
            match_status = SanctionsMatchStatus.NO_MATCH
            confidence = 0.0
        elif best_score >= 0.85:
            match_status = SanctionsMatchStatus.CONFIRMED_MATCH
            confidence = min(1.0, best_score)
        elif best_score >= 0.5:
            match_status = SanctionsMatchStatus.POSSIBLE_MATCH
            confidence = best_score
        else:
            match_status = SanctionsMatchStatus.NO_MATCH
            confidence = best_score

        return SanctionsScreeningResult(
            provider="open_sanctions",
            match_status=match_status,
            matches=matches,
            confidence=round(confidence, 2),
            details=[f"{len(matches)} result(s), best_score={best_score:.2f}"],
            raw_response=data,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
