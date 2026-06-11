from __future__ import annotations

import asyncio
import inspect
import httpx
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from agentmail import AsyncAgentMail, MessageReceivedEvent, Subscribe
from agentmail.attachments.types import SendAttachment
from agentmail.core.events import EventType

from .config import Settings

logger = logging.getLogger(__name__)


class AgentMailClient:
    """Async wrapper around the AgentMail SDK for inbox creation, outbound email,
    and real-time inbound message subscription via websocket.
    """

    def __init__(
        self,
        api_key: str,
        client: AsyncAgentMail | None = None,
    ) -> None:
        self._client = client or AsyncAgentMail(api_key=api_key)
        self._inbox_id: str | None = None
        self._email: str | None = None
        self._tasks: set[asyncio.Task[None]] = set()

    @classmethod
    def from_settings(cls, settings: Settings) -> AgentMailClient:
        return cls(api_key=settings.agentmail_api_key)

    async def aclose(self) -> None:
        """Clean up resources: cancel listener tasks and close the SDK client."""
        self.stop_all()
        if hasattr(self._client, "aclose"):
            await self._client.aclose()

    def stop_all(self) -> None:
        """Cancel all tracked listener tasks."""
        for task in self._tasks:
            if not task.done():
                task.cancel()
        self._tasks.clear()

    async def create_inbox(self) -> tuple[str, str]:
        """Create a new AgentMail inbox and cache its ID for subsequent operations."""
        inbox = await self._client.inboxes.create()
        self._inbox_id = inbox.inbox_id
        self._email = inbox.email
        return inbox.inbox_id, inbox.email

    async def send_message(
        self,
        to: str,
        subject: str,
        body: str,
        attachments: list[SendAttachment] | None = None,
    ) -> None:
        """Send an outbound email from the previously created inbox."""
        if self._inbox_id is None:
            raise RuntimeError("No inbox available; call create_inbox() first.")
        await self._client.inboxes.messages.send(
            self._inbox_id,
            to=to,
            subject=subject,
            text=body,
            attachments=attachments,
        )

    async def download_attachment(self, attachment: Any) -> bytes:
        """Fetch the raw bytes for a given attachment.

        ``attachment`` must provide ``inbox_id``, ``message_id`` and
        ``attachment_id`` (dict-like access is supported).
        """
        inbox_id = attachment["inbox_id"]
        message_id = attachment["message_id"]
        attachment_id = attachment["attachment_id"]
        response = await self._client.inboxes.messages.get_attachment(
            inbox_id, message_id, attachment_id
        )
        async with httpx.AsyncClient() as client:
            r = await client.get(response.download_url)
            r.raise_for_status()
            return r.content

    async def subscribe_inbound(
        self,
        handler: Callable[[MessageReceivedEvent], Any]
        | Callable[[MessageReceivedEvent], Awaitable[Any]],
    ) -> asyncio.Task[None]:
        """Open a websocket to AgentMail and listen for inbound messages.

        Returns a background :class:`asyncio.Task` that runs until cancelled
        or the websocket connection closes.
        """
        inbox_id = self._inbox_id
        if inbox_id is None:
            raise RuntimeError("No inbox available; call create_inbox() first.")

        def _on_message(event: Any) -> None:
            if isinstance(event, MessageReceivedEvent):
                result = handler(event)
                if inspect.isawaitable(result):
                    task: asyncio.Task[None] = asyncio.create_task(result)  # type: ignore[arg-type]
                    self._tasks.add(task)
                    task.add_done_callback(self._tasks.discard)

        async def _listen() -> None:
            try:
                socket_ctx = self._client.websockets.connect()
                if inspect.isawaitable(socket_ctx):
                    socket_ctx = await socket_ctx
                async with socket_ctx as socket:
                    await socket.send_subscribe(
                        Subscribe(
                            event_types=["message.received"],
                            inbox_ids=[inbox_id],
                        )
                    )

                    socket.on(EventType.MESSAGE, _on_message)
                    await socket.start_listening()
            except Exception:
                logger.exception("Unhandled exception in AgentMail websocket listener")
                raise

        task = asyncio.create_task(_listen())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task
