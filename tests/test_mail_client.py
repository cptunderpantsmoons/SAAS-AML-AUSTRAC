from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any
from unittest.mock import ANY, AsyncMock, MagicMock, Mock, patch

import pytest
from agentmail import MessageReceivedEvent
from agentmail.core.events import EventType
from agentmail.messages.types.message import Message
from agentmail.threads.types.thread_item import ThreadItem
from compliance_agent.config import Settings
from compliance_agent.mail_client import AgentMailClient


class _FakeConnect:
    """Async context manager that yields the supplied socket."""

    def __init__(self, socket: Any) -> None:
        self._socket = socket

    async def __aenter__(self, *args: Any, **kwargs: Any) -> Any:
        return self._socket

    async def __aexit__(self, *args: Any, **kwargs: Any) -> None:
        pass


@pytest.fixture
def mock_agent_mail() -> MagicMock:
    return MagicMock()


@pytest.fixture
def client(mock_agent_mail: MagicMock) -> AgentMailClient:
    return AgentMailClient(api_key="test-key", client=mock_agent_mail)


class TestFromSettings:
    def test_uses_configured_api_key(self) -> None:
        with patch("compliance_agent.mail_client.AsyncAgentMail") as mock_cls:
            mock_cls.return_value = MagicMock()
            settings = Settings(agentmail_api_key="secret-123")
            client = AgentMailClient.from_settings(settings)
            mock_cls.assert_called_once_with(api_key="secret-123")
            assert isinstance(client, AgentMailClient)


@pytest.mark.asyncio
class TestCreateInbox:
    async def test_returns_inbox_id_and_email(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        inbox_id, email = await client.create_inbox()
        assert inbox_id == "inbox-1"
        assert email == "test@agentmail.to"
        mock_agent_mail.inboxes.create.assert_awaited_once_with()


@pytest.mark.asyncio
class TestSendMessage:
    async def test_raises_without_inbox(self, client: AgentMailClient) -> None:
        with pytest.raises(RuntimeError, match="No inbox available"):
            await client.send_message("to@example.com", "Subject", "Body")

    async def test_sends_via_sdk(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()
        mock_agent_mail.inboxes.messages.send = AsyncMock()
        await client.send_message("to@example.com", "Subject", "Body")
        mock_agent_mail.inboxes.messages.send.assert_awaited_once_with(
            "inbox-1",
            to="to@example.com",
            subject="Subject",
            text="Body",
            attachments=None,
        )

    async def test_passes_attachments(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()
        mock_agent_mail.inboxes.messages.send = AsyncMock()
        attachment = MagicMock(spec="agentmail.attachments.types.SendAttachment")
        await client.send_message("to@example.com", "Subject", "Body", attachments=[attachment])
        mock_agent_mail.inboxes.messages.send.assert_awaited_once_with(
            "inbox-1",
            to="to@example.com",
            subject="Subject",
            text="Body",
            attachments=[attachment],
        )


def _make_message_event() -> MessageReceivedEvent:
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
            preview="Preview",
            attachments=[],
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
            preview="Preview",
            attachments=[],
            last_message_id="msg-1",
            message_count=1,
            size=100,
            updated_at=datetime(2024, 1, 1, tzinfo=UTC),
            created_at=datetime(2024, 1, 1, tzinfo=UTC),
        ),
    )


@pytest.mark.asyncio
class TestSubscribeInbound:
    async def test_raises_without_inbox(self, client: AgentMailClient) -> None:
        with pytest.raises(RuntimeError, match="No inbox available"):
            await client.subscribe_inbound(Mock())

    async def test_opens_websocket_and_starts_listening(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()
        mock_socket.on = Mock()
        mock_socket.start_listening = AsyncMock()

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))

        handler = Mock()
        task = await client.subscribe_inbound(handler)
        assert isinstance(task, asyncio.Task)
        await task

        mock_agent_mail.websockets.connect.assert_awaited_once()
        mock_socket.send_subscribe.assert_awaited_once()
        mock_socket.on.assert_called_once_with(EventType.MESSAGE, ANY)
        mock_socket.start_listening.assert_awaited_once()

    async def test_calls_sync_handler_for_message_received_event(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        captured_callbacks: list[Any] = []

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()

        def capture_on(event_type: Any, callback: Any) -> None:
            captured_callbacks.append(callback)

        mock_socket.on = Mock(side_effect=capture_on)

        event = _make_message_event()

        async def fake_start_listening() -> None:
            for cb in captured_callbacks:
                cb(event)
            await asyncio.sleep(0)

        mock_socket.start_listening = AsyncMock(side_effect=fake_start_listening)

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))

        handler = Mock()
        task = await client.subscribe_inbound(handler)
        await task

        handler.assert_called_once_with(event)

    async def test_calls_async_handler_for_message_received_event(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        captured_callbacks: list[Any] = []

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()

        def capture_on(event_type: Any, callback: Any) -> None:
            captured_callbacks.append(callback)

        mock_socket.on = Mock(side_effect=capture_on)

        event = _make_message_event()

        async def fake_start_listening() -> None:
            for cb in captured_callbacks:
                cb(event)
            await asyncio.sleep(0)

        mock_socket.start_listening = AsyncMock(side_effect=fake_start_listening)

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))

        async_handler = AsyncMock()
        task = await client.subscribe_inbound(async_handler)
        await task

        async_handler.assert_awaited_once_with(event)

    async def test_ignores_non_message_received_events(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        captured_callbacks: list[Any] = []

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()

        def capture_on(event_type: Any, callback: Any) -> None:
            captured_callbacks.append(callback)

        mock_socket.on = Mock(side_effect=capture_on)

        async def fake_start_listening() -> None:
            for cb in captured_callbacks:
                cb("some_other_event")
            await asyncio.sleep(0)

        mock_socket.start_listening = AsyncMock(side_effect=fake_start_listening)

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))

        handler = Mock()
        task = await client.subscribe_inbound(handler)
        await task

        handler.assert_not_called()

    async def test_task_is_cancellable(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()
        mock_socket.on = Mock()

        blocking = asyncio.Event()

        async def fake_start_listening() -> None:
            await blocking.wait()

        mock_socket.start_listening = AsyncMock(side_effect=fake_start_listening)

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))

        handler = Mock()
        task = await client.subscribe_inbound(handler)
        assert not task.done()

        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    async def test_logs_exception_in_listener_loop(
        self,
        client: AgentMailClient,
        mock_agent_mail: MagicMock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()
        mock_socket.on = Mock()
        mock_socket.start_listening = AsyncMock(side_effect=RuntimeError("boom"))

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))

        handler = Mock()
        task = await client.subscribe_inbound(handler)
        with pytest.raises(RuntimeError, match="boom"):
            await task

        assert "Unhandled exception in AgentMail websocket listener" in caplog.text


