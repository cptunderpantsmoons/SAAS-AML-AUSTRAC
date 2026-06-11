from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from .config import Settings


class ComplianceServiceClient:
    """Async HTTP client for the AML compliance gateway."""

    def __init__(
        self,
        gateway_url: str,
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not gateway_url:
            raise ValueError("gateway_url must not be empty")
        self._base_url = gateway_url.rstrip("/")
        self._timeout = timeout
        self._client = client or httpx.AsyncClient(timeout=self._timeout)

    @classmethod
    def from_settings(cls, settings: Settings) -> ComplianceServiceClient:
        return cls(
            gateway_url=settings.gateway_url,
            timeout=settings.agent_timeout_seconds,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def onboard_entity(
        self, entity_name: str, entity_type: str, country_code: str
    ) -> dict[str, Any]:
        """POST /onboarding/initiate"""
        resp = await self._client.post(
            f"{self._base_url}/onboarding/initiate",
            json={
                "entity_name": entity_name,
                "entity_type": entity_type,
                "country_code": country_code,
            },
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def check_onboarding_status(self, onboarding_id: str) -> dict[str, Any]:
        """GET /onboarding/status/{onboarding_id}"""
        path = f"/onboarding/status/{quote(onboarding_id, safe='')}"
        resp = await self._client.get(f"{self._base_url}{path}")
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def analyze_document_by_reference(
        self, document_reference_id: str, filename: str, content_type: str
    ) -> dict[str, Any]:
        """POST /documents/analyze-by-reference (reference-based analysis)."""
        resp = await self._client.post(
            f"{self._base_url}/documents/analyze-by-reference",
            json={
                "document_reference_id": document_reference_id,
                "filename": filename,
                "content_type": content_type,
            },
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def analyze_document(
        self, file_bytes: bytes, filename: str, content_type: str
    ) -> dict[str, Any]:
        """POST /documents/analyze (multipart form-data)."""
        files = {"file": (filename, file_bytes, content_type)}
        resp = await self._client.post(
            f"{self._base_url}/documents/analyze",
            files=files,
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def generate_report(self, report_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /reports/generate/{report_type}"""
        path = f"/reports/generate/{quote(report_type, safe='')}"
        resp = await self._client.post(
            f"{self._base_url}{path}",
            json=payload,
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def draft_narrative(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /reports/narrative/draft"""
        resp = await self._client.post(
            f"{self._base_url}/reports/narrative/draft",
            json=payload,
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def transmit_report(
        self, report_id: str, report_type: str, xml_content: str
    ) -> dict[str, Any]:
        """POST /reports/{report_id}/transmit"""
        path = f"/reports/{quote(report_id, safe='')}/transmit"
        resp = await self._client.post(
            f"{self._base_url}{path}",
            json={"report_type": report_type, "xml_content": xml_content},
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def get_board_metrics(self) -> dict[str, Any]:
        """GET /governance/metrics"""
        resp = await self._client.get(f"{self._base_url}/governance/metrics")
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def list_alerts(self) -> dict[str, Any]:
        """GET /alerts"""
        resp = await self._client.get(f"{self._base_url}/alerts")
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def calculate_ubo(self, entity_id: str) -> dict[str, Any]:
        """GET /ubo/calculate"""
        resp = await self._client.get(
            f"{self._base_url}/ubo/calculate",
            params={"entity_id": entity_id},
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data

    async def sign_report(
        self, report_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """POST /reports/{report_id}/sign"""
        path = f"/reports/{quote(report_id, safe='')}/sign"
        resp = await self._client.post(
            f"{self._base_url}{path}",
            json=payload,
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        return data
