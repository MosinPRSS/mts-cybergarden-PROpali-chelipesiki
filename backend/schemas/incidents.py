from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from domain.incidents import IncidentSource, IncidentState


class HealthResponse(BaseModel):
    status: str = Field(description="Состояние процесса API", examples=["ok"])


class ErrorResponse(BaseModel):
    detail: str


class IncidentResponse(IncidentSource):
    status: IncidentState = Field(description="Тот же статус, что stateEnum; никогда не приоритет")
    is_active: bool
    is_resolved: bool
    groups: list[str] = Field(description="Вычисляются по статусу, priorityId и точному assignedGroupName", json_schema_extra={"readOnly": True})
    sla: int | None = Field(description="Секунды до deadline; отрицательное число — просрочка. Для решённых фиксируется на completionDate, null — срок неизвестен")
    sla_state: Literal["remaining", "overdue", "met", "breached", "no_deadline", "unknown"]
    area: str
    summary: str
    team: str
    assignee: str
    affected: str = Field(description="Исходная оценка impact, не выдуманное число клиентов")
    ai: str = Field(description="Пустая строка, пока реальный ИИ-анализ отсутствует")
    tags: list[str]
    created: str
    updated: str
    created_at: datetime = Field(description="Время регистрации submitDate")
    updated_at: datetime = Field(description="Время последнего изменения импортированной записи в БД")
