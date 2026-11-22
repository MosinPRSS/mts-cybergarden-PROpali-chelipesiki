from copy import deepcopy
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.auth import get_current_session, require_operator
from domain.incidents import IncidentState
from models import Incident
from services.incidents import import_incidents, load_incident_snapshot, publish_incident_snapshot
from schemas.incidents import ErrorResponse, IncidentAssignRequest, IncidentCreate, IncidentCreateResponse, IncidentResponse

router = APIRouter(prefix="/api/incidents", tags=["incidents"], dependencies=[Depends(get_current_session)])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


async def get_incident_or_404(db: AsyncSession, incident_id: str, *, for_update: bool = False) -> Incident:
    if for_update:
        incident = await db.get(Incident, incident_id, with_for_update=True, populate_existing=True)
    else:
        incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.get(
    "", response_model=list[IncidentResponse],
    dependencies=[Depends(get_current_session)],
    summary="Получить список инцидентов",
    description="Начальный снимок из PostgreSQL. Для последующих обновлений используется SSE-подписка.",
)
async def list_incidents(db: DatabaseSession):
    return await load_incident_snapshot(db)


@router.post(
    "/{incident_id}/resolve",
    dependencies=[Depends(require_operator)],
    response_model=IncidentResponse,
    summary="Отметить инцидент как решённый",
    description="Переводит инцидент в статус Resolved, фиксирует дату завершения и уведомляет подписчиков через SSE.",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def resolve_incident(incident_id: str, db: DatabaseSession):
    incident = await get_incident_or_404(db, incident_id, for_update=True)

    now = datetime.now(timezone.utc)
    incident.state_enum = IncidentState.RESOLVED
    incident.state_id = 7
    incident.state = "Решён"
    if incident.completion_date is None:
        incident.completion_date = now
    incident.updated_at = now

    payload = deepcopy(incident.source_payload or {})
    payload["stateEnum"] = "Resolved"
    payload["stateId"] = 7
    payload["state"] = "Решён"
    payload["completionDate"] = incident.completion_date.isoformat()
    incident.source_payload = payload

    await db.commit()
    await db.refresh(incident)

    await publish_incident_snapshot(db)

    return incident.to_dict()


@router.post(
    "/{incident_id}/assign",
    dependencies=[Depends(require_operator)],
    response_model=IncidentResponse,
    summary="Назначить команду на инцидент",
    description="Обновляет назначенную команду (assignedGroupName), фиксирует дату назначения и рассылает SSE.",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def assign_incident(incident_id: str, payload: IncidentAssignRequest, db: DatabaseSession):
    incident = await get_incident_or_404(db, incident_id, for_update=True)

    now = datetime.now(timezone.utc)
    incident.assigned_group_name = payload.team
    incident.team_selected_with_ai = payload.team_selected_with_ai
    if payload.assignee:
        incident.assigned_employee = payload.assignee
    if payload.assignee_login:
        incident.assigned_employee_login = payload.assignee_login
    incident.last_assignment_to_team_date_time = now
    incident.updated_at = now

    source_data = deepcopy(incident.source_payload or {})
    source_data["assignedGroupName"] = incident.assigned_group_name
    source_data["assignedEmployee"] = incident.assigned_employee
    if payload.assignee_login:
        source_data["assignedEmployeeLogin"] = incident.assigned_employee_login
    source_data["lastAssignmentToTeamDateTime"] = now.isoformat()
    incident.source_payload = source_data

    await db.commit()
    await db.refresh(incident)

    await publish_incident_snapshot(db)

    return incident.to_dict()


@router.get(
    "/{incident_id}", response_model=IncidentResponse,
    dependencies=[Depends(get_current_session)],
    summary="Получить инцидент по ID",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def get_incident(incident_id: str, db: DatabaseSession):
    incident = await get_incident_or_404(db, incident_id)
    return incident.to_dict()


@router.get(
    "/{incident_id}/source", response_model=dict,
    dependencies=[Depends(get_current_session)],
    summary="Получить исходную запись ITSM без нормализации",
    description="Все исходные поля, null, служебные значения и неизвестные дополнительные поля сохраняются без потерь.",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def get_incident_source(incident_id: str, db: DatabaseSession):
    incident = await get_incident_or_404(db, incident_id)
    return incident.source_payload


@router.post(
    "",
    response_model=IncidentCreateResponse,
    status_code=201,
    summary="Создать или обновить инцидент",
    description=(
        "Принимает один инцидент в формате ITSM-экспорта. "
        "Операция идемпотентна: повторная отправка того же `id` обновит запись (upsert). "
        "После сохранения обновлённый объект рассылается всем SSE-подписчикам."
    ),
    responses={422: {"description": "Ошибка валидации — неверный формат поля"}},
)
async def create_incident(payload: IncidentCreate, request: Request, db: DatabaseSession) -> IncidentCreateResponse:
    # Keep the actual source object, including sentinel dates and extra attributes.
    raw = await request.json()
    try:
        stats = await import_incidents(db, [raw])
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Incident id or sysId conflicts with an existing record") from None
    is_new = bool(stats["incidents_created"])
    if stats["incidents_unchanged"]:
        return IncidentCreateResponse(id=payload.id, created=False, sseNotified=0)

    notified = await publish_incident_snapshot(db)

    return IncidentCreateResponse(id=payload.id, created=is_new, sseNotified=notified)
