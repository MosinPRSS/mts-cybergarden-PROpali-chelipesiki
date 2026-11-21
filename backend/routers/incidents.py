from copy import deepcopy
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.sse_manager import sse_manager
from domain.incidents import IncidentSource, IncidentState
from models import Incident
from schemas.incidents import ErrorResponse, IncidentAssignRequest, IncidentCreate, IncidentCreateResponse, IncidentResponse

router = APIRouter(prefix="/api/incidents", tags=["incidents"])
DatabaseSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "", response_model=list[IncidentResponse],
    summary="Получить список инцидентов",
    description="Начальный снимок из PostgreSQL. Для последующих обновлений используется SSE-подписка.",
)
async def list_incidents(db: DatabaseSession):
    # Очистка на уровне SQL решённых инцидентов с истёкшим сроком 3 дней
    try:
        await db.execute(text("SELECT delete_expired_resolved_incidents()"))
        await db.commit()
    except Exception:
        await db.rollback()
        try:
            await db.execute(
                text(
                    "DELETE FROM incidents "
                    "WHERE (state_id IN (7, 10) OR state_enum IN ('Resolved', 'Closed')) "
                    "AND COALESCE(completion_date, updated_at) < NOW() - INTERVAL '3 days'"
                )
            )
            await db.commit()
        except Exception:
            await db.rollback()

    result = await db.scalars(select(Incident).order_by(Incident.submit_date.desc(), Incident.id))
    return [incident.to_dict() for incident in result.unique().all()]


@router.post(
    "/{incident_id}/resolve",
    response_model=IncidentResponse,
    summary="Отметить инцидент как решённый",
    description="Переводит инцидент в статус Resolved, фиксирует дату завершения и уведомляет подписчиков через SSE.",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def resolve_incident(incident_id: str, db: DatabaseSession):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

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

    all_incidents = await db.scalars(
        select(Incident).order_by(Incident.submit_date.desc(), Incident.id)
    )
    full_snapshot = [inc.to_dict() for inc in all_incidents.unique().all()]
    await sse_manager.broadcast_all(full_snapshot)

    return incident.to_dict()


@router.post(
    "/{incident_id}/assign",
    response_model=IncidentResponse,
    summary="Назначить команду на инцидент",
    description="Обновляет назначенную команду (assignedGroupName), фиксирует дату назначения и рассылает SSE.",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def assign_incident(incident_id: str, payload: IncidentAssignRequest, db: DatabaseSession):
    incident = await db.get(Incident, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")

    now = datetime.now(timezone.utc)
    incident.assigned_group_name = payload.team
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

    all_incidents = await db.scalars(
        select(Incident).order_by(Incident.submit_date.desc(), Incident.id)
    )
    full_snapshot = [inc.to_dict() for inc in all_incidents.unique().all()]
    await sse_manager.broadcast_all(full_snapshot)

    return incident.to_dict()


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
async def create_incident(payload: IncidentCreate, db: DatabaseSession) -> IncidentCreateResponse:
    raw = payload.model_dump(mode="json", by_alias=True)

    # Перепаковываем через IncidentSource для валидации доменных инвариантов
    # (согласованность stateId/stateEnum, диапазоны priorityId и т. д.)
    source = IncidentSource.model_validate(raw)

    # Проверяем, существует ли уже такой инцидент
    existing = await db.get(Incident, source.id)
    is_new = existing is None

    now = datetime.now(timezone.utc)
    values = {name: getattr(source, name) for name in IncidentSource.model_fields}
    values["source_payload"] = deepcopy(raw)
    values["updated_at"] = now

    stmt = insert(Incident).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Incident.id],
        set_={k: getattr(stmt.excluded, k) for k in values if k != "id"},
    )
    await db.execute(stmt)
    await db.commit()

    # Отправляем полный снимок всех инцидентов через SSE
    # (фронтенд ожидает полный массив и делает setIncidents(freshData))
    all_incidents = await db.scalars(
        select(Incident).order_by(Incident.submit_date.desc(), Incident.id)
    )
    full_snapshot = [inc.to_dict() for inc in all_incidents.unique().all()]
    notified = await sse_manager.broadcast_all(full_snapshot)

    return IncidentCreateResponse(id=source.id, created=is_new, sseNotified=notified)
