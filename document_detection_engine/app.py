from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from starlette.applications import Starlette
from starlette.datastructures import UploadFile
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from document_detection_engine.config import Settings, get_settings
from document_detection_engine.engine import analyze_document
from document_detection_engine.storage import create_storage_client

_document_registry: list[dict[str, Any]] = []


def _sanitize_filename(filename: str) -> str:
    name = Path(filename or "upload.bin").name
    safe = "".join(ch for ch in name if ch.isalnum() or ch in {".", "_", "-"})
    return safe or "upload.bin"


def _validate_upload(upload: UploadFile, payload: bytes, settings: Settings) -> str | None:
    raw_filename = upload.filename or "upload.bin"
    filename = _sanitize_filename(raw_filename)
    suffix = Path(filename).suffix.lower()
    if (
        not filename
        or filename.startswith(".")
        or raw_filename != Path(raw_filename).name
        or any(sep in raw_filename for sep in {"/", "\\"})
    ):
        return "invalid filename"
    if suffix in settings.blocked_extensions:
        return f"blocked file extension: {suffix}"
    if upload.content_type not in settings.allowed_content_types:
        return f"unsupported content type: {upload.content_type}"
    if len(payload) > settings.max_upload_bytes:
        return "upload exceeds maximum allowed size"
    return None


async def healthz(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "document-detection-engine"})


async def readyz(_: Request) -> JSONResponse:
    return JSONResponse({"status": "ready", "service": "document-detection-engine"})


async def list_documents(request: Request) -> JSONResponse:
    return JSONResponse(
        {
            "documents": _document_registry,
            "pagination": {
                "page": 1,
                "limit": 50,
                "total": len(_document_registry),
                "totalPages": max(1, (len(_document_registry) + 49) // 50),
            },
        }
    )


async def analyze(request: Request) -> JSONResponse:
    settings = request.app.state.settings
    storage_client = request.app.state.storage_client
    form = await request.form()
    upload = form.get("file")
    if not isinstance(upload, UploadFile):
        return JSONResponse({"error": "file upload is required"}, status_code=400)

    payload = await upload.read()
    validation_error = _validate_upload(upload, payload, settings)
    if validation_error:
        return JSONResponse({"error": validation_error}, status_code=400)

    response = analyze_document(
        payload=payload,
        filename=_sanitize_filename(upload.filename or "upload.bin"),
        content_type=upload.content_type or "application/octet-stream",
        settings=settings,
        storage_client=storage_client,
    )
    summary = response.get("summary", {})
    _document_registry.append(
        {
            "document_id": response.get("analysis_id", str(len(_document_registry) + 1)),
            "filename": _sanitize_filename(upload.filename or "upload.bin"),
            "analysis_id": response.get("analysis_id", ""),
            "risk_score": summary.get("risk_score", 0.0),
            "risk_level": summary.get("risk_level", "low"),
            "uploaded_at": datetime.now(UTC).isoformat(),
        }
    )
    return JSONResponse(response)


def create_app(settings: Settings | None = None) -> Starlette:
    resolved_settings = settings or get_settings()
    app = Starlette(
        debug=False,
        routes=[
            Route("/healthz", endpoint=healthz, methods=["GET"]),
            Route("/readyz", endpoint=readyz, methods=["GET"]),
            Route("/api/v1/documents", endpoint=list_documents, methods=["GET"]),
            Route("/api/v1/documents/analyze", endpoint=analyze, methods=["POST"]),
        ],
    )
    app.state.settings = resolved_settings
    app.state.storage_client = create_storage_client(resolved_settings)
    return app


app = create_app()
