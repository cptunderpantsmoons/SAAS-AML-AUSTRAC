from __future__ import annotations

import asyncio
import inspect
from collections.abc import Callable
from typing import Any

from agentmail import AsyncAgentMail, MessageReceivedEvent, Subscribe
from agentmail.attachments.types import SendAttachment
from agentmail.core.events import EventType

from .config import Settings


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

    @classmethod
    def from_settings(cls, settings: Settings) -> AgentMailClient:
        return cls(api_key=settings.agentmail_api_key)

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

    async def subscribe_inbound(
        self,
        handler: Callable[[MessageReceivedEvent], Any],
    ) -> asyncio.Task[None]:
        """Open a websocket to AgentMail and listen for inbound messages.

        Returns a background :class:`asyncio.Task` that runs until cancelled
        or the websocket connection closes.
        """
        inbox_id = self._inbox_id
        if inbox_id is None:
            raise RuntimeError("No inbox available; call create_inbox() first.")

        async def _listen() -> None:
            async with self._client.websockets.connect() as socket:
                await socket.send_subscribe(
                    Subscribe(
                        event_types=["message.received"],
                        inbox_ids=[inbox_id],
                    )
                )

                async def _on_message(event: Any) -> None:
                    if isinstance(event, MessageReceivedEvent):
                        result = handler(event)
                        if inspect.isawaitable(result):
                            await result

                socket.on(EventType.MESSAGE, _on_message)
                await socket.start_listening()

        return asyncio.create_task(_listen())
