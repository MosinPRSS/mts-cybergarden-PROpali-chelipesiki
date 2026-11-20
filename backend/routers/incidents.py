from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from models import Incident
from schemas.incidents import ErrorResponse, IncidentResponse

router = APIRouter(prefix="/api/incidents", tags=["incidents"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "", response_model=list[IncidentResponse],
    summary="Получить список инцидентов",
    description="Начальный снимок из PostgreSQL. Для последующих обновлений используется SSE-подписка.",
)
async def list_incidents(db: DatabaseSession):
    result = await db.scalars(select(Incident).order_by(Incident.submit_date.desc(), Incident.id))
    return [incident.to_dict() for incident in result.unique().all()]


@router.get(
    "/{incident_id}", response_model=IncidentResponse,
    summary="Получить инцидент по ID",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def get_incident(incident_id: str, db: DatabaseSession):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident.to_dict()


@router.get(
    "/{incident_id}/source", response_model=dict,
    summary="Получить исходную запись ITSM без нормализации",
    description="Все исходные поля, null, служебные значения и неизвестные дополнительные поля сохраняются без потерь.",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def get_incident_source(incident_id: str, db: DatabaseSession):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident.source_payload
