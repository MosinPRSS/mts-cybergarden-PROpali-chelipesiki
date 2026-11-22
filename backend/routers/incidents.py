from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import uuid4
from sqlalchemy import select

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.auth import get_current_session, require_operator, CurrentSession
from domain.incidents import IncidentState
from models import Incident, IncidentAction
from services.incidents import import_incidents, load_incident_snapshot, publish_incident_snapshot
from schemas.incidents import ErrorResponse, IncidentUndoRequest, IncidentAssignRequest, IncidentCreate, IncidentCreateResponse, IncidentResponse

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
    description="Переводит инцидент в статус Research, фиксирует дату завершения и уведомляет подписчиков через SSE.",
    responses={404: {"model": ErrorResponse, "description": "Инцидент не найден"}},
)
async def resolve_incident(incident_id: str, db: DatabaseSession, session: CurrentSession):
    incident = await get_incident_or_404(db, incident_id, for_update=True)

    if incident.state_enum in (IncidentState.RESOLVED, IncidentState.CLOSED, IncidentState.RESEARCH):
        return incident.to_dict()
    previous = {"state_enum": incident.state_enum.value, "state_id": incident.state_id,
        "state": incident.state, "completion_date": incident.completion_date.isoformat() if incident.completion_date else None,
        "source_payload": deepcopy(incident.source_payload), "resolved_by": incident.resolved_by}
    now = datetime.now(timezone.utc)
    incident.state_enum = IncidentState.RESEARCH
    incident.state_id = 20
    incident.state = "Исследование ситуации"
    incident.resolved_by = session.user.to_dict()["full_name"]
    if incident.completion_date is None:
        incident.completion_date = now
    incident.updated_at = now

    payload = deepcopy(incident.source_payload or {})
    payload["stateEnum"] = "Research"
    payload["stateId"] = 20
    payload["state"] = "Исследование ситуации"
    payload["completionDate"] = incident.completion_date.isoformat()
    incident.source_payload = payload

    db.add(IncidentAction(id=str(uuid4()), incident_id=incident.id, actor_id=session.user.id,
        actor_login=session.user.login, action="resolve", previous=previous, incident_version=now, occurred_at=now))
    await db.commit()
    await db.refresh(incident)

    await publish_incident_snapshot(db)

    result = incident.to_dict()
    result["undo_resolve_until"] = now + timedelta(seconds=30)
    return result


@router.post("/{incident_id}/undo-resolve", response_model=IncidentResponse,
             dependencies=[Depends(require_operator)], summary="Вернуть инцидент из исследования в работу")
async def undo_resolution(incident_id: str, payload: IncidentUndoRequest, db: DatabaseSession, session: CurrentSession):
    incident = await get_incident_or_404(db, incident_id, for_update=True)
    now = datetime.now(timezone.utc)
    if payload.updated_at.tzinfo is None:
        raise HTTPException(422, "Версия должна содержать часовой пояс.")
    if incident.state_enum not in (IncidentState.RESEARCH, IncidentState.RESOLVED) or incident.updated_at != payload.updated_at:
        raise HTTPException(409, "Инцидент уже изменён. Отмена недоступна.")
    action = await db.scalar(select(IncidentAction).where(IncidentAction.incident_id == incident_id,
        IncidentAction.action == "resolve").order_by(IncidentAction.occurred_at.desc()).limit(1))
    previous = action.previous if action else {"state_enum": "Assigned", "state_id": 0,
        "state": "Назначен", "completion_date": None, "resolved_by": None}
    incident.state_enum = IncidentState(previous["state_enum"])
    incident.state_id = previous["state_id"]
    incident.state = previous["state"]
    incident.completion_date = datetime.fromisoformat(previous["completion_date"]) if previous["completion_date"] else None
    incident.resolved_by = previous.get("resolved_by")
    source = deepcopy(incident.source_payload)
    for key, value in {"stateEnum": incident.state_enum.value, "stateId": incident.state_id,
        "state": incident.state, "completionDate": incident.completion_date.isoformat() if incident.completion_date else None}.items():
        old_source = previous.get("source_payload", {})
        if action and key not in old_source:
            source.pop(key, None)
        else:
            source[key] = old_source.get(key, value)
    incident.source_payload = source
    incident.updated_at = now
    db.add(IncidentAction(id=str(uuid4()), incident_id=incident.id, actor_id=session.user.id,
        actor_login=session.user.login, action="undo_resolve", previous={"resolution_id": action.id if action else None},
        incident_version=now, occurred_at=now))
    await db.commit()
    await db.refresh(incident)
    await publish_incident_snapshot(db)
    return incident.to_dict()


@router.post("/{incident_id}/close", response_model=IncidentResponse,
             dependencies=[Depends(require_operator)], summary="Закрыть исследование и отправить в историю")
async def close_incident(incident_id: str, payload: IncidentUndoRequest, db: DatabaseSession, session: CurrentSession):
    incident = await get_incident_or_404(db, incident_id, for_update=True)
    if incident.updated_at != payload.updated_at or incident.state_enum not in (IncidentState.RESEARCH, IncidentState.RESOLVED):
        raise HTTPException(409, "Закрыть можно только актуальный инцидент из исследования.")
    now = datetime.now(timezone.utc)
    previous = {"state_enum": incident.state_enum.value, "resolved_by": incident.resolved_by}
    incident.state_enum = IncidentState.CLOSED
    incident.state_id = 10
    incident.state = "Закрыт"
    incident.closed_by = session.user.to_dict()["full_name"]
    incident.closed_at = now
    incident.updated_at = now
    source = deepcopy(incident.source_payload)
    source.update(stateEnum="Closed", stateId=10, state="Закрыт")
    incident.source_payload = source
    db.add(IncidentAction(id=str(uuid4()), incident_id=incident.id, actor_id=session.user.id,
        actor_login=session.user.login, action="close", previous=previous, incident_version=now, occurred_at=now))
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
