from __future__ import annotations

import logging
import ssl
import tempfile
from typing import Any
from uuid import UUID, uuid4

import httpx

from austrac_reporting.config import Settings, get_settings
from austrac_reporting.models import GatewayResult
from austrac_reporting.xml_schemas import XSDValidator

logger = logging.getLogger("austrac_reporting.gateway")


class GatewayError(Exception):
    """Raised when AUSTRAC gateway transmission fails."""


class AUSTRACGateway:
    """mTLS-secured AUSTRAC API Gateway with idempotency and pre-flight validation."""

    def __init__(
        self,
        settings: Settings | None = None,
        dedup_cache: Any = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._dedup_cache = dedup_cache
        self._client: httpx.AsyncClient | None = None

    async def _load_mtls_certs(self) -> tuple[str, str] | None:
        """Load client certificate and key from Secrets Manager."""
        try:
            from orchestration_layer.secrets_manager import SecretsManagerClient
            sm = SecretsManagerClient(
                prefix=self._settings.secrets_manager_prefix,
                aws_region=self._settings.aws_region,
            )
            secret = await sm.get_secret(self._settings.austrac_cert_secret_name)
            cert_pem = secret.get("cert_pem", "")
            key_pem = secret.get("key_pem", "")
            if not cert_pem or not key_pem:
                logger.warning("mTLS cert or key missing from secret; falling back to no mTLS")
                return None
            with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as cert_file:
                cert_file.write(cert_pem)
                cert_path = cert_file.name
            with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as key_file:
                key_file.write(key_pem)
                key_path = key_file.name
            return cert_path, key_path
        except Exception as exc:
            logger.warning("Failed to load mTLS certs: %s — falling back to no mTLS", exc)
            return None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        certs = await self._load_mtls_certs()
        if certs:
            cert_path, key_path = certs
            ssl_context = ssl.create_default_context()
            ssl_context.load_cert_chain(certfile=cert_path, keyfile=key_path)
            self._client = httpx.AsyncClient(
                verify=ssl_context,
                timeout=self._settings.gateway_timeout_seconds,
            )
        else:
            self._client = httpx.AsyncClient(timeout=self._settings.gateway_timeout_seconds)
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _check_dedup(self, message_id: UUID) -> bool:
        """Return True if message_id already seen (duplicate)."""
        if self._dedup_cache is None:
            return False
        try:
            result = self._dedup_cache.get(str(message_id))
            return result is not None
        except Exception:
            return False

    def _record_dedup(self, message_id: UUID) -> None:
        if self._dedup_cache is not None:
            import contextlib

            with contextlib.suppress(Exception):
                self._dedup_cache.set(
                    str(message_id),
                    {"sent": True},
                    ttl_seconds=self._settings.dedup_cache_ttl_seconds,
                )

    async def transmit(
        self,
        report_type: str,
        xml_content: str,
        report_id: UUID,
    ) -> GatewayResult:
        """Transmit XML report to AUSTRAC with idempotency and pre-flight validation."""
        message_id = uuid4()

        if self._check_dedup(message_id):
            logger.info("Deduplication hit for message_id=%s", message_id)
            return GatewayResult(
                message_id=message_id,
                status="duplicate",
                http_status=None,
                receipt_id=None,
                error_message=None,
            )

        from austrac_reporting.models import ReportType
        try:
            rt = ReportType(report_type)
        except ValueError as exc:
            raise GatewayError(f"Unknown report type: {report_type}") from exc

        valid, errors = XSDValidator.validate(rt, xml_content)
        if not valid:
            raise GatewayError(f"XSD validation failed: {errors}")

        client = await self._get_client()
        url = f"{self._settings.austrac_api_url}/reports/{report_type}"
        headers = {
            "Content-Type": "application/xml",
            "X-Message-Id": str(message_id),
            "X-Report-Id": str(report_id),
        }

        try:
            response = await client.post(url, content=xml_content.encode("utf-8"), headers=headers)
            response.raise_for_status()
            self._record_dedup(message_id)
            receipt = response.headers.get("X-Receipt-Id", "")
            return GatewayResult(
                message_id=message_id,
                status="transmitted",
                http_status=response.status_code,
                receipt_id=receipt,
                error_message=None,
            )
        except httpx.HTTPStatusError as exc:
            logger.error("AUSTRAC transmission failed: %s", exc)
            raise GatewayError(f"HTTP {exc.response.status_code}: {exc.response.text}") from exc
        except httpx.HTTPError as exc:
            logger.error("AUSTRAC transmission network error: %s", exc)
            raise GatewayError(f"Network error: {exc}") from exc
