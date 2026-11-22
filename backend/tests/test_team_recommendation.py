import asyncio
import json
import unittest
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import grpc
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from ai_proto import generate_pb2 as pb, generate_pb2_grpc as rpc
from config import settings
from core.db import get_db
from domain.incidents import IncidentState
from main import app
from schemas.teams import TeamRecommendationRequest
from services.dashboard_summary import incident_snapshot
from services.team_recommendation import TeamRecommendationService
from tests.helpers import ASGIConnection, authorize_test_user
from tests.test_dashboard_summary import make_incident, NOW

CANDIDATES = [{"id": "platform", "name": "Digital Platform", "domain": "API",
               "description": "Сопровождение CDN и API", "services": ["CDN"], "skills": ["CDN"]}]


def routing_request():
    request = pb.RecommendIncidentTeamRequest(incident=incident_snapshot(make_incident()),
                                            teams=[pb.TeamCandidate(**team) for team in CANDIDATES])
    request.as_of.FromDatetime(NOW)
    return request


def routing_response(request):
    response = pb.RecommendIncidentTeamResponse(incident_id=request.incident.id, team_id="platform", match_percent=86,
        reason="Команда отвечает за CDN и API.",
        criteria=pb.TeamFitCriteria(product_service=90, technical_skills=85, responsibility=80),
        incident_updated_at=request.incident.updated_at)
    response.generated_at.FromDatetime(NOW)
    return response


class TeamRequestTests(unittest.TestCase):
    def test_candidate_profiles_are_bounded_unique_and_execution_only(self):
        self.assertEqual(TeamRecommendationRequest(teams=CANDIDATES).teams[0].id, "platform")
        for teams in ([], CANDIDATES * 2, [{**CANDIDATES[0], "id": "coordinators"}],
                      [{**CANDIDATES[0], "skills": []}], [{**CANDIDATES[0], "description": "x" * 601}]):
            with self.subTest(teams=teams), self.assertRaises(ValidationError):
                TeamRecommendationRequest(teams=teams)


class TeamRecommendationTests(unittest.IsolatedAsyncioTestCase):
    async def test_abstention_returns_no_team_and_no_invented_percentage(self):
        request = routing_request()
        response = routing_response(request)
        response.team_id = ""
        response.match_percent = 0
        response.criteria.CopyFrom(pb.TeamFitCriteria())
        response.reason = "Недостаточно данных для выбора команды."
        with patch("services.team_recommendation.recommend_incident_team", new=AsyncMock(return_value=response)):
            result = await TeamRecommendationService().recommend(request)
        self.assertIsNone(result.team)
        self.assertEqual(result.match_percent, 0)

    async def test_cache_coalesces_and_tracks_incident_and_catalog_versions(self):
        request = routing_request()
        service = TeamRecommendationService()
        with patch("services.team_recommendation.recommend_incident_team", new=AsyncMock(side_effect=routing_response)) as provider:
            first, second = await asyncio.gather(service.recommend(request), service.recommend(request))
            self.assertEqual(first, second)
            request.as_of.FromDatetime(NOW + timedelta(seconds=30))
            await service.recommend(request)
            self.assertEqual(provider.await_count, 1)
            request.teams[0].description += " и сетей"
            await service.recommend(request)
            request.incident.updated_at.FromDatetime(NOW + timedelta(seconds=1))
            await service.recommend(request)
            self.assertEqual(provider.await_count, 3)
            self.assertFalse(service._inflight)

    async def test_different_incidents_do_not_wait_for_a_global_lock(self):
        service, release, started = TeamRecommendationService(), asyncio.Event(), asyncio.Event()
        count = 0
        async def generate(request):
            nonlocal count
            count += 1
            if count == 2:
                started.set()
            await release.wait()
            return routing_response(request)
        first, second = routing_request(), routing_request()
        second.incident.id = "other"
        with patch("services.team_recommendation.recommend_incident_team", new=generate):
            tasks = [asyncio.create_task(service.recommend(request)) for request in (first, second)]
            try:
                await asyncio.wait_for(started.wait(), timeout=1)
            finally:
                release.set()
                await asyncio.gather(*tasks)

    async def test_invalid_scores_unknown_teams_and_stale_versions_are_not_cached(self):
        request = routing_request()
        for mutate in (lambda result: setattr(result, "team_id", "invented"),
                       lambda result: setattr(result, "match_percent", 99),
                       lambda result: result.ClearField("incident_updated_at"),
                       lambda result: setattr(result, "reason", "x" * 121)):
            response = routing_response(request)
            mutate(response)
            service = TeamRecommendationService()
            with patch("services.team_recommendation.recommend_incident_team", new=AsyncMock(return_value=response)) as provider:
                for _ in range(2):
                    with self.assertRaises(ValueError):
                        await service.recommend(request)
                self.assertEqual(provider.await_count, 2)

    async def test_backend_client_uses_the_new_rpc_over_a_real_connection(self):
        class Server(rpc.IncidentSummaryServiceServicer):
            async def RecommendIncidentTeam(self, request, context):
                return routing_response(request)
        server = grpc.aio.server()
        rpc.add_IncidentSummaryServiceServicer_to_server(Server(), server)
        port = server.add_insecure_port("127.0.0.1:0")
        await server.start()
        try:
            with patch.object(settings, "AI_GRPC_TARGET", f"127.0.0.1:{port}"):
                result = await TeamRecommendationService().recommend(routing_request())
            self.assertEqual(result.team.name, "Digital Platform")
            self.assertEqual(result.match_percent, 86)
        finally:
            await server.stop(0)


