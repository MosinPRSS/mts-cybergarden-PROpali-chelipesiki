from copy import deepcopy
from datetime import datetime, timezone

from pydantic import TypeAdapter
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from domain.incidents import IncidentSource
from models import Incident


def validate_export(records: object) -> list[IncidentSource]:
    incidents = TypeAdapter(list[IncidentSource]).validate_python(records)
    if len({record.id for record in incidents}) != len(incidents):
        raise ValueError("Duplicate incident id in export")
    if len({record.sys_id for record in incidents}) != len(incidents):
        raise ValueError("Duplicate sysId in export")
    return incidents


async def import_incidents(session: AsyncSession, records: object) -> dict[str, int]:
    """Validate the whole export before writes. The caller owns the transaction.

    Importing source employees never creates application users or assigns roles.
    Missing IDs are retained; only explicit source changes are upserted.
    """
    parsed = validate_export(records)
    stats = {"incidents_created": 0, "incidents_updated": 0, "incidents_unchanged": 0}
    if not parsed:
        return stats
    previous = dict((await session.execute(
        select(Incident.id, Incident.source_payload).where(Incident.id.in_([item.id for item in parsed]))
    )).all())
    now = datetime.now(timezone.utc)
    for source, raw in zip(parsed, records, strict=True):
        if source.id in previous and previous[source.id] == raw:
            stats["incidents_unchanged"] += 1
            continue
        values = {name: getattr(source, name) for name in IncidentSource.model_fields}
        values["source_payload"] = deepcopy(raw)
        values["updated_at"] = now
        statement = insert(Incident).values(**values)
        statement = statement.on_conflict_do_update(
            index_elements=[Incident.id],
            set_={key: getattr(statement.excluded, key) for key in values if key != "id"},
        )
        await session.execute(statement)
        stats["incidents_updated" if source.id in previous else "incidents_created"] += 1
    return stats
