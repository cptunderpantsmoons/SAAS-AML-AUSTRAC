from __future__ import annotations

import hashlib
import hmac
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from document_detection_engine.config import Settings


class StorageClient(ABC):
    @abstractmethod
    def store_sanitized(self, filename: str, content: bytes, content_type: str) -> dict[str, Any]:
        raise NotImplementedError


class LocalStorageClient(StorageClient):
    def __init__(self, settings: Settings) -> None:
        self._root = Path(settings.local_storage_dir)
        self._root.mkdir(parents=True, exist_ok=True)

    def store_sanitized(self, filename: str, content: bytes, content_type: str) -> dict[str, Any]:
        object_key = filename.replace("/", "_")
        target = self._root / object_key
        target.write_bytes(content)
        return {
            "status": "stored",
            "provider": "local",
            "object_key": str(target),
            "access_url": "",
            "expires_in_seconds": 0,
        }


class S3StorageClient(StorageClient):
    _STORE_FAILED_MSG = "S3 put_object failed for %s: %s"
    _PRESIGN_FAILED_MSG = "S3 presign failed for %s: %s"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        try:
            import boto3
        except ModuleNotFoundError as exc:
            raise RuntimeError("boto3 is required for S3 storage mode") from exc

        self._client = boto3.client("s3", region_name=settings.aws_region)

    def store_sanitized(self, filename: str, content: bytes, content_type: str) -> dict[str, Any]:
        import botocore.exceptions

        object_key = f"{self._settings.storage_prefix}/{filename.replace('/', '_')}"
        try:
            self._client.put_object(
                Bucket=self._settings.storage_bucket,
                Key=object_key,
                Body=content,
                ContentType=content_type,
                ServerSideEncryption="aws:kms",
                SSEKMSKeyId=self._settings.kms_key_id,
            )
        except botocore.exceptions.ClientError as exc:
            raise RuntimeError(self._STORE_FAILED_MSG % (object_key, exc)) from exc

        try:
            access_url = self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._settings.storage_bucket, "Key": object_key},
                ExpiresIn=self._settings.presign_ttl_seconds,
            )
        except botocore.exceptions.ClientError as exc:
            # Object is stored but we can't generate a URL — surface a clear error
            # rather than silently returning an empty or broken reference.
            raise RuntimeError(self._PRESIGN_FAILED_MSG % (object_key, exc)) from exc

        return {
            "status": "stored",
            "provider": "s3",
            "object_key": object_key,
            "access_url": access_url,
            "expires_in_seconds": self._settings.presign_ttl_seconds,
        }


class FallbackSignedStorageClient(StorageClient):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._root = Path(settings.local_storage_dir)
        self._root.mkdir(parents=True, exist_ok=True)

    def store_sanitized(self, filename: str, content: bytes, content_type: str) -> dict[str, Any]:
        object_key = f"{self._settings.storage_prefix}/{filename.replace('/', '_')}"
        target = self._root / filename.replace("/", "_")
        target.write_bytes(content)
        digest = hmac.new(
            key=self._settings.kms_key_id.encode("utf-8"),
            msg=hashlib.sha256(content).hexdigest().encode("utf-8"),
            digestmod=hashlib.sha256,
        ).hexdigest()
        query = urlencode({"object_key": object_key, "sig": digest})
        return {
            "status": "stored",
            "provider": "s3-compatible-fallback",
            "object_key": object_key,
            "access_url": f"https://example.invalid/presigned?{query}",
            "expires_in_seconds": self._settings.presign_ttl_seconds,
        }


def create_storage_client(settings: Settings) -> StorageClient:
    if settings.storage_backend == "s3":
        return S3StorageClient(settings)
    if settings.storage_backend == "s3-fallback":
        return FallbackSignedStorageClient(settings)
    return LocalStorageClient(settings)
