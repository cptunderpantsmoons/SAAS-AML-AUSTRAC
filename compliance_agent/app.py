from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from auth import init_supertokens, setup_supertokens_middleware
from auth.config import get_auth_settings
from auth.dependencies import get_session, require_role
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request

from compliance_agent.agent import run_agent_chat
from compliance_agent.config import Settings, get_settings
from compliance_agent.ingestion import IngestionPipeline, process_email
from compliance_agent.mail_client import AgentMailClient
from compliance_agent.models import AgentTask, ChatRequest, ChatResponse, EmailIngestionResult
from compliance_agent.service_client import ComplianceServiceClient

logger = logging.getLogger("compliance_agent.app")

# ── Module-level globals (initialised in lifespan) ───────────────────────────

_compliance_client: ComplianceServiceClient | None = None
_mail_client: AgentMailClient | None = None
_ingestion_pipeline: IngestionPipeline | None = None
_task_store: dict[str, AgentTask] = {}

router = APIRouter()


# ── Lifespan ────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> Any:
    global _compliance_client, _mail_client, _ingestion_pipeline

    settings = get_settings()
    app.state.settings = settings

    _compliance_client = ComplianceServiceClient.from_settings(settings)
    _mail_client = AgentMailClient.from_settings(settings)

    try:
        await _mail_client.create_inbox()
    except Exception:
        logger.exception("Failed to create AgentMail inbox; continuing without websocket subscription")
        yield
        await _mail_client.aclose()
        await _compliance_client.aclose()
        logger.info("Compliance agent shut down")
        return

    _ingestion_pipeline = IngestionPipeline(
        mail_client=_mail_client,
        service_client=_compliance_client,
    )
    # Share the app-level task store with the ingestion pipeline.
    _ingestion_pipeline._task_store = _task_store

    async def _email_handler(event: Any) -> None:
        if _ingestion_pipeline is None:
            return
        try:
            result = await process_email(event, _ingestion_pipeline)
            logger.info(
                "Processed email %s: attachments=%s analysis_id=%s",
                result.message_id,
                result.attachments_count,
                result.document_analysis_id,
            )
        except Exception:
            logger.exception("Unhandled exception processing inbound email")

    try:
        ws_task = await _mail_client.subscribe_inbound(_email_handler)
        app.state.ws_task = ws_task
    except Exception:
        logger.exception("Failed to start AgentMail websocket subscription")

    logger.info("Compliance agent started")
    yield

    task_to_cancel: asyncio.Task[None] | None = getattr(app.state, "ws_task", None)
    if task_to_cancel is not None and not task_to_cancel.done():
        task_to_cancel.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task_to_cancel

    await _mail_client.aclose()
    await _compliance_client.aclose()
    logger.info("Compliance agent shut down")


# ── App factory ─────────────────────────────────────────────────────────────


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(
        title="Compliance Agent",
        version="0.1.0",
        lifespan=lifespan,
    )
    if settings is not None:
        app.state.settings = settings

    auth_settings = get_auth_settings()
    try:
        init_supertokens(auth_settings)
    except Exception:
        logger.warning("SuperTokens init failed — auth endpoints may be unavailable")

    setup_supertokens_middleware(app, enable=auth_settings.enable_middleware)

    app.include_router(router)
    return app


# ── Routes ──────────────────────────────────────────────────────────────────


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "service": "compliance-agent"}


@router.post("/agent/chat", response_model=ChatResponse, dependencies=[Depends(require_role("compliance_officer"))])
async def chat(request: ChatRequest) -> ChatResponse:
    if _compliance_client is None:
        raise HTTPException(status_code=503, detail="Service not initialised")

    response = await run_agent_chat(request.message, _compliance_client)

    for task_id in response.task_ids:
        if task_id not in _task_store:
            _task_store[task_id] = AgentTask(task_id=task_id, status="pending")

    return response


@router.get("/agent/tasks", response_model=list[AgentTask], dependencies=[Depends(get_session)])
async def list_tasks() -> list[AgentTask]:
    return list(_task_store.values())


@router.get("/agent/tasks/{task_id}", response_model=AgentTask, dependencies=[Depends(get_session)])
async def get_task(task_id: str) -> AgentTask:
    task = _task_store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task


