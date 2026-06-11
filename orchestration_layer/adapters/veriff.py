from __future__ import annotations

import logging
from typing import Any

import httpx

from orchestration_layer.adapters.base import BaseKYCAdapter
from orchestration_layer.adapters.circuit_breaker import CircuitBreaker, exponential_backoff
from orchestration_layer.models import KYCStatus, KYCVerificationResult

logger = logging.getLogger("orchestration_layer.adapters.veriff")

_VERIFF_API_BASE = "https://api.veriff.com/v1"


class VeriffAdapter(BaseKYCAdapter):
    """Veriff identity verification adapter.

    API reference: https://developers.veriff.com/
    Session-based flow: create session → redirect user → poll/webhook for result.
    """

    def __init__(
        self,
        api_key: str,
        circuit_breaker: CircuitBreaker | None = None,
        base_url: str = _VERIFF_API_BASE,
    ) -> None:
        super().__init__(provider_name="veriff", circuit_breaker=circuit_breaker or CircuitBreaker("veriff"))
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers={
                "X-AUTH-CLIENT": self._api_key,
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def health_check(self) -> bool:
        try:
            resp = await self.circuit_breaker.call(self._client.get, "/sessions")
            return resp.status_code < 500
        except Exception:
            return False

    async def initiate_verification(
        self,
        *,
        full_name: str,
        document_type: str = "passport",
        country_of_issue: str = "AU",
        date_of_birth: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> KYCVerificationResult:
        payload: dict[str, Any] = {
            "verification": {
                "person": {
                    "firstName": full_name.split(" ", 1)[0] if " " in full_name else full_name,
                    "lastName": full_name.split(" ", 1)[1] if " " in full_name else "",
                },
                "document": {
                    "type": document_type.upper(),
                    "country": country_of_issue,
                },
                "vendorData": metadata or {},
            }
        }
        if date_of_birth:
            payload["verification"]["person"]["dateOfBirth"] = date_of_birth

        async def _call() -> httpx.Response:
            return await self._client.post("/sessions", json=payload)

        try:
            resp = await exponential_backoff(
                self.circuit_breaker.call,
                _call,
                max_retries=3,
                base_seconds=1.0,
            )
        except Exception as exc:
            logger.error("veriff initiate_verification failed: %s", exc)
            return KYCVerificationResult(
                provider="veriff",
                status=KYCStatus.ERROR,
                details=[str(exc)],
            )

        data = resp.json()
        verification = data.get("verification", {})
        session_id = verification.get("id", "")

        return KYCVerificationResult(
            provider="veriff",
            status=KYCStatus.IN_PROGRESS,
            verification_id=session_id,
            details=[f"session created: {session_id}"],
            raw_response=data,
        )

    async def poll_verification_status(self, verification_id: str) -> KYCVerificationResult:
        async def _call() -> httpx.Response:
            return await self._client.get(f"/sessions/{verification_id}")

        try:
            resp = await exponential_backoff(
                self.circuit_breaker.call,
                _call,
                max_retries=3,
                base_seconds=1.0,
            )
        except Exception as exc:
            logger.error("veriff poll failed for %s: %s", verification_id, exc)
            return KYCVerificationResult(
                provider="veriff",
                status=KYCStatus.ERROR,
                verification_id=verification_id,
                details=[str(exc)],
            )

        data = resp.json()
        return self._parse_session_result(data)

    async def handle_webhook(self, payload: dict[str, Any]) -> KYCVerificationResult:
        """Parse Veriff's decision webhook payload."""
        try:
            status_str = payload.get("status", "")
            verification_id = payload.get("id", "")
            if status_str == "approved":
                status = KYCStatus.VERIFIED
                confidence = 0.95
            elif status_str == "declined":
                status = KYCStatus.REJECTED
                confidence = 0.9
            elif status_str == "resubmission_requested":
                status = KYCStatus.REJECTED
                confidence = 0.6
            else:
                status = KYCStatus.IN_PROGRESS
                confidence = 0.0

            return KYCVerificationResult(
                provider="veriff",
                status=status,
                verification_id=verification_id,
                confidence=confidence,
                details=payload.get("reason", []),
                raw_response=payload,
            )
        except Exception as exc:
            logger.error("veriff webhook parse error: %s", exc)
            return KYCVerificationResult(
                provider="veriff",
                status=KYCStatus.ERROR,
                details=[f"webhook parse error: {exc}"],
                raw_response=payload,
            )

    def _parse_session_result(self, data: dict[str, Any]) -> KYCVerificationResult:
        verification = data.get("verification", {})
        session_id = verification.get("id", "")
        code = verification.get("code", 0)
        status_str = verification.get("status", "")

        if code == 9001 or status_str == "approved":
            status = KYCStatus.VERIFIED
            confidence = 0.95
        elif code == 9102 or status_str == "declined":
            status = KYCStatus.REJECTED
            confidence = 0.9
        elif status_str == "in_progress":
            status = KYCStatus.IN_PROGRESS
            confidence = 0.0
        else:
            status = KYCStatus.PENDING
            confidence = 0.0

        return KYCVerificationResult(
            provider="veriff",
            status=status,
            verification_id=session_id,
            confidence=confidence,
            details=[f"code={code} status={status_str}"],
            raw_response=data,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
