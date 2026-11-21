"""SQL selects and ranks incidents; the model explains this priority queue."""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

import grpc
from sqlalchemy import and_, case, or_, select

from ai_proto import generate_pb2 as pb
from ai_proto.generate_pb2_grpc import IncidentSummaryServiceStub
from config import settings
from domain.incidents import ACTIVE_STATES, COORDINATOR_TEAM, IncidentState
from models import Incident
from schemas.summary import DashboardSummary, FocusIncident

logger = logging.getLogger(__name__)


def priority_query(as_of: datetime):
    critical = Incident.priority_id == 4
    urgent = and_(critical, Incident.deadline < as_of + timedelta(minutes=30))
    return (
        select(Incident)
        .where(
            Incident.state_enum.in_(ACTIVE_STATES),
            or_(critical, Incident.assigned_group_name == COORDINATOR_TEAM),
        )
        .order_by(
            case((urgent, 0), (critical, 1), else_=2),
            Incident.deadline.asc().nulls_last(),
            Incident.impact_id.desc(),
            Incident.submit_date.asc(),
            Incident.id.asc(),
        )
    )


def focus_reason(incident: Incident, as_of: datetime) -> str:
    if incident.priority_id == 4:
        if incident.deadline is not None and incident.deadline < as_of + timedelta(minutes=30):
            return "critical_urgent"
        return "critical"
    return "coordinator"


def incident_snapshot(incident: Incident):
    snapshot = pb.IncidentSnapshot()
    states = {
        IncidentState.ASSIGNED: pb.INCIDENT_STATE_ASSIGNED,
        IncidentState.WORK_IN_PROGRESS: pb.INCIDENT_STATE_WORK_IN_PROGRESS,
    }
    snapshot.state_enum = states[incident.state_enum]
    for field in snapshot.DESCRIPTOR.fields:
        name = field.name
        if name == "state_enum":
            continue
        value = getattr(incident, name, None)
        if value is None:
            continue
        if isinstance(value, datetime):
            getattr(snapshot, name).FromDatetime(value)
        else:
            # Bound free text in the provider request, preserve full data in the API.
            setattr(snapshot, name, value[:4000] if isinstance(value, str) else value)
    return snapshot


async def generate_overview(request):
    async with grpc.aio.insecure_channel(settings.AI_GRPC_TARGET) as channel:
        return await IncidentSummaryServiceStub(channel).GenerateDashboardSummary(
            request, timeout=settings.AI_SUMMARY_TIMEOUT_SECONDS
        )


class DashboardSummaryService:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._key = None
        self._expires = 0
        self._cached = None

    async def summarize(self, incidents, as_of):
        if not incidents:
            return DashboardSummary(
                status="empty", summary="Критических инцидентов и активных инцидентов на координаторах нет.",
                highlights=[], limitations=[], total_candidates=0, analyzed_count=0, as_of=as_of,
            )
        # All eligible rows are fetched by SQL, with no dependency on board filters.
        selected = incidents
        request = pb.GenerateDashboardSummaryRequest(total_candidates=len(incidents))
        request.as_of.FromDatetime(as_of)
        for incident in selected:
            request.incidents.add().CopyFrom(incident_snapshot(incident))
        # Version, ordering and the 30-minute boundary invalidate the cache immediately.
        key = tuple((item.id, item.updated_at, focus_reason(item, as_of),
                     item.deadline, item.priority_id, item.impact_id, item.assigned_group_name)
                    for item in incidents)
        async with self._lock:
            if key == self._key and self._cached is not None and time.monotonic() < self._expires:
                return self._cached
            highlights = [FocusIncident(
                incident=incident.to_dict(now=as_of), reason=focus_reason(incident, as_of),
                summary="Критический инцидент: проверьте ход восстановления и ответственного."
                    if incident.priority_id == 4 else "Требует маршрутизации: проверьте ответственного и назначение команды.",
            ) for incident in selected[:3]]
            response = DashboardSummary(
                status="fallback", summary="Приоритетные инциденты по срокам и влиянию.",
                highlights=highlights, limitations=["ИИ-обзор временно недоступен. Показана очередь по правилам приоритета."],
                total_candidates=len(incidents), analyzed_count=0, as_of=as_of,
            )
            try:
                result = await generate_overview(request)
                expected = [item.id for item in selected[:3]]
                if ([item.incident_id for item in result.highlights] != expected
                        or not result.summary.strip()
                        or any(not item.summary.strip() for item in result.highlights)
                        or not result.HasField("generated_at")):
                    raise ValueError("Unexpected AI summary contract")
                for highlight, explanation in zip(highlights, result.highlights, strict=True):
                    highlight.summary = explanation.summary
                response.status = "ready"
                response.summary = result.summary
                response.limitations = list(result.limitations)
                response.generated_at = result.generated_at.ToDatetime(tzinfo=timezone.utc)
                response.analyzed_count = len(selected)
            except (grpc.RpcError, ValueError) as error:
                logger.warning("Dashboard summary unavailable: %s", type(error).__name__)
            self._key = key
            self._cached = response
            self._expires = time.monotonic() + (60 if response.status == "ready" else 15)
            return response


dashboard_summary_service = DashboardSummaryService()
