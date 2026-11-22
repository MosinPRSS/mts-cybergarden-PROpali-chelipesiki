import asyncio
from datetime import datetime, timezone
from typing import Annotated

import grpc
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BeforeValidator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_session
from core.db import get_db
from models import Incident
from ai_proto import generate_pb2 as pb
from schemas.summary import DashboardSummary, IncidentSummary, SummaryMode, SummaryWindow
from schemas.teams import TeamCandidate, TeamRecommendation, TeamRecommendationRequest
from domain.incidents import IncidentState
from services.dashboard_summary import dashboard_summary_service, priority_query, incident_snapshot
from services.incident_summary import incident_summary_service, related_context
from services.team_recommendation import team_recommendation_service, team_incident_service

router = APIRouter(prefix="/api/incidents", tags=["incidents"], dependencies=[Depends(get_current_session)])


@router.post("/recommend-for-team", response_model=list[TeamRecommendation])
async def recommend_for_team(team: TeamCandidate, db: Annotated[AsyncSession, Depends(get_db)]):
    if team.id == "coordinators":
        raise HTTPException(422, "Выберите команду исполнителей.")
    incidents = list((await db.scalars(select(Incident).where(
        Incident.state_enum.in_([IncidentState.ASSIGNED, IncidentState.WORK_IN_PROGRESS, IncidentState.RESEARCH]),
        Incident.assigned_group_name != team.name, Incident.team_selected_with_ai.is_(False),
    ).order_by(Incident.id))).all())
    snapshots = [incident_snapshot(item) for item in incidents]
    versions = {item.id: item.updated_at for item in incidents}
    db.expunge_all()
    await db.rollback()
    now = datetime.now(timezone.utc)
    requests = [pb.RecommendTeamIncidentsRequest(team=pb.TeamCandidate(**team.model_dump()),
        incidents=snapshots[i:i + 5]) for i in range(0, len(snapshots), 5)]
    for request in requests:
        request.as_of.FromDatetime(now)
    try:
        batches = await asyncio.gather(*(team_incident_service.recommend(request) for request in requests))
    except (grpc.RpcError, ValueError):
        raise HTTPException(503, "ИИ-подбор недоступен. Попробуйте ещё раз.") from None
    if versions:
        current = dict((await db.execute(select(Incident.id, Incident.updated_at).where(Incident.id.in_(versions)))).all())
        if current != versions:
            raise HTTPException(409, "Данные изменились. Повторите подбор.")
    return sorted([item for batch in batches for item in batch], key=lambda item: (-item.match_percent, item.incident_id))


@router.post("/{incident_id}/recommend-team", response_model=TeamRecommendation,
             summary="Подобрать команду с ИИ по компетенциям")
async def recommend_team(incident_id: str, payload: TeamRecommendationRequest,
                         db: Annotated[AsyncSession, Depends(get_db)]):
    target = await db.get(Incident, incident_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    if target.team_selected_with_ai:
        raise HTTPException(status_code=409, detail="Команда уже выбрана с помощью ИИ.")
    if target.state_enum in (IncidentState.RESOLVED, IncidentState.CLOSED):
        raise HTTPException(status_code=409, detail="Инцидент уже решён. Обновите карточку.")
    request = pb.RecommendIncidentTeamRequest(incident=incident_snapshot(target),
        teams=[pb.TeamCandidate(**team.model_dump()) for team in payload.teams])
    request.as_of.FromDatetime(datetime.now(timezone.utc))
    version = target.updated_at
    db.expunge_all()
    await db.rollback()
    try:
        response = await team_recommendation_service.recommend(request)
    except (grpc.RpcError, ValueError):
        raise HTTPException(status_code=503, detail="ИИ-подбор недоступен. Попробуйте ещё раз.") from None
    current = await db.scalar(select(Incident.updated_at).where(Incident.id == incident_id))
    if current != version:
        raise HTTPException(status_code=409, detail="Данные изменились. Повторите подбор.")
    return response


@router.get("/summary", response_model=DashboardSummary, summary="Сводка по ближайшим срокам или всем просроченным инцидентам")
async def dashboard_summary(db: Annotated[AsyncSession, Depends(get_db)], mode: SummaryMode = "upcoming",
                            window_minutes: Annotated[SummaryWindow, BeforeValidator(int)] = 30):
    as_of = datetime.now(timezone.utc)
    incidents = list((await db.scalars(priority_query(as_of, mode, window_minutes))).all())
    # Detach the snapshots and release the DB connection before provider latency.
    db.expunge_all()
    await db.rollback()
    return await dashboard_summary_service.summarize(incidents, as_of, mode, window_minutes)


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
