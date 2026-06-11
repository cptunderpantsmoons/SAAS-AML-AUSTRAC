from __future__ import annotations

import os
import tempfile
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from agentmail import MessageReceivedEvent
from agentmail.attachments.types import Attachment
from agentmail.messages.types.message import Message
from agentmail.threads.types.thread_item import ThreadItem
from compliance_agent.ingestion import (
    IngestionPipeline,
    _download_bytes,
    _is_document,
    _parse_instructions,
    process_email,
)
from compliance_agent.mail_client import AgentMailClient
from compliance_agent.service_client import ComplianceServiceClient


def _make_message_event(
    *,
    attachments: list[Attachment] | None = None,
    text: str | None = None,
    preview: str | None = None,
) -> MessageReceivedEvent:
    return MessageReceivedEvent(
        event_type="message.received",
        event_id="evt-1",
        message=Message(
            inbox_id="inbox-1",
            thread_id="thread-1",
            message_id="msg-1",
            labels=[],
            timestamp=datetime(2024, 1, 1, tzinfo=UTC),
            from_="a@b.com",
            to=["c@d.com"],
            subject="Test",
            preview=preview,
            text=text,
            attachments=attachments or [],
            headers={},
            size=100,
            updated_at=datetime(2024, 1, 1, tzinfo=UTC),
            created_at=datetime(2024, 1, 1, tzinfo=UTC),
        ),
        thread=ThreadItem(
            inbox_id="inbox-1",
            thread_id="thread-1",
            labels=[],
            timestamp=datetime(2024, 1, 1, tzinfo=UTC),
            received_timestamp=datetime(2024, 1, 1, tzinfo=UTC),
            sent_timestamp=datetime(2024, 1, 1, tzinfo=UTC),
            senders=["a@b.com"],
            recipients=["c@d.com"],
            subject="Test",
            preview=preview,
            attachments=attachments or [],
            last_message_id="msg-1",
            message_count=1,
            size=100,
            updated_at=datetime(2024, 1, 1, tzinfo=UTC),
            created_at=datetime(2024, 1, 1, tzinfo=UTC),
        ),
    )


def _make_pipeline() -> Any:
    mock_mail_inner = MagicMock()
    mock_mail = AgentMailClient(api_key="test-key", client=mock_mail_inner)

    mock_service = MagicMock(spec=ComplianceServiceClient)
    mock_service.analyze_document = AsyncMock(return_value={"analysis_id": "anal-1"})

    pipeline = IngestionPipeline(mail_client=mock_mail, service_client=mock_service)
    return pipeline, mock_mail, mock_service


class TestIsDocument:
    def test_pdf_is_document(self) -> None:
        assert _is_document("report.pdf")

    def test_docx_is_document(self) -> None:
        assert _is_document("report.docx")

    def test_jpeg_is_document(self) -> None:
        assert _is_document("photo.jpeg")

    def test_jpg_is_document(self) -> None:
        assert _is_document("photo.jpg")

    def test_png_is_document(self) -> None:
        assert _is_document("photo.png")

    def test_txt_is_not_document(self) -> None:
        assert not _is_document("notes.txt")

    def test_none_is_not_document(self) -> None:
        assert not _is_document(None)

    def test_case_insensitive(self) -> None:
        assert _is_document("REPORT.PDF")


class TestParseInstructions:
    def test_screen_entity(self) -> None:
        body = "Please screen entity Acme Corp."
        instructions = _parse_instructions(body)
        assert len(instructions) == 1
        assert instructions[0]["type"] == "screen_entity"
        assert instructions[0]["target"] == "Acme Corp"

    def test_generate_smr(self) -> None:
        body = "Generate SMR for report R-2024-001"
        instructions = _parse_instructions(body)
        assert len(instructions) == 1
        assert instructions[0]["type"] == "generate_smr"
        assert instructions[0]["target"] == "R-2024-001"

    def test_no_instructions(self) -> None:
        body = "Hello, please find the attached documents."
        instructions = _parse_instructions(body)
        assert instructions == []

    def test_empty_body(self) -> None:
        instructions = _parse_instructions("")
        assert instructions == []

    def test_none_body(self) -> None:
        instructions = _parse_instructions(None)
        assert instructions == []

    def test_multiple_instructions(self) -> None:
        body = "Screen entity Acme Corp. Generate SMR for report R-001."
        instructions = _parse_instructions(body)
        assert len(instructions) == 2
        assert instructions[0]["type"] == "screen_entity"
        assert instructions[1]["type"] == "generate_smr"