@pytest.mark.asyncio
class TestStopAll:
    async def test_cancels_tracked_listener_tasks(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()
        mock_socket.on = Mock()

        blocking = asyncio.Event()

        async def fake_start_listening() -> None:
            await blocking.wait()

        mock_socket.start_listening = AsyncMock(side_effect=fake_start_listening)

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))

        task = await client.subscribe_inbound(Mock())
        assert task in client._tasks
        client.stop_all()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert len(client._tasks) == 0


@pytest.mark.asyncio
class TestAclose:
    async def test_cancels_tasks_and_closes_client(
        self, client: AgentMailClient, mock_agent_mail: MagicMock
    ) -> None:
        fake_inbox = MagicMock(inbox_id="inbox-1", email="test@agentmail.to")
        mock_agent_mail.inboxes.create = AsyncMock(return_value=fake_inbox)
        await client.create_inbox()

        mock_socket = MagicMock()
        mock_socket.send_subscribe = AsyncMock()
        mock_socket.on = Mock()

        blocking = asyncio.Event()

        async def fake_start_listening() -> None:
            await blocking.wait()

        mock_socket.start_listening = AsyncMock(side_effect=fake_start_listening)

        mock_agent_mail.websockets.connect = AsyncMock(return_value=_FakeConnect(mock_socket))
        mock_agent_mail.aclose = AsyncMock()

        task = await client.subscribe_inbound(Mock())
        await client.aclose()

        with pytest.raises(asyncio.CancelledError):
            await task
        assert task.cancelled()
        mock_agent_mail.aclose.assert_awaited_once()
