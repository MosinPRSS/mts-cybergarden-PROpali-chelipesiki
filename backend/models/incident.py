"""Canonical incident fields mirror the ITSM export; groups and SLA are derived."""

from datetime import datetime
from typing import Any
from urllib.parse import quote, urlsplit

from config import settings

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum as SQLEnum, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core.db import Base
from domain.incidents import (
    ACTIVE_STATES, RESOLVED_STATES, IncidentSource, IncidentState,
    incident_groups, sla_details,
)

IncidentStatus = IncidentState

STATE_TYPE = SQLEnum(
    IncidentState, name="incident_state_enum", native_enum=False,
    values_callable=lambda states: [state.value for state in states],
    create_constraint=True,
)


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint("priority_id BETWEEN 1 AND 4", name="ck_incidents_priority"),
        CheckConstraint("urgency_id BETWEEN 1 AND 4", name="ck_incidents_urgency"),
        CheckConstraint("impact_id BETWEEN 1 AND 4", name="ck_incidents_impact"),
        CheckConstraint("service_type_id IN (10, 20, 30)", name="ck_incidents_service_type"),
        CheckConstraint(
            "(state_id = 0 AND state_enum = 'Assigned') OR "
            "(state_id = 2 AND state_enum = 'WorkInProgress') OR "
            "(state_id = 7 AND state_enum = 'Resolved') OR "
            "(state_id = 10 AND state_enum = 'Closed') OR "
            "(state_id = 20 AND state_enum = 'Research')",
            name="ck_incidents_state_pair",
        ),
    )

    sys_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    id: Mapped[str] = mapped_column(String(64), nullable=False, primary_key=True)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    state_enum: Mapped[IncidentState] = mapped_column(STATE_TYPE, nullable=False)
    state_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    state_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    state_reason_id: Mapped[str] = mapped_column(String(32), nullable=False)
    submit_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completion_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_assignment_to_team_date_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    header: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    short_description: Mapped[str] = mapped_column(Text, nullable=False)
    assigned_group_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    assigned_employee: Mapped[str] = mapped_column(String(255), nullable=False)
    assigned_employee_login: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    initiator_name: Mapped[str] = mapped_column(String(255), nullable=False)
    initiator_login: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    is_effect: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_reason: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_double: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_master: Mapped[bool] = mapped_column(Boolean, nullable=False)
    inc_type: Mapped[str] = mapped_column(String(32), nullable=False)
    service_type_id: Mapped[int] = mapped_column(Integer, nullable=False)
    service_type: Mapped[str] = mapped_column(String(100), nullable=False)
    priority_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    priority: Mapped[str] = mapped_column(String(100), nullable=False)
    urgency_id: Mapped[int] = mapped_column(Integer, nullable=False)
    urgency: Mapped[str] = mapped_column(String(100), nullable=False)
    impact_id: Mapped[int] = mapped_column(Integer, nullable=False)
    impact: Mapped[str] = mapped_column(String(100), nullable=False)
    waiting_exit_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_root_incident: Mapped[bool] = mapped_column(Boolean, nullable=False)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[str] = mapped_column(String(64), nullable=False)
    product_master_id: Mapped[str] = mapped_column(String(64), nullable=False)
    product_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    service: Mapped[str] = mapped_column(String(255), nullable=False)
    service_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scenario_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_need_up: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    elimination_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    elimination_type_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    receiving_channel: Mapped[str] = mapped_column(String(255), nullable=False)
    solution: Mapped[str] = mapped_column(Text, nullable=False)
    source_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    ai_recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def to_dict(self, *, now: datetime | None = None) -> dict:
        itsm_url = settings.ITSM_URL_TEMPLATE.replace("{id}", quote(self.id, safe="")).replace("{sysId}", quote(self.sys_id, safe=""))
        parsed_url = urlsplit(itsm_url)
        source = IncidentSource.model_validate({
            name: getattr(self, name) for name in IncidentSource.model_fields
        })
        data = source.model_dump(mode="json", by_alias=True)
        remaining, sla_state = sla_details(
            self.state_enum, self.deadline, self.completion_date, now=now
        )
        data.update({
            "status": self.state_enum.value,
            "is_active": self.state_enum in ACTIVE_STATES,
            "is_resolved": self.state_enum in RESOLVED_STATES,
            "groups": incident_groups(self.state_enum, self.priority_id, self.assigned_group_name),
            "sla": remaining,
            "sla_state": sla_state,
            "area": self.scenario_name,
            "summary": self.header,
            "team": self.assigned_group_name,
            "assignee": self.assigned_employee,
            "affected": self.impact,
            "ai": self.ai_recommendation or "",
            "itsm_url": itsm_url if parsed_url.scheme in {"http", "https"} and parsed_url.netloc else None,
            "tags": self.tags or [],
            "created": self.submit_date.isoformat(),
            "updated": self.updated_at.isoformat(),
            "created_at": self.submit_date.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        })
        return data
