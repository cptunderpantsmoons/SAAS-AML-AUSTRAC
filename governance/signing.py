from __future__ import annotations

import base64
import hashlib
import hmac
import logging
from typing import Any
from uuid import uuid4

from governance.models import DigitalSignature

logger = logging.getLogger("governance.signing")


class SigningError(Exception):
    """Raised when signing or verification fails."""


class ComplianceSigner:
    """Cryptographic signing for compliance reports.

    Production: AWS KMS asymmetric signing.
    Dev/Test: HMAC-SHA256 with a local secret fallback.
    """

    def __init__(self, kms_key_arn: str = "", fallback_secret: str = "") -> None:
        self._kms_key_arn = kms_key_arn
        self._fallback_secret = fallback_secret
        self._kms_client: Any = None

    def _get_kms_client(self) -> Any | None:
        if self._kms_client is not None:
            return self._kms_client
        try:
            import boto3

            self._kms_client = boto3.client("kms", region_name="ap-southeast-2")
        except Exception:
            logger.warning("boto3/KMS unavailable -- using HMAC fallback")
            self._kms_client = None
        return self._kms_client

    @staticmethod
    def _payload_to_bytes(payload: bytes | str) -> bytes:
        if isinstance(payload, str):
            return payload.encode("utf-8")
        return payload

    async def sign(
        self,
        report_id: str,
        payload: bytes | str,
        signed_by: str = "system",
    ) -> DigitalSignature:
        payload_bytes = self._payload_to_bytes(payload)
        digest = hashlib.sha256(payload_bytes).hexdigest()
        kms = self._get_kms_client()
        sig_b64: str
        if kms is not None and self._kms_key_arn:
            try:
                response = kms.sign(
                    KeyId=self._kms_key_arn,
                    Message=digest,
                    MessageType="DIGEST",
                    SigningAlgorithm="RSASSA_PKCS1_V1_5_SHA_256",
                )
                sig_b64 = base64.b64encode(response["Signature"]).decode("utf-8")
                logger.info("KMS sign success report_id=%s", report_id)
                return DigitalSignature(
                    signature_id=uuid4(),
                    report_id=report_id,
                    signed_by=signed_by,
                    kms_key_arn=self._kms_key_arn,
                    signature_b64=sig_b64,
                )
            except Exception as exc:
                logger.error("KMS sign failed: %s", exc)
                if not self._fallback_secret:
                    raise SigningError(
                        f"KMS sign failed and no fallback secret configured: {exc}"
                    ) from exc
        if not self._fallback_secret:
            raise SigningError("No KMS key or fallback secret configured")
        sig = hmac.new(
            self._fallback_secret.encode(),
            digest.encode(),
            hashlib.sha256,
        ).hexdigest()
        sig_b64 = base64.b64encode(sig.encode()).decode("utf-8")
        return DigitalSignature(
            signature_id=uuid4(),
            report_id=report_id,
            signed_by=signed_by,
            kms_key_arn="",
            signature_b64=sig_b64,
        )

    async def verify(
        self,
        report_id: str,
        payload: bytes | str,
        signature_b64: str,
    ) -> bool:
        payload_bytes = self._payload_to_bytes(payload)
        digest = hashlib.sha256(payload_bytes).hexdigest()
        kms = self._get_kms_client()
        if kms is not None and self._kms_key_arn:
            try:
                kms.verify(
                    KeyId=self._kms_key_arn,
                    Message=digest,
                    MessageType="DIGEST",
                    Signature=base64.b64decode(signature_b64),
                    SigningAlgorithm="RSASSA_PKCS1_V1_5_SHA_256",
                )
                return True
            except Exception:
                return False
        if not self._fallback_secret:
            raise SigningError("No KMS key or fallback secret configured for verify")
        expected = hmac.new(
            self._fallback_secret.encode(),
            digest.encode(),
            hashlib.sha256,
        ).hexdigest()
        expected_b64 = base64.b64encode(expected.encode()).decode("utf-8")
        return hmac.compare_digest(expected_b64, signature_b64)
