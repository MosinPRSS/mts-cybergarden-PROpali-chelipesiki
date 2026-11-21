from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, StrictBool, StrictInt

from domain.incidents import IncidentSource, IncidentState


class HealthResponse(BaseModel):
    status: str = Field(description="Состояние процесса API", examples=["ok"])


class IncidentCreate(BaseModel):
    """Payload для создания нового инцидента через POST /api/incidents.

    Структура полностью соответствует формату ITSM-экспорта (IncidentSource),
    чтобы генератор и внешние системы могли отправлять одинаковые тела запросов.
    """

    sysId: str = Field(description="Уникальный системный идентификатор записи в ITSM")
    id: str = Field(description="Номер инцидента, например INC000012345678")
    state: str = Field(description="Человекочитаемое состояние на языке источника")
    stateEnum: IncidentState = Field(description="Нормализованное состояние")
    stateId: StrictInt = Field(description="Код состояния: 0 Assigned, 2 WorkInProgress, 7 Resolved, 10 Closed, 20 Research")
    stateReason: str | None = Field(default=None)
    stateReasonId: str = Field(default="1")
    submitDate: AwareDatetime = Field(description="Время регистрации инцидента (ISO 8601 с TZ)")
    deadline: AwareDatetime | None = Field(default=None)
    completionDate: AwareDatetime | None = Field(default=None)
    lastAssignmentToTeamDateTime: AwareDatetime | None = Field(default=None)
    header: str = Field(description="Заголовок инцидента")
    description: str = Field(description="Полное описание")
    shortDescription: str = Field(description="Краткое описание")
    assignedGroupName: str = Field(description="Команда-исполнитель")
    assignedEmployee: str = Field(description="ФИО ответственного")
    assignedEmployeeLogin: str = Field(description="Логин ответственного")
    initiatorName: str = Field(description="ФИО инициатора")
    initiatorLogin: str = Field(description="Логин инициатора")
    isEffect: StrictBool = False
    isReason: StrictBool = False
    isDouble: StrictBool = False
    isMaster: StrictBool = False
    incType: str = Field(default="МИ")
    serviceTypeId: StrictInt = Field(description="10 | 20 | 30")
    serviceType: str
    priorityId: StrictInt = Field(description="1 Низкий, 2 Средний, 3 Высокий, 4 Наивысший")
    priority: str
    urgencyId: StrictInt = Field(default=2)
    urgency: str = Field(default="Средняя")
    impactId: StrictInt = Field(default=2)
    impact: str = Field(default="Средний")
    waitingExitDate: AwareDatetime | None = None
    isRootIncident: StrictBool = False
    productName: str = Field(default="")
    productId: str = Field(default="")
    productMasterId: str = Field(default="")
    productUrl: str | None = None
    service: str = Field(description="Наименование затронутого сервиса")
    serviceId: str | None = None
    scenarioName: str = Field(default="")
    isNeedUp: StrictBool | None = None
    eliminationType: str | None = None
    eliminationTypeId: str | None = None
    receivingChannel: str = Field(default="Автоматический")
    solution: str = Field(default="")


class IncidentCreateResponse(BaseModel):
    id: str = Field(description="Номер созданного инцидента")
    created: bool = Field(description="True — создан, False — обновлён (upsert)")
    sseNotified: int = Field(description="Количество SSE-подписчиков, которым отправлено уведомление")


class IncidentAssignRequest(BaseModel):
    team: str = Field(description="Наименование команды, которой передаётся инцидент")
    assignee: str | None = Field(default=None, description="ФИО ответственного сотрудника")
    assignee_login: str | None = Field(default=None, description="Логин ответственного сотрудника")


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
