from datetime import datetime, timezone
from typing import Annotated

import grpc
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_session
from core.db import get_db
from models import Incident
from ai_proto import generate_pb2 as pb
from schemas.summary import DashboardSummary, IncidentSummary, SummaryMode
from services.dashboard_summary import dashboard_summary_service, priority_query, incident_snapshot
from services.incident_summary import incident_summary_service, related_context

router = APIRouter(prefix="/api/incidents", tags=["incidents"], dependencies=[Depends(get_current_session)])


@router.get("/summary", response_model=DashboardSummary, summary="Сводка по ближайшим срокам или всем просроченным инцидентам")
async def dashboard_summary(db: Annotated[AsyncSession, Depends(get_db)], mode: SummaryMode = "upcoming"):
    as_of = datetime.now(timezone.utc)
    incidents = list((await db.scalars(priority_query(as_of, mode))).all())
    # Detach the snapshots and release the DB connection before provider latency.
    db.expunge_all()
    await db.rollback()
    return await dashboard_summary_service.summarize(incidents, as_of, mode)


@router.get("/{incident_id}/summary", response_model=IncidentSummary, summary="ИИ-анализ инцидента с похожими случаями")
async def incident_summary(incident_id: str, db: Annotated[AsyncSession, Depends(get_db)]):
    target = await db.get(Incident, incident_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    as_of = datetime.now(timezone.utc)
    candidates = list((await db.scalars(select(Incident).where(Incident.submit_date <= as_of))).all())
    related = related_context(target, candidates)
    request = pb.GenerateIncidentSummaryRequest(incident=incident_snapshot(target), related_incidents=related)
    request.as_of.FromDatetime(as_of)
    versions = {target.id: target.updated_at}
    versions.update({item.incident.id: item.incident.updated_at.ToDatetime(tzinfo=timezone.utc) for item in related})
    db.expunge_all()
    await db.rollback()
    try:
        response = await incident_summary_service.summarize(request)
    except (grpc.RpcError, ValueError):
        raise HTTPException(status_code=503, detail="ИИ-анализ временно недоступен. Попробуйте позже.") from None
    current = dict((await db.execute(select(Incident.id, Incident.updated_at).where(Incident.id.in_(versions)))).all())
    if current != versions:
        raise HTTPException(status_code=409, detail="Инцидент или похожие случаи изменились. Повторите анализ.")
    return response
