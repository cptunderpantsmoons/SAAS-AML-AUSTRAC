from __future__ import annotations

import httpx
import pytest
from document_detection_engine.app import create_app
from document_detection_engine.config import Settings


@pytest.mark.anyio
async def test_ready_endpoint_reports_ready():
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/readyz")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"


@pytest.mark.anyio
async def test_analyze_requires_file_upload():
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/api/v1/documents/analyze", data={"not_file": "x"})

    assert response.status_code == 400
    assert response.json()["error"] == "file upload is required"


@pytest.mark.anyio
async def test_analyze_rejects_blocked_file_extension():
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/documents/analyze",
            files={"file": ("payload.exe", b"malware", "application/pdf")},
        )

    assert response.status_code == 400
    assert "blocked file extension" in response.json()["error"]


@pytest.mark.anyio
async def test_analyze_rejects_unsupported_content_type():
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/documents/analyze",
            files={"file": ("payload.pdf", b"safe", "application/octet-stream")},
        )

    assert response.status_code == 400
    assert "unsupported content type" in response.json()["error"]


@pytest.mark.anyio
async def test_analyze_rejects_oversized_upload(tmp_path):
    settings = Settings(local_storage_dir=str(tmp_path), max_upload_bytes=4)
    transport = httpx.ASGITransport(app=create_app(settings))
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/documents/analyze",
            files={"file": ("payload.pdf", b"12345", "application/pdf")},
        )

    assert response.status_code == 400
    assert response.json()["error"] == "upload exceeds maximum allowed size"


@pytest.mark.anyio
async def test_analyze_rejects_path_traversal_style_filename():
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/documents/analyze",
            files={"file": ("../../payload.pdf", b"safe", "application/pdf")},
        )

    assert response.status_code == 400
    assert response.json()["error"] == "invalid filename"
