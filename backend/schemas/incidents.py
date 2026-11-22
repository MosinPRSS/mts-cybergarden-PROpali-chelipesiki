from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from domain.incidents import IncidentSource, IncidentState


class HealthResponse(BaseModel):
    status: str = Field(description="Состояние процесса API", examples=["ok"])


class IncidentCreate(IncidentSource):
    """The same validation and normalization as the ITSM file importer."""


class IncidentCreateResponse(BaseModel):
    id: str = Field(description="Номер созданного инцидента")
    created: bool = Field(description="True — создан, False — обновлён (upsert)")
    sseNotified: int = Field(description="Количество SSE-подписчиков, которым отправлено уведомление")


class IncidentAssignRequest(BaseModel):
    team: str = Field(description="Наименование команды, которой передаётся инцидент")
    assignee: str | None = Field(default=None, description="ФИО ответственного сотрудника")
    assignee_login: str | None = Field(default=None, description="Логин ответственного сотрудника")
    team_selected_with_ai: bool = Field(default=False, strict=True, description="Координатор подтвердил команду из ИИ-подбора")


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
    team_selected_with_ai: bool = Field(default=False, description="Текущая команда выбрана с помощью ИИ")
    assignee: str
    affected: str = Field(description="Исходная оценка impact, не выдуманное число клиентов")
    ai: str = Field(description="Пустая строка, пока реальный ИИ-анализ отсутствует")
    itsm_url: str | None = Field(default=None, description="Адрес записи по настроенному ITSM_URL_TEMPLATE; null, пока адрес ITSM неизвестен")
    tags: list[str]
    created: str
    updated: str
    created_at: datetime = Field(description="Время регистрации submitDate")
    updated_at: datetime = Field(description="Время последнего изменения импортированной записи в БД")
