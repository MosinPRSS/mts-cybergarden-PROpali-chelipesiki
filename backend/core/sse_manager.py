"""In-process SSE subscriptions. Run publishers and subscribers in one worker.

Each connection has its own bounded queue. Events are not persisted or replayed;
the producer must arrange a fresh snapshot when a client reconnects.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from fastapi.sse import ServerSentEvent

logger = logging.getLogger(__name__)


@dataclass(eq=False)
class SSESubscription:
    """One browser tab or service connection, independent of other subscribers."""

    user_id: int | None
    role: str | None
    queue: asyncio.Queue[ServerSentEvent | None]
    session_id: str | None = None
    id: str = field(default_factory=lambda: uuid4().hex)
    closed: bool = False

    async def events(self) -> AsyncIterator[ServerSentEvent]:
        while not self.closed:
            event = await self.queue.get()
            if event is None or self.closed:
                break
            yield event


class SSEConnectionManager:
    def __init__(self, queue_size: int = 100):
        if queue_size < 1:
            raise ValueError("queue_size must be positive")
        self._queue_size = queue_size
        self._connections: dict[str, SSESubscription] = {}

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def connect(
        self, user_id: int | None = None, role: str | None = None, session_id: str | None = None
    ) -> SSESubscription:
        """Identity must come from server-side authentication, never query params."""
        subscription = SSESubscription(
            user_id=user_id,
            role=role,
            queue=asyncio.Queue(maxsize=self._queue_size),
            session_id=session_id,
        )
        self._connections[subscription.id] = subscription
        logger.info("SSE connected: %s; total=%d", subscription.id, self.connection_count)
        return subscription

    def disconnect(self, subscription: SSESubscription) -> None:
        if self._connections.get(subscription.id) is not subscription:
            return
        del self._connections[subscription.id]
        subscription.closed = True
        # Wake a pending queue.get(), including when the queue was full.
        if subscription.queue.full():
            subscription.queue.get_nowait()
        subscription.queue.put_nowait(None)
        logger.info("SSE disconnected: %s; total=%d", subscription.id, self.connection_count)

    @asynccontextmanager
    async def subscribe(
        self, user_id: int | None = None, role: str | None = None, session_id: str | None = None
    ) -> AsyncIterator[SSESubscription]:
        subscription = await self.connect(user_id=user_id, role=role, session_id=session_id)
        try:
            yield subscription
        finally:
            self.disconnect(subscription)

    def close_all(self) -> None:
        for subscription in list(self._connections.values()):
            self.disconnect(subscription)

    def close_session(self, session_id: str) -> None:
        for subscription in list(self._connections.values()):
            if subscription.session_id == session_id:
                self.disconnect(subscription)

    def _send(
        self,
        subscriptions: Iterable[SSESubscription],
        message: Any,
        *,
        event: str | None = None,
        event_id: str | None = None,
    ) -> int:
        # Serialize once before queuing, so later mutations cannot change an event.
        payload = json.dumps(
            jsonable_encoder(message), ensure_ascii=False, allow_nan=False
        )
        item = ServerSentEvent(raw_data=payload, event=event, id=event_id)
        enqueued = 0
        for subscription in list(subscriptions):
            if subscription.closed:
                continue
            try:
                subscription.queue.put_nowait(item)
                enqueued += 1
            except asyncio.QueueFull:
                # A stalled client must not block or exhaust memory for other clients.
                logger.warning("Closing slow SSE subscriber: %s", subscription.id)
                self.disconnect(subscription)
        return enqueued

    async def send_to_user(
        self, user_id: int, message: Any, *,
        event: str | None = None, event_id: str | None = None,
    ) -> int:
        """Enqueue for every tab/device of a verified user; return queue count."""
        return self._send(
            (s for s in self._connections.values() if s.user_id == user_id),
            message,
            event=event,
            event_id=event_id,
        )

    async def broadcast_to_role(
        self, role: str, message: Any, *,
        event: str | None = None, event_id: str | None = None,
    ) -> int:
        return await self.broadcast_to_roles(
            [role], message, event=event, event_id=event_id
        )

    async def broadcast_to_roles(
        self, roles: Iterable[str], message: Any, *,
        event: str | None = None, event_id: str | None = None,
    ) -> int:
        target_roles = set(roles)
        return self._send(
            (s for s in self._connections.values() if s.role in target_roles),
            message,
            event=event,
            event_id=event_id,
        )

    async def broadcast_all(
        self, message: Any, *,
        event: str | None = None, event_id: str | None = None,
    ) -> int:
        """Return the number of queues written, not a delivery acknowledgement."""
        return self._send(
            self._connections.values(), message, event=event, event_id=event_id
        )


sse_manager = SSEConnectionManager()
