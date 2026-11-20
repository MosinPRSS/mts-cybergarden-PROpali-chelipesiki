from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.sse import EventSourceResponse, ServerSentEvent

from core.sse_manager import sse_manager

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get(
    "/stream",
    response_class=EventSourceResponse,
    summary="Subscribe to live incident updates",
    description=(
        "Live-only, currently unauthenticated feed. The producer broadcasts JSON "
        "incident arrays without an event name for the existing frontend onmessage "
        "handler. No initial snapshot or Last-Event-ID replay is implemented yet."
    ),
)
async def stream_incidents() -> AsyncIterator[ServerSentEvent]:
    # No client-supplied user_id/role: targeted subscriptions need an auth dependency.
    async with sse_manager.subscribe() as subscription:
        # Flush headers immediately without sending a fake/empty incident snapshot.
        yield ServerSentEvent(comment="connected", retry=4000)
        async for event in subscription.events():
            yield event
