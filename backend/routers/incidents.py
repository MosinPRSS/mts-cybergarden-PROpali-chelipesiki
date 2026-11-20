"""
Incident dashboard router.
- GET  /api/incidents         → current JSON
- GET  /api/incidents/stream  → SSE stream (live updates on file change)
"""

import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["incidents"])

# Path to incidents data file
INCIDENTS_FILE = Path(__file__).parent.parent / "dashboard" / "incidents.json"

# In-memory set of asyncio Queues — one per connected SSE client
_clients: set[asyncio.Queue] = set()


# ─── File watcher (runs as background task) ───────────────────────────────────

async def _watch_incidents():
    """Watch incidents.json for changes and broadcast to all SSE clients."""
    last_mtime = INCIDENTS_FILE.stat().st_mtime if INCIDENTS_FILE.exists() else 0

    async def poll_fallback():
        nonlocal last_mtime
        while True:
            await asyncio.sleep(1.0)
            try:
                if INCIDENTS_FILE.exists():
                    current_mtime = INCIDENTS_FILE.stat().st_mtime
                    if current_mtime != last_mtime:
                        last_mtime = current_mtime
                        logger.info("incidents.json modified (mtime check), broadcasting update")
                        await _broadcast()
            except Exception as e:
                logger.debug("poll_fallback error: %s", e)

    poll_task = asyncio.create_task(poll_fallback())

    try:
        from watchfiles import awatch
        watch_path = str(INCIDENTS_FILE.parent if INCIDENTS_FILE.parent.exists() else INCIDENTS_FILE)
        async for changes in awatch(watch_path):
            if any("incidents.json" in Path(change[1]).name for change in changes):
                if INCIDENTS_FILE.exists():
                    last_mtime = INCIDENTS_FILE.stat().st_mtime
                logger.info("incidents.json modified (watchfiles event), broadcasting update")
                await _broadcast()
    except Exception as exc:
        logger.warning("File watcher event loop ended: %s", exc)
    finally:
        poll_task.cancel()


async def _broadcast():
    """Read incidents file and push to all connected clients."""
    try:
        data = INCIDENTS_FILE.read_text(encoding="utf-8")
        json.loads(data)  # validate JSON before broadcasting
    except Exception as exc:
        logger.error("Could not read/parse incidents.json: %s", exc)
        return

    dead = set()
    for queue in list(_clients):
        try:
            queue.put_nowait(data)
        except asyncio.QueueFull:
            dead.add(queue)
    _clients.difference_update(dead)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/incidents")
async def get_incidents():
    """Return current incidents as JSON."""
    if not INCIDENTS_FILE.exists():
        return JSONResponse(status_code=404, content={"error": "incidents.json not found"})
    try:
        data = json.loads(INCIDENTS_FILE.read_text(encoding="utf-8"))
        return JSONResponse(content=data)
    except json.JSONDecodeError as exc:
        return JSONResponse(status_code=500, content={"error": f"JSON parse error: {exc}"})


@router.get("/incidents/stream")
async def stream_incidents():
    """
    SSE endpoint. Sends current state immediately, then pushes updates
    whenever incidents.json changes on disk.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=16)
    _clients.add(queue)

    async def event_generator():
        try:
            # Send current snapshot immediately
            if INCIDENTS_FILE.exists():
                yield f"data: {INCIDENTS_FILE.read_text(encoding='utf-8')}\n\n"

            while True:
                try:
                    # Wait for update or send keepalive every 25 s
                    msg = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _clients.discard(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
