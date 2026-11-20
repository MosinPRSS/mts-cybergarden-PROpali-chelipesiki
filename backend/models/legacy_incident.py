from datetime import datetime
import enum
from typing import List, Optional
from sqlalchemy import (
    ForeignKey, 
    String, 
    Integer, 
    DateTime, 
    JSON, 
    Text, 
    func,
    Enum as SQLEnum
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.user import User
from core.db import Base

class LegacyIncidentStatus(str, enum.Enum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    CLOSED = "Closed"


class LegacyIncident(Base):
    __tablename__ = "legacy_incidents"

    id: Mapped[str] = mapped_column(String(50), primary_key=True, index=True)
    priority: Mapped[str] = mapped_column(String(30), nullable=False, default="Critical")  # Critical, High, etc.
    status: Mapped[LegacyIncidentStatus] = mapped_column(
        SQLEnum(
            LegacyIncidentStatus, name="incident_status_enum", native_enum=False,
            values_callable=lambda statuses: [status.value for status in statuses],
            create_constraint=True,
        ),
        default=LegacyIncidentStatus.OPEN,
        nullable=False,
    )
    service: Mapped[str] = mapped_column(String(100), nullable=False)   # МТС Деньги, МТС Банк и т.д.
    area: Mapped[str] = mapped_column(String(100), nullable=False)      # API Gateway, Авторизация
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    team: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sla: Mapped[int] = mapped_column(Integer, default=0)                # Оставшиеся секунды по SLA
    affected: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Внешний ключ на ответственного сотрудника (User)
    assignee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee: Mapped[Optional[User]] = relationship("User", lazy="joined")

    # Группы и теги храним в JSON-массивах
    groups: Mapped[List[str]] = mapped_column(JSON, default=list)
    tags: Mapped[List[str]] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "priority": self.priority,
            "status": self.status.value if hasattr(self.status, "value") else self.status,
            "service": self.service,
            "area": self.area,
            "summary": self.summary,
            "team": self.team or "",
            "assignee": self.assignee.to_dict()["full_name"] if self.assignee else None,
            "sla": self.sla,
            "affected": self.affected or "",
            "ai": self.ai_recommendation or "",
            "groups": self.groups or [],
            "tags": self.tags or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created": self.created_at.isoformat() if self.created_at else "",
            "updated": self.updated_at.isoformat() if self.updated_at else "",
        }

