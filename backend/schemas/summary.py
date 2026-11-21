from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from schemas.incidents import IncidentResponse


class FocusIncident(BaseModel):
    incident: IncidentResponse
    reason: Literal["critical_urgent", "critical", "coordinator"]
    summary: str


class DashboardSummary(BaseModel):
    status: Literal["ready", "fallback", "empty"]
    summary: str
    highlights: list[FocusIncident]
    limitations: list[str]
    total_candidates: int
    analyzed_count: int
    as_of: datetime
    generated_at: datetime | None = None