class TeamRecommendationRoutes(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        authorize_test_user(self)
        self.target = make_incident()
        self.db = AsyncMock(spec=AsyncSession)
        self.db.get.return_value = self.target
        self.db.scalar.return_value = self.target.updated_at
        async def database():
            yield self.db
        previous = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = database
        def restore():
            if previous is None:
                app.dependency_overrides.pop(get_db, None)
            else:
                app.dependency_overrides[get_db] = previous
        self.addCleanup(restore)

    async def request(self, teams=CANDIDATES):
        async with ASGIConnection(f"/api/incidents/{self.target.id}/recommend-team", method="POST",
                headers=[(b"content-type", b"application/json")], body=json.dumps({"teams": teams}).encode()) as client:
            status, _, body = await client.response()
        return status, json.loads(body)

    async def test_route_uses_database_incident_and_releases_connection_before_ai(self):
        async def generate(request):
            self.db.rollback.assert_awaited_once()
            self.db.expunge_all.assert_called_once()
            self.assertEqual(request.incident.header, self.target.header)
            self.assertEqual(request.teams[0].skills, ["CDN"])
            return routing_response(request)
        with patch("services.team_recommendation.recommend_incident_team", new=generate), \
             patch("routers.summary.team_recommendation_service", new=TeamRecommendationService()):
            status, response = await self.request()
        self.assertEqual(status, 200)
        self.assertEqual(response["team"], {"id": "platform", "name": "Digital Platform"})
        self.assertEqual(response["match_percent"], 86)
        self.db.commit.assert_not_awaited()

    async def test_changes_during_ai_analysis_return_conflict(self):
        self.db.scalar.return_value = self.target.updated_at + timedelta(seconds=1)
        with patch("services.team_recommendation.recommend_incident_team", new=AsyncMock(side_effect=routing_response)), \
             patch("routers.summary.team_recommendation_service", new=TeamRecommendationService()):
            self.assertEqual((await self.request())[0], 409)

    async def test_provider_errors_return_unavailable_without_fake_recommendations(self):
        with patch("services.team_recommendation.recommend_incident_team", new=AsyncMock(side_effect=grpc.RpcError)), \
             patch("routers.summary.team_recommendation_service", new=TeamRecommendationService()):
            status, response = await self.request()
        self.assertEqual(status, 503)
        self.assertNotIn("team", response)

    async def test_missing_completed_and_invalid_requests_do_not_call_ai(self):
        with patch("services.team_recommendation.recommend_incident_team", new=AsyncMock()) as provider:
            self.db.get.return_value = None
            self.assertEqual((await self.request())[0], 404)
            self.db.get.return_value = self.target
            self.target.state_enum = IncidentState.RESOLVED
            self.assertEqual((await self.request())[0], 409)
            self.assertEqual((await self.request([]))[0], 422)
            provider.assert_not_awaited()

    async def test_confirmed_team_cannot_be_regenerated(self):
        self.target.team_selected_with_ai = True
        with patch("routers.summary.team_recommendation_service.recommend", new=AsyncMock()) as provider:
            status, response = await self.request()
        self.assertEqual(status, 409)
        self.assertEqual(response["detail"], "Команда уже выбрана с помощью ИИ.")
        provider.assert_not_awaited()

class ReverseRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_rpc_and_backend_validation_reject_missing_incidents(self):
        from services.team_recommendation import TeamIncidentService
        class Server(rpc.IncidentSummaryServiceServicer):
            async def RecommendTeamIncidents(self, request, context):
                return pb.RecommendTeamIncidentsResponse(recommendations=[routing_response(
                    pb.RecommendIncidentTeamRequest(incident=item, teams=[request.team], as_of=request.as_of))
                    for item in request.incidents])
        request = pb.RecommendTeamIncidentsRequest(team=pb.TeamCandidate(**CANDIDATES[0]),
            incidents=[routing_request().incident], as_of=routing_request().as_of)
        server = grpc.aio.server()
        rpc.add_IncidentSummaryServiceServicer_to_server(Server(), server)
        port = server.add_insecure_port("127.0.0.1:0")
        await server.start()
        try:
            with patch.object(settings, "AI_GRPC_TARGET", f"127.0.0.1:{port}"):
                result = await TeamIncidentService().recommend(request)
            self.assertEqual(result[0].team.name, "Digital Platform")
            self.assertEqual(result[0].match_percent, 86)
        finally:
            await server.stop(0)

class TeamIncidentSnapshotRequestTests(unittest.TestCase):
    def test_snapshot_ids_are_optional_unique_and_bounded(self):
        from schemas.teams import TeamIncidentRecommendationRequest
        self.assertIsNone(TeamIncidentRecommendationRequest(**CANDIDATES[0]).incident_ids)
        self.assertEqual(TeamIncidentRecommendationRequest(**CANDIDATES[0], incident_ids=[]).incident_ids, [])
        self.assertEqual(TeamIncidentRecommendationRequest(**CANDIDATES[0], incident_ids=["INC-A", "INC-B"]).incident_ids, ["INC-A", "INC-B"])
        for ids in (["INC-A", "INC-A"], [""], ["x" * 129], [f"INC-{index}" for index in range(10001)]):
            with self.subTest(count=len(ids)), self.assertRaises(ValidationError):
                TeamIncidentRecommendationRequest(**CANDIDATES[0], incident_ids=ids)
