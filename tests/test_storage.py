from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest
from document_detection_engine.config import Settings
from document_detection_engine.storage import (
    FallbackSignedStorageClient,
    LocalStorageClient,
    S3StorageClient,
    create_storage_client,
)


def test_local_storage_client_writes_sanitized_payload(tmp_path: Path):
    settings = Settings(local_storage_dir=str(tmp_path))
    client = LocalStorageClient(settings)

    result = client.store_sanitized("report.txt", b"clean", "text/plain")

    assert result["status"] == "stored"
    assert Path(result["object_key"]).read_bytes() == b"clean"


def test_fallback_signed_storage_client_returns_signed_style_reference(tmp_path: Path):
    settings = Settings(local_storage_dir=str(tmp_path), storage_prefix="sanitized", kms_key_id="alias/test")
    client = FallbackSignedStorageClient(settings)

    result = client.store_sanitized("report.txt", b"clean", "text/plain")

    assert result["provider"] == "s3-compatible-fallback"
    assert "sig=" in result["access_url"]
    assert result["object_key"] == "sanitized/report.txt"


def test_create_storage_client_selects_local_backend(tmp_path: Path):
    settings = Settings(local_storage_dir=str(tmp_path), storage_backend="local")

    client = create_storage_client(settings)

    assert isinstance(client, LocalStorageClient)


def test_create_storage_client_selects_fallback_backend(tmp_path: Path):
    settings = Settings(local_storage_dir=str(tmp_path), storage_backend="s3-fallback")

    client = create_storage_client(settings)

    assert isinstance(client, FallbackSignedStorageClient)


def test_s3_storage_client_requires_boto3(tmp_path: Path, monkeypatch):
    settings = Settings(local_storage_dir=str(tmp_path), storage_backend="s3")

    # Remove the cached boto3 import so the `import boto3` inside
    # S3StorageClient.__init__ triggers ModuleNotFoundError.
    monkeypatch.delitem(sys.modules, "boto3", raising=False)
    # Block any re-import by making the module unresolvable.
    monkeypatch.setitem(sys.modules, "boto3", None)

    with pytest.raises(RuntimeError, match="boto3 is required"):
        S3StorageClient(settings)


def test_s3_storage_client_puts_object_with_kms_and_presigned_url(tmp_path: Path, monkeypatch):
    captured: dict[str, object] = {}

    class FakeClientError(Exception):
        pass

    class FakeS3Client:
        def put_object(self, **kwargs):
            captured["put_object"] = kwargs

        def generate_presigned_url(self, operation_name, Params, ExpiresIn):
            captured["generate_presigned_url"] = {
                "operation_name": operation_name,
                "Params": Params,
                "ExpiresIn": ExpiresIn,
            }
            return "https://signed.example/object"

    fake_botocore_exceptions = types.SimpleNamespace(ClientError=FakeClientError)
    fake_botocore = types.SimpleNamespace(exceptions=fake_botocore_exceptions)
    fake_boto3 = types.SimpleNamespace(client=lambda service_name, region_name: FakeS3Client())
    monkeypatch.setitem(sys.modules, "botocore", fake_botocore)
    monkeypatch.setitem(sys.modules, "botocore.exceptions", fake_botocore_exceptions)
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)

    settings = Settings(
        local_storage_dir=str(tmp_path),
        storage_backend="s3",
        storage_bucket="bucket-name",
        storage_prefix="sanitized",
        kms_key_id="alias/aml",
        presign_ttl_seconds=600,
        aws_region="ap-southeast-2",
    )

    client = S3StorageClient(settings)
    result = client.store_sanitized("report.txt", b"clean", "text/plain")

    assert captured["put_object"]["Bucket"] == "bucket-name"
    assert captured["put_object"]["ServerSideEncryption"] == "aws:kms"
    assert captured["put_object"]["SSEKMSKeyId"] == "alias/aml"
    assert captured["generate_presigned_url"]["ExpiresIn"] == 600
    assert result["provider"] == "s3"
    assert result["access_url"] == "https://signed.example/object"
