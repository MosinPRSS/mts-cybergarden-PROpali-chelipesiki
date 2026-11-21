from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from schemas.incidents import IncidentResponse

SummaryMode = Literal["upcoming", "overdue"]


class FocusIncident(BaseModel):
    incident: IncidentResponse
    reason: Literal["critical_urgent", "deadline_soon", "overdue"]
    summary: str
    analyzed: bool = False


class DashboardSummary(BaseModel):
    status: Literal["ready", "partial", "fallback", "empty"]
    mode: SummaryMode = "upcoming"
    summary: str
    highlights: list[FocusIncident]
    limitations: list[str]
    total_candidates: int
    analyzed_count: int
    as_of: datetime
    generated_at: datetime | None = None
    statistics: dict[str, int] = Field(default_factory=dict)


class RelatedSummary(BaseModel):
    incident_id: str
    contribution: str


class IncidentSummary(BaseModel):
    incident_id: str
    summary: str
    related_incidents_used: list[RelatedSummary]
    limitations: list[str]
    generated_at: datetime
    incident_updated_at: datetime
