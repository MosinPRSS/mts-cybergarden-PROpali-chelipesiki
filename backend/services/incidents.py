from copy import deepcopy
from datetime import datetime, timezone

from pydantic import TypeAdapter
from sqlalchemy import case, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.sse_manager import sse_manager
from domain.incidents import IncidentSource
from models import Incident


async def load_incident_snapshot(session: AsyncSession) -> list[dict]:
    result = await session.scalars(
        select(Incident).order_by(Incident.submit_date.desc(), Incident.id)
    )
    return [incident.to_dict() for incident in result.unique().all()]


async def publish_incident_snapshot(session: AsyncSession) -> int:
    """Publish the current snapshot after the caller commits its changes."""
    snapshot = await load_incident_snapshot(session)
    return await sse_manager.broadcast_all(snapshot)


def validate_export(records: object) -> list[IncidentSource]:
    incidents = TypeAdapter(list[IncidentSource]).validate_python(records)
    if len({record.id for record in incidents}) != len(incidents):
        raise ValueError("Duplicate incident id in export")
    if len({record.sys_id for record in incidents}) != len(incidents):
        raise ValueError("Duplicate sysId in export")
    return incidents


async def import_incidents(session: AsyncSession, records: object, *, update_existing: bool = True) -> dict[str, int]:
    """Validate the whole export before writes. The caller owns the transaction.

    Importing source employees never creates application users or assigns roles.
    Missing IDs are retained; only explicit source changes are upserted.
    Startup seeding sets update_existing=False to preserve working records.
    """
    parsed = validate_export(records)
    stats = {"incidents_created": 0, "incidents_updated": 0, "incidents_unchanged": 0}
    if not parsed:
        return stats
    previous = {}
    if update_existing:
        previous = dict((await session.execute(
            select(Incident.id, Incident.source_payload)
            .where(Incident.id.in_([item.id for item in parsed]))
            .order_by(Incident.id).with_for_update()
        )).all())
    now = datetime.now(timezone.utc)
    for source, raw in sorted(zip(parsed, records, strict=True), key=lambda item: item[0].id):
        if source.id in previous and previous[source.id] == raw:
            stats["incidents_unchanged"] += 1
            continue
        values = {name: getattr(source, name) for name in IncidentSource.model_fields}
        values["source_payload"] = deepcopy(raw)
        values["updated_at"] = now
        statement = insert(Incident).values(**values)
        if not update_existing:
            created = await session.scalar(
                statement.on_conflict_do_nothing(index_elements=[Incident.id]).returning(Incident.id)
            )
            stats["incidents_created" if created is not None else "incidents_unchanged"] += 1
            continue
        updates = {key: getattr(statement.excluded, key) for key in values if key != "id"}
        updates["team_selected_with_ai"] = case(
            (Incident.assigned_group_name != statement.excluded.assigned_group_name, False),
            else_=Incident.team_selected_with_ai,
        )
        statement = statement.on_conflict_do_update(
            index_elements=[Incident.id],
            set_=updates,
        )
        await session.execute(statement)
        stats["incidents_updated" if source.id in previous else "incidents_created"] += 1
    return stats
