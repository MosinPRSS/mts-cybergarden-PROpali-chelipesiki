import asyncio
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.sse import EventSourceResponse, ServerSentEvent

from core.auth import CurrentSession
from core.sse_manager import sse_manager

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get(
    "/stream", response_class=EventSourceResponse,
    summary="Subscribe to live incident updates",
    description=("Authenticated live-only feed of incident arrays. No initial snapshot "
                 "or Last-Event-ID replay. The stream closes on logout or session expiry."),
)
async def stream_incidents(session: CurrentSession) -> AsyncIterator[ServerSentEvent]:
    remaining = max(0, (session.expires_at - datetime.now(timezone.utc)).total_seconds())
    async with sse_manager.subscribe(user_id=session.user_id, role=session.user.role.value,
                                     session_id=session.token_hash) as subscription:
        yield ServerSentEvent(comment="connected", retry=4000)
        try:
            async with asyncio.timeout(remaining):
                async for event in subscription.events():
                    yield event
        except TimeoutError:
            return
