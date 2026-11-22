"""Incident semantics from the original ITSM export, independent of persistence."""

import math
from datetime import datetime, timezone
from enum import Enum
from typing import Self

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, StrictBool, StrictInt,
    field_validator, model_validator,
)

COORDINATOR_TEAM = "КЦ ИТ Координаторы Массовых Инцидентов"


class IncidentState(str, Enum):
    ASSIGNED = "Assigned"
    WORK_IN_PROGRESS = "WorkInProgress"
    RESOLVED = "Resolved"
    CLOSED = "Closed"
    RESEARCH = "Research"


# Observed triples in all 44 source records. The accompanying dictionary swaps
# codes 7/10 and omits 20; do not silently rewrite the supplied records.
STATE_IDS = {
    0: IncidentState.ASSIGNED,
    2: IncidentState.WORK_IN_PROGRESS,
    7: IncidentState.RESOLVED,
    10: IncidentState.CLOSED,
    20: IncidentState.RESEARCH,
}
ACTIVE_STATES = {IncidentState.ASSIGNED, IncidentState.WORK_IN_PROGRESS}
RESOLVED_STATES = {IncidentState.RESOLVED, IncidentState.CLOSED, IncidentState.RESEARCH}


class IncidentSource(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    sys_id: str = Field(alias="sysId")
    id: str = Field(alias="id")
    state: str = Field(alias="state")
    state_enum: IncidentState = Field(alias="stateEnum")
    state_id: StrictInt = Field(alias="stateId", description="Коды реальной выгрузки: 0 Assigned, 2 WorkInProgress, 7 Resolved, 10 Closed, 20 Research. В описательном справочнике 7/10 перепутаны, 20 пропущен.")
    state_reason: str | None = Field(default=None, alias="stateReason")
    state_reason_id: str = Field(alias="stateReasonId")
    submit_date: AwareDatetime = Field(alias="submitDate")
    deadline: AwareDatetime | None = Field(default=None, alias="deadline", description="Абсолютный срок решения с часовым поясом; null допустим")
    completion_date: AwareDatetime | None = Field(default=None, alias="completionDate")
    last_assignment_to_team_date_time: AwareDatetime | None = Field(default=None, alias="lastAssignmentToTeamDateTime")
    header: str = Field(alias="header")
    description: str = Field(alias="description")
    short_description: str = Field(alias="shortDescription")
    assigned_group_name: str = Field(alias="assignedGroupName")
    assigned_employee: str = Field(alias="assignedEmployee")
    assigned_employee_login: str = Field(alias="assignedEmployeeLogin")
    initiator_name: str = Field(alias="initiatorName")
    initiator_login: str = Field(alias="initiatorLogin")
    is_effect: StrictBool = Field(alias="isEffect")
    is_reason: StrictBool = Field(alias="isReason")
    is_double: StrictBool = Field(alias="isDouble")
    is_master: StrictBool = Field(alias="isMaster")
    inc_type: str = Field(alias="incType")
    service_type_id: StrictInt = Field(alias="serviceTypeId")
    service_type: str = Field(alias="serviceType")
    priority_id: StrictInt = Field(alias="priorityId", description="1 Низкий, 2 Средний, 3 Высокий, 4 Наивысший; для группы критических принят код 4")
    priority: str = Field(alias="priority")
    urgency_id: StrictInt = Field(alias="urgencyId")
    urgency: str = Field(alias="urgency")
    impact_id: StrictInt = Field(alias="impactId")
    impact: str = Field(alias="impact")
    waiting_exit_date: AwareDatetime | None = Field(default=None, alias="waitingExitDate")
    is_root_incident: StrictBool = Field(alias="isRootIncident")
    product_name: str = Field(alias="productName")
    product_id: str = Field(alias="productId")
    product_master_id: str = Field(alias="productMasterId")
    product_url: str | None = Field(default=None, alias="productUrl")
    service: str = Field(alias="service")
    service_id: str | None = Field(default=None, alias="serviceId")
    scenario_name: str = Field(alias="scenarioName")
    is_need_up: StrictBool | None = Field(default=None, alias="isNeedUp")
    elimination_type: str | None = Field(default=None, alias="eliminationType")
    elimination_type_id: str | None = Field(default=None, alias="eliminationTypeId")
    receiving_channel: str = Field(alias="receivingChannel")
    solution: str = Field(alias="solution")

    @field_validator("waiting_exit_date", mode="before")
    @classmethod
    def empty_waiting_date(cls, value):
        if isinstance(value, str) and value.startswith("0001-01-01T00:00:00"):
            return None
        return value

    @field_validator("is_need_up", mode="before")
    @classmethod
    def aftermath_flag(cls, value):
        # The dictionary describes Да/Нет, but actual records use bool/null.
        if value == "Да":
            return True
        if value == "Нет":
            return False
        return value

    @field_validator("priority_id", "urgency_id", "impact_id")
    @classmethod
    def validate_scale(cls, value):
        if value not in (1, 2, 3, 4):
            raise ValueError("priorityId, urgencyId and impactId must be in 1..4")
        return value

    @model_validator(mode="after")
    def validate_state_pair(self) -> Self:
        if STATE_IDS.get(self.state_id) != self.state_enum:
            raise ValueError("stateId/stateEnum disagree with the observed export mapping")
        if self.service_type_id not in (10, 20, 30):
            raise ValueError("serviceTypeId must be 10, 20 or 30")
        if not self.id or not self.sys_id:
            raise ValueError("id and sysId must be non-empty strings")
        return self


def incident_groups(state: IncidentState | str, priority_id: int, team: str) -> list[str]:
    state = IncidentState(state)
    active = state in ACTIVE_STATES
    groups = []
    if active and priority_id == 4:
        groups.append("Критические")
    if (active or state == IncidentState.RESEARCH) and team == COORDINATOR_TEAM:
        groups.append("На координаторах")
    if active and priority_id == 3:
        groups.append("Высокий приоритет")
    if state in (IncidentState.RESEARCH, IncidentState.RESOLVED):
        groups.append("Исследование ситуации")
    return groups


def sla_details(
    state: IncidentState | str, deadline: datetime | None,
    completed: datetime | None, *, now: datetime | None = None,
) -> tuple[int | None, str]:
    if deadline is None:
        return None, "no_deadline"
    state = IncidentState(state)
    if state in RESOLVED_STATES:
        if completed is None:
            return None, "unknown"
        remaining = math.ceil((deadline - completed).total_seconds())
        return remaining, "met" if remaining >= 0 else "breached"
    remaining = math.ceil((deadline - (now or datetime.now(timezone.utc))).total_seconds())
    return remaining, "remaining" if remaining > 0 else "overdue"
