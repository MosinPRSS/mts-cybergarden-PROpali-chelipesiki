"""Small, on-demand analysis using the existing RPC and at most five analogues."""

import asyncio
import re
import time
from collections import OrderedDict
from datetime import timezone

import grpc

from ai_proto import generate_pb2 as pb
from ai_proto.generate_pb2_grpc import IncidentSummaryServiceStub
from config import settings
from domain.incidents import RESOLVED_STATES
from schemas.summary import IncidentSummary, RelatedSummary
from services.dashboard_summary import incident_snapshot


def _words(incident):
    text = " ".join([incident.header, incident.short_description, incident.description])
    return {word for word in re.findall(r"[\w]+", text.lower()) if len(word) >= 4}


def _same_entity(target, candidate, name, identifier):
    left, right = getattr(target, name), getattr(candidate, name)
    if not left or not right or left.strip().casefold() != right.strip().casefold():
        return False
    left_id, right_id = getattr(target, identifier), getattr(candidate, identifier)
    return not left_id or not right_id or left_id == right_id


def related_context(target, candidates):
    words = _words(target)
    ranked = []
    for item in candidates:
        if item.id == target.id:
            continue
        other = _words(item)
        overlap = len(words & other)
        similarity = overlap / len(words | other) if words | other else 0
        similar = overlap >= 2 and similarity >= 0.12
        product = _same_entity(target, item, "product_name", "product_id")
        service = _same_entity(target, item, "service", "service_id")
        if not (similar or product or service):
            continue
        related = pb.RelatedIncident(incident=incident_snapshot(item))
        if similar:
            kind = (pb.RELATION_KIND_PREVIOUS_SIMILAR_INCIDENT if item.submit_date < target.submit_date
                    else pb.RELATION_KIND_SIMILAR_DESCRIPTION)
            related.relations.add(kind=kind, similarity_score=similarity,
                                  explanation=f"Совпало слов в описании: {overlap}; сходство по множествам слов: {similarity:.2f}.")
        if product:
            related.relations.add(kind=pb.RELATION_KIND_SAME_PRODUCT, explanation="Совпадают название продукта и доступные идентификаторы.")
        if service:
            related.relations.add(kind=pb.RELATION_KIND_SAME_SERVICE, explanation="Совпадают название сервиса и доступные идентификаторы.")
        useful_solution = item.state_enum in RESOLVED_STATES and bool(item.solution.strip())
        rank = (similar, similar and useful_solution, similarity, service, product, item.submit_date, item.id)
        ranked.append((rank, related))
    ranked.sort(key=lambda entry: entry[0], reverse=True)
    return [entry[1] for entry in ranked[:5]]


async def generate_incident_summary(request):
    async with grpc.aio.insecure_channel(settings.AI_GRPC_TARGET) as channel:
        return await IncidentSummaryServiceStub(channel).GenerateIncidentSummary(
            request, timeout=settings.AI_SUMMARY_TIMEOUT_SECONDS
        )


class IncidentSummaryService:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._cache = OrderedDict()

    async def summarize(self, request):
        # as_of changes on every click; data and analogue revisions define the cache.
        version = pb.GenerateIncidentSummaryRequest()
        version.CopyFrom(request)
        version.ClearField("as_of")
        key = version.SerializeToString(deterministic=True)
        async with self._lock:
            cached = self._cache.get(key)
            if cached and cached[0] > time.monotonic():
                self._cache.move_to_end(key)
                return cached[1]
            result = await generate_incident_summary(request)
            allowed = {item.incident.id for item in request.related_incidents}
            used = [item.incident_id for item in result.related_incidents_used]
            if (result.incident_id != request.incident.id or not result.summary.strip()
                    or not result.HasField("generated_at")
                    or result.incident_updated_at != request.incident.updated_at
                    or len(used) != len(set(used)) or not set(used) <= allowed
                    or any(not item.contribution.strip() for item in result.related_incidents_used)):
                raise ValueError("Unexpected incident summary contract")
            response = IncidentSummary(
                incident_id=result.incident_id, summary=result.summary,
                related_incidents_used=[RelatedSummary(incident_id=item.incident_id, contribution=item.contribution)
                                        for item in result.related_incidents_used],
                limitations=list(result.limitations),
                generated_at=result.generated_at.ToDatetime(tzinfo=timezone.utc),
                incident_updated_at=result.incident_updated_at.ToDatetime(tzinfo=timezone.utc),
            )
            self._cache[key] = (time.monotonic() + 300, response)
            self._cache.move_to_end(key)
            while len(self._cache) > 128:
                self._cache.popitem(last=False)
            return response


incident_summary_service = IncidentSummaryService()
