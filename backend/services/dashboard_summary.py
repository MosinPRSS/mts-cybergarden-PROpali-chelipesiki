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
from domain.incidents import ACTIVE_STATES, COORDINATOR_TEAM, IncidentState, incident_groups
from models import Incident
from schemas.summary import DashboardSummary, FocusIncident

logger = logging.getLogger(__name__)


def priority_query(as_of: datetime):
    active = Incident.state_enum.in_(ACTIVE_STATES)
    critical = and_(active, Incident.priority_id == 4)
    coordinator = Incident.assigned_group_name == COORDINATOR_TEAM
    urgent = and_(critical, Incident.deadline < as_of + timedelta(minutes=30))
    return (
        select(Incident)
        .where(
            or_(and_(active, or_(Incident.priority_id.in_([3, 4]), coordinator)),
                Incident.state_enum == IncidentState.RESEARCH),
        )
        .order_by(
            case((urgent, 0), (critical, 1), (coordinator, 2), (active, 3), else_=4),
            Incident.deadline.asc().nulls_last(),
            Incident.impact_id.desc(),
            Incident.submit_date.asc(),
            Incident.id.asc(),
        )
    )


def focus_reason(incident: Incident, as_of: datetime) -> str:
    if incident.state_enum in ACTIVE_STATES and incident.priority_id == 4:
        if incident.deadline is not None and incident.deadline < as_of + timedelta(minutes=30):
            return "critical_urgent"
        return "critical"
    if incident.assigned_group_name == COORDINATOR_TEAM:
        return "coordinator"
    return "research" if incident.state_enum == IncidentState.RESEARCH else "high"


def incident_snapshot(incident: Incident):
    snapshot = pb.IncidentSnapshot()
    states = {
        IncidentState.ASSIGNED: pb.INCIDENT_STATE_ASSIGNED,
        IncidentState.WORK_IN_PROGRESS: pb.INCIDENT_STATE_WORK_IN_PROGRESS,
        IncidentState.RESOLVED: pb.INCIDENT_STATE_RESOLVED,
        IncidentState.CLOSED: pb.INCIDENT_STATE_CLOSED,
        IncidentState.RESEARCH: pb.INCIDENT_STATE_RESEARCH,
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
        names = {"Критические": "critical", "На координаторах": "coordinator",
                 "Высокий приоритет": "high", "Исследование ситуации": "research"}
        statistics = dict.fromkeys([*names.values(), "overdue"], 0)
        for item in incidents:
            for group in incident_groups(item.state_enum, item.priority_id, item.assigned_group_name):
                statistics[names[group]] += 1
            if item.state_enum in ACTIVE_STATES and item.deadline and item.deadline <= as_of:
                statistics["overdue"] += 1
        if not incidents:
            return DashboardSummary(
                status="empty", summary="В четырёх группах внимания инцидентов нет.",
                highlights=[], limitations=[], total_candidates=0, analyzed_count=0, as_of=as_of, statistics=statistics,
            )
        # All eligible rows are fetched by SQL, with no dependency on board filters.
        selected = incidents[:20]
        request = pb.GenerateDashboardSummaryRequest(total_candidates=len(incidents), statistics=statistics)
        request.as_of.FromDatetime(as_of)
        for incident in selected:
            request.incidents.add().CopyFrom(incident_snapshot(incident))
        # Version, ordering and the 30-minute boundary invalidate the cache immediately.
        key = (tuple(sorted(statistics.items())), tuple((item.id, item.updated_at, focus_reason(item, as_of),
                     item.deadline, item.priority_id, item.impact_id, item.assigned_group_name)
                    for item in incidents))
        async with self._lock:
            if key == self._key and self._cached is not None and time.monotonic() < self._expires:
                return self._cached
            highlights = [FocusIncident(
                incident=incident.to_dict(now=as_of), reason=focus_reason(incident, as_of),
                summary={
                    "critical_urgent": "Критический инцидент: проверьте восстановление, срок и ответственного.",
                    "critical": "Критический инцидент: проверьте ход восстановления и ответственного.",
                    "coordinator": "Требует маршрутизации: проверьте назначение команды.",
                    "high": "Высокий приоритет: проверьте ход работ и риск задержки.",
                    "research": "Сервис восстановлен: требуется разбор причин.",
                }[focus_reason(incident, as_of)],
            ) for incident in selected[:3]]
            response = DashboardSummary(
                status="fallback", summary="Приоритетные инциденты по срокам и влиянию.",
                highlights=highlights, limitations=["ИИ-обзор временно недоступен. Показана очередь по правилам приоритета."],
                total_candidates=len(incidents), analyzed_count=0, as_of=as_of, statistics=statistics,
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
            if len(incidents) > len(selected):
                response.limitations.append(f"Подробно рассмотрены первые {len(selected)} из {len(incidents)} инцидентов; счётчики охватывают все группы.")
            self._expires = time.monotonic() + (300 if response.status == "ready" else 15)
            return response


dashboard_summary_service = DashboardSummaryService()
