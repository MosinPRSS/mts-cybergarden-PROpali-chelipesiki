"""On-demand LLM routing, cached by incident version and candidate profiles."""

import asyncio
import time
from collections import OrderedDict
from datetime import timezone

import grpc

from ai_proto.generate_pb2_grpc import IncidentSummaryServiceStub
from config import settings
from schemas.teams import RecommendedTeam, TeamFitCriteria, TeamRecommendation


async def recommend_incident_team(request):
    async with grpc.aio.insecure_channel(settings.AI_GRPC_TARGET) as channel:
        return await IncidentSummaryServiceStub(channel).RecommendIncidentTeam(
            request, timeout=settings.AI_SUMMARY_TIMEOUT_SECONDS)


def validate_recommendation(request, result):
    teams = {team.id: team for team in request.teams}
    criteria = {name: getattr(result.criteria, name) for name in
                ("product_service", "technical_skills", "responsibility")}
    expected = (2 * criteria["product_service"] + 2 * criteria["technical_skills"] + criteria["responsibility"] + 2) // 5
    if (result.incident_id != request.incident.id
            or result.incident_updated_at != request.incident.updated_at
            or not result.HasField("generated_at") or not result.HasField("incident_updated_at")
            or not result.HasField("criteria")
            or (result.team_id and result.team_id not in teams)
            or not result.reason.strip() or len(result.reason) > 120 or len(result.reason.split()) > 16
            or "\n" in result.reason or "\r" in result.reason
            or any(not 0 <= value <= 100 for value in criteria.values())
            or result.match_percent != expected
            or (not result.team_id and any(criteria.values()))):
        raise ValueError("Unexpected team recommendation contract")
    selected = teams.get(result.team_id)
    return TeamRecommendation(
        incident_id=result.incident_id,
        team=RecommendedTeam(id=selected.id, name=selected.name) if selected else None,
        match_percent=result.match_percent, reason=result.reason.strip(), criteria=TeamFitCriteria(**criteria),
        generated_at=result.generated_at.ToDatetime(tzinfo=timezone.utc),
        incident_updated_at=result.incident_updated_at.ToDatetime(tzinfo=timezone.utc))


class TeamRecommendationService:
    def __init__(self):
        self._cache = OrderedDict()
        self._inflight = {}

    async def recommend(self, request):
        version = type(request)()
        version.CopyFrom(request)
        version.ClearField("as_of")
        key = version.SerializeToString(deterministic=True)
        cached = self._cache.get(key)
        if cached and cached[0] > time.monotonic():
            self._cache.move_to_end(key)
            return cached[1]
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._generate(request, key))
            self._inflight[key] = task
            # Consume an error even if every HTTP caller disconnects during the RPC.
            task.add_done_callback(lambda done: None if done.cancelled() else done.exception())
        return await asyncio.shield(task)

    async def _generate(self, request, key):
        try:
            response = await self._fetch(request)
            self._cache[key] = (time.monotonic() + 300, response)
            self._cache.move_to_end(key)
            while len(self._cache) > 128:
                self._cache.popitem(last=False)
            return response
        finally:
            self._inflight.pop(key, None)

    async def _fetch(self, request):
        return validate_recommendation(request, await recommend_incident_team(request))


class TeamIncidentService(TeamRecommendationService):
    def __init__(self):
        super().__init__()
        self._slots = asyncio.Semaphore(2)

    async def _fetch(self, request):
        from ai_proto import generate_pb2 as pb
        async with self._slots:
            async with grpc.aio.insecure_channel(settings.AI_GRPC_TARGET) as channel:
                result = await IncidentSummaryServiceStub(channel).RecommendTeamIncidents(
                    request, timeout=settings.AI_SUMMARY_TIMEOUT_SECONDS)
        if len(result.recommendations) != len(request.incidents):
            raise ValueError("Incomplete recommendations")
        return [validate_recommendation(pb.RecommendIncidentTeamRequest(
            incident=incident, teams=[request.team], as_of=request.as_of), recommendation)
            for incident, recommendation in zip(request.incidents, result.recommendations, strict=True)]


team_recommendation_service = TeamRecommendationService()
team_incident_service = TeamIncidentService()