@router.post(
    "/agent/ingestion/webhook",
    response_model=EmailIngestionResult,
    dependencies=[Depends(require_role("compliance_officer"))],
)
async def ingestion_webhook(payload: dict[str, Any], request: Request) -> EmailIngestionResult:
    if _ingestion_pipeline is None:
        raise HTTPException(status_code=503, detail="Ingestion pipeline not initialised")

    # Verify the HMAC signature on the raw request body.  The AgentMail
    # platform (or any caller) must include ``X-Webhook-Signature: sha256=<hex>``
    # and ``X-Webhook-Timestamp`` (unix seconds) headers; we recompute the
    # HMAC over ``<timestamp>.<body>`` using the shared secret
    # ``COMPLIANCE_AGENTMAIL_WEBHOOK_SECRET`` and compare in constant time.
    # If the secret is unset we refuse the request — an unauthenticated
    # webhook is a remote code execution vector.
    webhook_secret = os.getenv("COMPLIANCE_AGENTMAIL_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise HTTPException(
            status_code=503,
            detail=(
                "COMPLIANCE_AGENTMAIL_WEBHOOK_SECRET is not configured; the "
                "ingestion webhook is disabled until the operator sets it."
            ),
        )
    sig_header = request.headers.get("X-Webhook-Signature", "")
    ts_header = request.headers.get("X-Webhook-Timestamp", "")
    if not sig_header.startswith("sha256="):
        raise HTTPException(status_code=401, detail="Missing or malformed X-Webhook-Signature header")
    if not ts_header:
        raise HTTPException(status_code=401, detail="Missing X-Webhook-Timestamp header")
    try:
        ts_int = int(ts_header)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="X-Webhook-Timestamp must be a unix timestamp") from exc
    # 5-minute clock skew window to prevent replay attacks.
    import time as _time

    if abs(int(_time.time()) - ts_int) > 300:
        raise HTTPException(status_code=401, detail="Webhook timestamp outside acceptable window")
    # We re-serialise the parsed JSON so the signature matches what the
    # caller signed.  Callers should sign the raw bytes; this is a best-
    # effort check for a JSON body.
    raw_body = await request.body()
    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        f"{ts_header}.".encode() + raw_body,
        hashlib.sha256,
    ).hexdigest()
    provided = sig_header.split("=", 1)[1]
    if not hmac.compare_digest(expected, provided):
        raise HTTPException(status_code=401, detail="Webhook signature verification failed")

    from datetime import UTC, datetime

    from agentmail import MessageReceivedEvent
    from agentmail.attachments.types import Attachment
    from agentmail.messages.types.message import Message
    from agentmail.threads.types.thread_item import ThreadItem

    try:
        message_data = payload.get("message", {})
        attachments_data = message_data.get("attachments", []) or []

        attachments = [
            Attachment(
                attachment_id=att.get("attachment_id", ""),
                filename=att.get("filename"),
                size=att.get("size", 0),
                content_type=att.get("content_type"),
            )
            for att in attachments_data
        ]

        now = datetime.now(UTC)
        message = Message(
            inbox_id=message_data.get("inbox_id", "webhook"),
            thread_id=message_data.get("thread_id", "webhook"),
            message_id=message_data.get("message_id", ""),
            labels=message_data.get("labels", []),
            timestamp=now,
            from_=message_data.get("from", "unknown@example.com"),
            to=message_data.get("to", []),
            subject=message_data.get("subject", ""),
            preview=message_data.get("preview", ""),
            text=message_data.get("text", ""),
            attachments=attachments,
            headers=message_data.get("headers", {}),
            size=message_data.get("size", 0),
            updated_at=now,
            created_at=now,
        )

        event = MessageReceivedEvent(
            event_type="message.received",
            event_id=payload.get("event_id", "webhook"),
            message=message,
            thread=ThreadItem(
                inbox_id=message.inbox_id,
                thread_id=message.thread_id,
                labels=[],
                timestamp=now,
                received_timestamp=now,
                sent_timestamp=now,
                senders=[message.from_],
                recipients=message.to,
                subject=message.subject,
                preview=message.preview,
                attachments=attachments,
                last_message_id=message.message_id,
                message_count=1,
                size=message.size,
                updated_at=now,
                created_at=now,
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid webhook payload: {exc}") from None

    result = await process_email(event, _ingestion_pipeline)
    return result


app = create_app()
