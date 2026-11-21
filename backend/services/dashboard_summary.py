"""SQL selects and ranks incidents; the model explains this priority queue."""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

import grpc
from sqlalchemy import select

from ai_proto import generate_pb2 as pb
from ai_proto.generate_pb2_grpc import IncidentSummaryServiceStub
from config import settings
from domain.incidents import ACTIVE_STATES, IncidentState, incident_groups
from models import Incident
from schemas.summary import DashboardSummary, FocusIncident, SummaryMode

logger = logging.getLogger(__name__)


UPCOMING_WINDOW = timedelta(minutes=30)
OVERDUE_BATCH_SIZE = 5


def priority_query(as_of: datetime, mode: SummaryMode = "upcoming"):
    deadline = (Incident.deadline <= as_of if mode == "overdue" else
                (Incident.deadline > as_of) & (Incident.deadline <= as_of + UPCOMING_WINDOW))
    return (select(Incident).where(Incident.state_enum.in_(ACTIVE_STATES), deadline)
            .order_by(Incident.deadline.asc(), Incident.priority_id.desc(), Incident.impact_id.desc(),
                      Incident.submit_date.asc(), Incident.id.asc()))


def summary_candidates(incidents, as_of, mode: SummaryMode = "upcoming"):
    def eligible(item):
        if item.state_enum not in ACTIVE_STATES or item.deadline is None:
            return False
        return (item.deadline <= as_of if mode == "overdue" else
                as_of < item.deadline <= as_of + UPCOMING_WINDOW)
    return sorted((item for item in incidents if eligible(item)),
                  key=lambda item: (item.deadline, -item.priority_id, -item.impact_id, item.submit_date, item.id))


def focus_reason(incident: Incident, as_of: datetime, mode: SummaryMode = "upcoming") -> str:
    if mode == "overdue":
        return "overdue"
    return "critical_urgent" if incident.priority_id == 4 else "deadline_soon"


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
    """One pipeline with mode-specific selection, batching and independent caches."""

    def __init__(self):
        self._locks = {mode: asyncio.Lock() for mode in ("upcoming", "overdue")}
        self._cache = {}
        self._rpc_slots = asyncio.Semaphore(2)

    async def _analyze_batch(self, batch, as_of, mode, statistics, total):
        request = pb.GenerateDashboardSummaryRequest(
            incidents=[incident_snapshot(item) for item in batch], total_candidates=total,
            statistics=statistics, mode=pb.SUMMARY_MODE_OVERDUE if mode == "overdue" else pb.SUMMARY_MODE_UPCOMING)
        request.as_of.FromDatetime(as_of)
        expected = [item.id for item in (batch if mode == "overdue" else batch[:3])]
        try:
            async with self._rpc_slots:
                result = await generate_overview(request)
            if ([item.incident_id for item in result.highlights] != expected
                    or not result.summary.strip()
                    or any(not item.summary.strip() for item in result.highlights)
                    or not result.HasField("generated_at")):
                raise ValueError("Unexpected AI summary contract")
            return result
        except (grpc.RpcError, ValueError) as error:
            logger.warning("%s summary unavailable: %s", mode, type(error).__name__)
            return None

    async def summarize(self, incidents, as_of, mode: SummaryMode = "upcoming"):
        incidents = summary_candidates(incidents, as_of, mode)
        names = {"Критические": "critical", "На координаторах": "coordinator",
                 "Высокий приоритет": "high", "Исследование ситуации": "research"}
        statistics = dict.fromkeys([*names.values(), "overdue"], 0)
        for item in incidents:
            for group in incident_groups(item.state_enum, item.priority_id, item.assigned_group_name):
                statistics[names[group]] += 1
        statistics["overdue"] = len(incidents) if mode == "overdue" else 0
        if not incidents:
            return DashboardSummary(status="empty", mode=mode,
                summary="Просроченных активных инцидентов нет." if mode == "overdue" else
                        "Активных инцидентов со сроком в ближайшие 30 минут нет.",
                highlights=[], limitations=[], total_candidates=0, analyzed_count=0,
                as_of=as_of, statistics=statistics)

        key = tuple(incident_snapshot(item).SerializeToString(deterministic=True) for item in incidents)
        async with self._locks[mode]:
            cached = self._cache.get(mode)
            if cached and cached[0] == key and time.monotonic() < cached[1]:
                return cached[2]
            shown = incidents if mode == "overdue" else incidents[:3]
            selected = incidents if mode == "overdue" else incidents[:20]
            batches = ([selected[i:i + OVERDUE_BATCH_SIZE] for i in range(0, len(selected), OVERDUE_BATCH_SIZE)]
                       if mode == "overdue" else [selected])
            fallback_text = ("Срок в источнике истёк. Подтвердите фактический статус у ответственного; "
                             "если инцидент актуален, уточните причину задержки и следующий шаг."
                             if mode == "overdue" else
                             "Срок истекает в ближайшие 30 минут. Проверьте ход восстановления и ответственного.")
            response = DashboardSummary(status="fallback", mode=mode,
                summary=(f"Просрочено по данным источника: {len(incidents)}. Сначала подтвердите актуальность статусов."
                         if mode == "overdue" else "Инциденты с ближайшими сроками решения."),
                highlights=[FocusIncident(incident=item.to_dict(now=as_of), reason=focus_reason(item, as_of, mode),
                                          summary=fallback_text) for item in shown],
                limitations=[], total_candidates=len(incidents), analyzed_count=0,
                as_of=as_of, statistics=statistics)
            results = await asyncio.gather(*(self._analyze_batch(batch, as_of, mode, statistics, len(incidents))
                                             for batch in batches))
            explanations = {}
            generated = []
            for batch, result in zip(batches, results, strict=True):
                if result is None:
                    continue
                explanations.update({item.incident_id: item.summary for item in result.highlights})
                response.analyzed_count += len(batch)
                generated.append(result.generated_at.ToDatetime(tzinfo=timezone.utc))
                response.limitations.extend(result.limitations)
            for item in response.highlights:
                if item.incident.id in explanations:
                    item.summary = explanations[item.incident.id]
                    item.analyzed = True
            successful = sum(result is not None for result in results)
            if successful:
                response.status = "ready" if successful == len(batches) else "partial"
                response.generated_at = max(generated)
                if mode == "upcoming":
                    response.summary = results[0].summary
            if successful != len(batches):
                response.limitations.append(
                    "Часть ИИ-анализа недоступна. Все записи показаны; для необработанных даны подсказки по правилам."
                    if mode == "overdue" else "ИИ-обзор недоступен. Ближайшие инциденты показаны с подсказками по правилам.")
            if len(incidents) > len(selected):
                response.limitations.append(f"В контексте ИИ первые {len(selected)} из {len(incidents)} инцидентов с ближайшими сроками.")
            response.limitations = list(dict.fromkeys(response.limitations))
            self._cache[mode] = (key, time.monotonic() + (300 if response.status == "ready" else 15), response)
            return response


dashboard_summary_service = DashboardSummaryService()
