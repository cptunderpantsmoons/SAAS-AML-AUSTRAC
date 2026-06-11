from __future__ import annotations

from typing import Any

import httpx


class ComplianceServiceClient:
    """Async HTTP client for the AML compliance gateway."""

    def __init__(self, gateway_url: str, timeout: float = 30.0) -> None:
        if not gateway_url:
            raise ValueError("gateway_url must not be empty")
        self._base_url = gateway_url.rstrip("/")
        self._timeout = timeout

    async def onboard_entity(
        self, entity_name: str, entity_type: str, country_code: str
    ) -> dict[str, Any]:
        """POST /onboarding/initiate"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
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
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{self._base_url}/onboarding/status/{onboarding_id}",
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data

    async def analyze_document(
        self, file_bytes: bytes, filename: str, content_type: str
    ) -> dict[str, Any]:
        """POST /documents/analyze (multipart form-data)."""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            files = {"file": (filename, file_bytes, content_type)}
            resp = await client.post(
                f"{self._base_url}/documents/analyze",
                files=files,
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data

    async def generate_report(self, report_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /reports/generate/{report_type}"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/reports/generate/{report_type}",
                json=payload,
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data

    async def draft_narrative(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /reports/narrative/draft"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
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
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(
                f"{self._base_url}/reports/{report_id}/transmit",
                json={"report_type": report_type, "xml_content": xml_content},
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data

    async def get_board_metrics(self) -> dict[str, Any]:
        """GET /governance/metrics"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(f"{self._base_url}/governance/metrics")
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data

    async def list_alerts(self) -> dict[str, Any]:
        """GET /alerts"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(f"{self._base_url}/alerts")
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data

    async def calculate_ubo(self, entity_id: str) -> dict[str, Any]:
        """GET /ubo/calculate"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.get(
                f"{self._base_url}/ubo/calculate",
                params={"entity_id": entity_id},
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data

    async def sign_report(
        self, report_id: str, payload: dict[str, Any], signed_by: str
    ) -> dict[str, Any]:
        """POST /reports/{report_id}/sign"""
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            body = {**payload, "signed_by": signed_by}
            resp = await client.post(
                f"{self._base_url}/reports/{report_id}/sign",
                json=body,
            )
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            return data