@pytest.mark.asyncio
class TestProcessEmail:
    async def test_no_attachments(self) -> None:
        pipeline, _, _ = _make_pipeline()
        event = _make_message_event()
        result = await pipeline._process_email(event)
        assert result.message_id == "msg-1"
        assert result.attachments_count == 0
        assert result.document_analysis_id is None

    async def test_document_attachment_analyzed(self) -> None:
        pipeline, mock_mail, mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(return_value=b"pdfdata")

        event = _make_message_event(
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename="doc.pdf",
                    size=100,
                    content_type="application/pdf",
                )
            ]
        )
        result = await pipeline._process_email(event)

        assert result.message_id == "msg-1"
        assert result.attachments_count == 1
        assert result.document_analysis_id == "anal-1"
        mock_service.analyze_document.assert_awaited_once_with(
            b"pdfdata", "doc.pdf", "application/pdf"
        )

    async def test_non_document_attachment_ignored(self) -> None:
        pipeline, mock_mail, mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(return_value=b"textdata")

        event = _make_message_event(
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename="notes.txt",
                    size=50,
                    content_type="text/plain",
                )
            ]
        )
        result = await pipeline._process_email(event)

        assert result.attachments_count == 1
        assert result.document_analysis_id is None
        mock_service.analyze_document.assert_not_awaited()

    async def test_download_attachment_failure_graceful(self) -> None:
        pipeline, mock_mail, mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(side_effect=RuntimeError("network error"))

        event = _make_message_event(
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename="doc.pdf",
                    size=100,
                    content_type="application/pdf",
                )
            ]
        )
        result = await pipeline._process_email(event)

        assert result.attachments_count == 1
        assert result.document_analysis_id is None
        mock_service.analyze_document.assert_not_awaited()

    async def test_analyze_document_failure_graceful(self) -> None:
        pipeline, mock_mail, mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(return_value=b"pdfdata")
        mock_service.analyze_document = AsyncMock(side_effect=RuntimeError("analysis failed"))

        event = _make_message_event(
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename="doc.pdf",
                    size=100,
                    content_type="application/pdf",
                )
            ]
        )
        result = await pipeline._process_email(event)

        assert result.attachments_count == 1
        assert result.document_analysis_id is None

    async def test_temp_files_cleaned_up(self) -> None:
        pipeline, _mock_mail, mock_service = _make_pipeline()
        fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
        os.write(fd, b"pdfdata")
        os.close(fd)

        try:
            mock_service.analyze_document = AsyncMock(return_value={"analysis_id": "anal-1"})

            with patch.object(pipeline, "_extract_attachment", new=AsyncMock(return_value=tmp_path)):
                event = _make_message_event(
                    attachments=[
                        Attachment(
                            attachment_id="att-1",
                            filename="doc.pdf",
                            size=100,
                            content_type="application/pdf",
                        )
                    ]
                )
                await pipeline._process_email(event)

            assert not os.path.exists(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    async def test_first_document_analysis_id_returned(self) -> None:
        pipeline, mock_mail, mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(return_value=b"pdfdata")

        side_effects = [
            {"analysis_id": "anal-1"},
            {"analysis_id": "anal-2"},
        ]
        mock_service.analyze_document = AsyncMock(side_effect=side_effects)

        event = _make_message_event(
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename="doc1.pdf",
                    size=100,
                    content_type="application/pdf",
                ),
                Attachment(
                    attachment_id="att-2",
                    filename="doc2.pdf",
                    size=100,
                    content_type="application/pdf",
                ),
            ]
        )
        result = await pipeline._process_email(event)

        assert result.document_analysis_id == "anal-1"
        assert mock_service.analyze_document.await_count == 2

    async def test_body_instructions_scheduled(self) -> None:
        pipeline, _, _ = _make_pipeline()
        event = _make_message_event(text="Please screen entity Acme Corp.")
        result = await pipeline._process_email(event)
        assert result.message_id == "msg-1"
        assert len(pipeline._task_store) == 1
        task = next(iter(pipeline._task_store.values()))
        assert task.status == "pending"
        assert task.result is not None
        assert task.result["type"] == "screen_entity"
        assert task.result["target"] == "Acme Corp"

    async def test_body_instructions_multiple(self) -> None:
        pipeline, _, _ = _make_pipeline()
        event = _make_message_event(
            text="Screen entity Acme Corp. Generate SMR for report R-001."
        )
        result = await pipeline._process_email(event)
        assert result.message_id == "msg-1"
        assert len(pipeline._task_store) == 2

    async def test_filename_none_on_attachment(self) -> None:
        pipeline, mock_mail, mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(return_value=b"pdfdata")

        event = _make_message_event(
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename=None,
                    size=100,
                    content_type="application/pdf",
                )
            ]
        )
        result = await pipeline._process_email(event)

        assert result.attachments_count == 1
        assert result.document_analysis_id is None
        mock_service.analyze_document.assert_not_awaited()

    async def test_analyze_document_without_analysis_id(self) -> None:
        pipeline, mock_mail, mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(return_value=b"pdfdata")
        mock_service.analyze_document = AsyncMock(return_value={"foo": "bar"})

        event = _make_message_event(
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename="doc.pdf",
                    size=100,
                    content_type="application/pdf",
                )
            ]
        )
        result = await pipeline._process_email(event)

        assert result.attachments_count == 1
        assert result.document_analysis_id is None

    async def test_process_email_module_level(self) -> None:
        pipeline, mock_mail, _mock_service = _make_pipeline()
        mock_mail.download_attachment = AsyncMock(return_value=b"pdfdata")

        event = _make_message_event(
            text="Screen entity Acme Corp.",
            attachments=[
                Attachment(
                    attachment_id="att-1",
                    filename="doc.pdf",
                    size=100,
                    content_type="application/pdf",
                )
            ],
        )
        result = await process_email(event, pipeline)

        assert result.message_id == "msg-1"
        assert result.attachments_count == 1
        assert result.document_analysis_id == "anal-1"
        assert len(pipeline._task_store) == 1


@pytest.mark.asyncio
class TestDownloadBytes:
    async def test_returns_response_content(self) -> None:
        with patch("compliance_agent.ingestion.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.content = b"hello"
            mock_response.raise_for_status = MagicMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_cls.return_value = mock_client

            data = await _download_bytes("http://example.com/file")
            assert data == b"hello"
            mock_client.get.assert_awaited_once_with("http://example.com/file")

    async def test_raises_on_http_error(self) -> None:
        with patch("compliance_agent.ingestion.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock(side_effect=httpx.HTTPStatusError(
                "not found", request=MagicMock(), response=MagicMock(status_code=404)
            ))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_cls.return_value = mock_client

            with pytest.raises(httpx.HTTPStatusError):
                await _download_bytes("http://example.com/file")
