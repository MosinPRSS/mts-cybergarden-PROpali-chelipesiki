"""Immutable completion/undo history, retained independently of users and incidents."""
from datetime import datetime
from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from core.db import Base


class IncidentAction(Base):
    __tablename__ = "incident_actions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    incident_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    actor_id: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_login: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    previous: Mapped[dict] = mapped_column(JSONB, nullable=False)
    incident_version: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
