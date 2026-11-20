"""
Incident dashboard router.
- GET    /api/incidents                    → current JSON
- GET    /api/incidents/{id}               → get single incident
- POST   /api/incidents/{id}/groups        → add a group to incident
- DELETE /api/incidents/{id}/groups/{grp}  → remove group from incident
- GET    /api/groups                       → list all groups & counts
- GET    /api/incidents/stream             → SSE stream (live updates on file change)
"""

import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from models.schemas import GroupRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["incidents"])

# Path to incidents data file
INCIDENTS_FILE = Path(__file__).parent.parent / "dashboard" / "incidents.json"

# In-memory set of asyncio Queues — one per connected SSE client
_clients: set[asyncio.Queue] = set()

# 4 основные группы в порядке значимости (по регламенту МТС)
SIGNIFICANT_GROUPS = [
    "Критические",
    "На координаторах",
    "Высокий риск",
    "Исследование ситуации",
]


def _ensure_groups(inc: dict) -> list[str]:
    """Auto-derive groups if omitted or empty to ensure backwards compatibility."""
    groups = inc.get("groups")
    if groups is None or not isinstance(groups, list) or len(groups) == 0:
        groups = []
        priority = inc.get("priority", "")
        team = inc.get("team", "")
        if priority == "Critical":
            groups.append("Критические")
        if "Координатор" in team or priority == "Assigned":
            groups.append("На координаторах")
        if priority == "High":
            groups.append("Высокий риск")
        if priority == "Resolved" or "Решено" in str(inc.get("updated", "")):
            groups.append("Исследование ситуации")
        if not groups:
            groups.append("Критические" if priority == "Critical" else "Высокий риск")
        inc["groups"] = groups
    return inc["groups"]


def _load_incidents() -> list[dict]:
    if not INCIDENTS_FILE.exists():
        return []
    try:
        raw = INCIDENTS_FILE.read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    _ensure_groups(item)
            return data
        return []
    except Exception as exc:
        logger.error("Could not load incidents: %s", exc)
        return []


def _save_incidents(data: list[dict]):
    INCIDENTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


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
    """Return current incidents as JSON with ensured groups."""
    if not INCIDENTS_FILE.exists():
        return JSONResponse(status_code=404, content={"error": "incidents.json not found"})
    try:
        data = _load_incidents()
        return JSONResponse(content=data)
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": f"JSON parse error: {exc}"})


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str):
    """Return single incident by ID."""
    data = _load_incidents()
    for inc in data:
        if inc.get("id") == incident_id:
            return JSONResponse(content=inc)
    return JSONResponse(status_code=404, content={"error": f"Incident {incident_id} not found"})


@router.post("/incidents/{incident_id}/groups")
@router.patch("/incidents/{incident_id}/groups")
async def add_incident_group(incident_id: str, payload: GroupRequest):
    """
    Add a group to an incident and persist to incidents.json.
    Broadcasts change automatically to all active SSE subscribers.
    """
    group_name = payload.group.strip()
    if not group_name:
        return JSONResponse(status_code=400, content={"error": "Group name cannot be empty"})

    data = _load_incidents()
    target = None
    for inc in data:
        if inc.get("id") == incident_id:
            target = inc
            break

    if not target:
        return JSONResponse(status_code=404, content={"error": f"Incident {incident_id} not found"})

    groups = target.setdefault("groups", [])
    if group_name not in groups:
        groups.append(group_name)
        if len(groups) > 1:
            tags = target.setdefault("tags", [])
            if "Мульти-группа" not in tags:
                tags.append("Мульти-группа")

        _save_incidents(data)
        await _broadcast()

    return JSONResponse(content=target)


@router.delete("/incidents/{incident_id}/groups/{group_name}")
async def remove_incident_group(incident_id: str, group_name: str):
    """Remove a group from an incident and persist to incidents.json."""
    data = _load_incidents()
    target = None
    for inc in data:
        if inc.get("id") == incident_id:
            target = inc
            break

    if not target:
        return JSONResponse(status_code=404, content={"error": f"Incident {incident_id} not found"})

    groups = target.get("groups", [])
    if group_name in groups:
        groups.remove(group_name)
        if len(groups) <= 1 and "tags" in target and "Мульти-группа" in target["tags"]:
            target["tags"].remove("Мульти-группа")

        _save_incidents(data)
        await _broadcast()

    return JSONResponse(content=target)


@router.get("/groups")
async def get_groups():
    """Return list of all groups with incident counts and significance order."""
    data = _load_incidents()
    counts: dict[str, int] = {}
    for g in SIGNIFICANT_GROUPS:
        counts[g] = 0

    for inc in data:
        for g in inc.get("groups", []):
            counts[g] = counts.get(g, 0) + 1

    result = [
        {
            "name": name,
            "count": count,
            "is_base": name in SIGNIFICANT_GROUPS,
            "significance_rank": (
                SIGNIFICANT_GROUPS.index(name) + 1 if name in SIGNIFICANT_GROUPS else 99
            ),
        }
        for name, count in sorted(
            counts.items(),
            key=lambda item: (
                SIGNIFICANT_GROUPS.index(item[0]) if item[0] in SIGNIFICANT_GROUPS else 99,
                item[0],
            ),
        )
    ]
    return JSONResponse(content=result)


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
                    break
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
