import asyncio
import copy
import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import grpc
from sqlalchemy import create_engine, text

from ai_proto import generate_pb2 as pb
from core.db import get_db
from domain.incidents import COORDINATOR_TEAM, IncidentSource
from main import app
from models import Incident
from services.dashboard_summary import DashboardSummaryService, incident_snapshot, priority_query, summary_candidates
from tests.helpers import ASGIConnection, authorize_test_user

NOW = datetime(2026, 11, 21, 12, tzinfo=timezone.utc)


def make_incident(identifier="INC-1", *, minutes=10, priority=4, impact=4):
    record = copy.deepcopy(json.loads((Path(__file__).resolve().parents[1] / "fixtures/character_problems.json").read_text())[0])
    record.update(id=identifier, stateEnum="WorkInProgress", stateId=2, state="В работе",
                  priorityId=priority, impactId=impact, submitDate=(NOW - timedelta(hours=1)).isoformat(),
                  deadline=(NOW + timedelta(minutes=minutes)).isoformat() if minutes is not None else None)
    parsed = IncidentSource.model_validate(record)
    return Incident(**{name: getattr(parsed, name) for name in IncidentSource.model_fields},
                    updated_at=NOW, source_payload=record, tags=[])


class PrioritySQLTests(unittest.TestCase):
    def test_modes_partition_active_deadlines_and_keep_boundary_cases(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        with engine.begin() as db:
            db.execute(text("CREATE TABLE incidents (id TEXT, state_enum TEXT, priority_id INTEGER, deadline DATETIME, impact_id INTEGER, assigned_group_name TEXT, submit_date DATETIME)"))
            fixtures = [
                ("overdue", 4, -10, 2, "Team", "WorkInProgress"),
                ("soon-high", 4, 5, 4, "Team", "Assigned"),
                ("soon-low", 4, 5, 1, "Team", "Assigned"),
                ("boundary", 4, 30, 4, "Team", "Assigned"),
                ("later", 4, 31, 4, "Team", "Assigned"),
                ("unknown", 4, None, 4, "Team", "Assigned"),
                ("coordinator", 2, -20, 4, COORDINATOR_TEAM, "Assigned"),
                ("coordinator-later", 3, 5, 4, COORDINATOR_TEAM, "Assigned"),
                ("low-priority", 1, 5, 1, "Team", "Assigned"),
                ("future-impact-first", 1, 25, 4, "Team", "Assigned"),
                ("research", 4, 5, 4, COORDINATOR_TEAM, "Research"),
                ("resolved", 4, -50, 4, "Team", "Resolved"),
                ("closed", 4, -50, 4, "Team", "Closed"),
                ("zero", 3, 0, 4, "Team", "Assigned"),
                ("impact-first", 1, -1, 4, "Team", "Assigned"),
                ("priority-later", 4, -1, 3, "Team", "Assigned"),
                ("longer-first", 1, -5, 3, "Team", "Assigned"),
            ]
            for identifier, priority, minutes, impact, team, state in fixtures:
                db.execute(text("INSERT INTO incidents VALUES (:id, :state, :priority, :deadline, :impact, :team, :submitted)"), dict(
                    id=identifier, state=state, priority=priority, impact=impact, team=team,
                    deadline=(NOW + timedelta(minutes=minutes)).replace(tzinfo=None) if minutes is not None else None,
                    submitted=(NOW - timedelta(hours=1)).replace(tzinfo=None)))
            upcoming = db.scalars(priority_query(NOW).with_only_columns(Incident.id)).all()
            overdue = db.scalars(priority_query(NOW, "overdue").with_only_columns(Incident.id)).all()
            hour = db.scalars(priority_query(NOW, "upcoming", 60).with_only_columns(Incident.id)).all()
        self.assertEqual(upcoming, ["soon-high", "coordinator-later", "future-impact-first", "boundary", "soon-low", "low-priority"])
        self.assertEqual(overdue, ["coordinator", "impact-first", "zero", "longer-first", "priority-later", "overdue"])
        self.assertFalse(set(upcoming) & set(overdue))
        self.assertIn("later", hour)
        self.assertFalse(set(hour) & set(overdue))


def overview_response(request):
    selected = request.incidents if request.mode == pb.SUMMARY_MODE_OVERDUE else request.incidents[:3]
    response = pb.GenerateDashboardSummaryResponse(summary="Обзор", highlights=[
        pb.DashboardHighlight(incident_id=item.id, summary="Проверьте срок и ответственного") for item in selected])
    response.generated_at.FromDatetime(NOW)
    return response


class DashboardServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_windows_filter_boundaries_and_reach_provider_and_response(self):
        for minutes in (30, 60, 120, 360, 720, 1440):
            rows = [make_incident("boundary", minutes=minutes), make_incident("later", minutes=minutes + 1),
                    make_incident("expired", minutes=0), make_incident("soon", minutes=5, impact=1)]
            with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=overview_response)) as rpc:
                result = await DashboardSummaryService().summarize(rows, NOW, "upcoming", minutes)
            self.assertEqual([item.incident.id for item in result.highlights], ["boundary", "soon"])
            self.assertEqual(result.window_minutes, minutes)
            self.assertEqual(rpc.call_args.args[0].window_minutes, minutes)

    async def test_different_windows_have_separate_cache_even_when_candidates_match(self):
        service = DashboardSummaryService()
        rows = [make_incident()]
        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=overview_response)) as rpc:
            half_hour = await service.summarize(rows, NOW)
            hour = await service.summarize(rows, NOW, "upcoming", 60)
            cached_half_hour = await service.summarize(rows, NOW)
        self.assertEqual(rpc.await_count, 2)
        self.assertEqual(half_hour.window_minutes, 30)
        self.assertEqual(hour.window_minutes, 60)
        self.assertEqual(cached_half_hour, half_hour)

    async def test_upcoming_filters_far_critical_before_ranking_by_impact_and_deadline(self):
        rows = [make_incident("far-critical", minutes=5000, priority=4, impact=4),
                make_incident("medium-soon", minutes=5, priority=2, impact=2),
                make_incident("high-impact-later", minutes=25, priority=1, impact=4),
                make_incident("high-impact-sooner", minutes=15, priority=4, impact=4)]
        expected = ["high-impact-sooner", "high-impact-later", "medium-soon"]
        async def generate(request):
            self.assertEqual([item.id for item in request.incidents], expected)
            return overview_response(request)
        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=generate)):
            result = await DashboardSummaryService().summarize(rows, NOW)
        self.assertEqual([item.incident.id for item in result.highlights], expected)
        self.assertEqual(result.total_candidates, 3)

    async def test_overdue_rpc_and_results_follow_impact_then_overdue_duration(self):
        rows = [make_incident("old-low-impact", minutes=-200, impact=1),
                make_incident("recent-high-impact", minutes=-1, impact=4, priority=4),
                make_incident("older-high-impact", minutes=-10, impact=4, priority=1)]
        expected = ["older-high-impact", "recent-high-impact", "old-low-impact"]
        self.assertEqual([item.id for item in summary_candidates(rows, NOW, "overdue")], expected)
        async def generate(request):
            self.assertEqual([item.id for item in request.incidents], expected)
            return overview_response(request)
        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=generate)):
            result = await DashboardSummaryService().summarize(rows, NOW, "overdue")
        self.assertEqual(result.status, "ready")
        self.assertEqual([item.incident.id for item in result.highlights], expected)

    async def test_upcoming_context_is_bounded_but_statistics_cover_all_candidates(self):
        rows = [make_incident(f"INC-{i:02}") for i in range(25)]
        async def generate(request):
            self.assertEqual(len(request.incidents), 20)
            self.assertEqual(request.total_candidates, 25)
            self.assertEqual(request.statistics["critical"], 25)
            return overview_response(request)
        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=generate)):
            result = await DashboardSummaryService().summarize(rows, NOW)
        self.assertEqual(result.analyzed_count, 20)
        self.assertEqual(result.total_candidates, 25)
        self.assertEqual(len(result.highlights), 3)
        self.assertTrue(result.limitations)

    async def test_empty_or_ineligible_rows_do_not_call_provider(self):
        rows = [make_incident(minutes=-1), make_incident("zero", minutes=0),
                make_incident("later", minutes=31), make_incident("unknown", minutes=None)]
        research = make_incident("research")
        research.state_enum = "Research"
        rows.append(research)
        with patch("services.dashboard_summary.generate_overview", new_callable=AsyncMock) as generate:
            result = await DashboardSummaryService().summarize(rows, NOW)
        self.assertEqual(result.status, "empty")
        self.assertEqual(result.highlights, [])
        generate.assert_not_awaited()

    async def test_unavailable_keeps_every_overdue_record_with_explicit_fallback(self):
        rows = [make_incident(f"INC-{i:02}", minutes=-10) for i in range(27)]
        with patch("services.dashboard_summary.generate_overview", new_callable=AsyncMock, side_effect=grpc.RpcError):
            result = await DashboardSummaryService().summarize(rows, NOW, "overdue")
        self.assertEqual(result.status, "fallback")
        self.assertEqual(result.analyzed_count, 0)
        self.assertIsNone(result.generated_at)
        self.assertEqual(len(result.highlights), 27)
        self.assertTrue(all(not item.analyzed and item.reason == "overdue" for item in result.highlights))

    async def test_all_overdue_records_are_analyzed_in_bounded_batches_with_partial_failure(self):
        rows = [make_incident(f"INC-{i:02}", minutes=-10) for i in range(13)]
        running = 0
        maximum = 0
        async def generate(request):
            nonlocal running, maximum
            self.assertEqual(request.mode, pb.SUMMARY_MODE_OVERDUE)
            self.assertLessEqual(len(request.incidents), 5)
            self.assertEqual(request.total_candidates, 13)
            running += 1
            maximum = max(maximum, running)
            await asyncio.sleep(0)
            running -= 1
            if request.incidents[0].id == "INC-05":
                raise grpc.RpcError()
            return overview_response(request)
        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=generate)) as rpc:
            result = await DashboardSummaryService().summarize(rows, NOW, "overdue")
        self.assertEqual(rpc.await_count, 3)
        self.assertLessEqual(maximum, 2)
        self.assertEqual(result.status, "partial")
        self.assertEqual(result.analyzed_count, 8)
        self.assertEqual([item.incident.id for item in result.highlights], [item.id for item in rows])
        self.assertEqual(sum(item.analyzed for item in result.highlights), 8)
        self.assertTrue(result.limitations)

    async def test_successful_overdue_analysis_includes_every_record_beyond_twenty(self):
        rows = [make_incident(f"INC-{i:02}", minutes=-10) for i in range(27)]
        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=overview_response)) as rpc:
            result = await DashboardSummaryService().summarize(rows, NOW, "overdue")
        self.assertEqual(result.status, "ready")
        self.assertEqual(result.analyzed_count, 27)
        self.assertEqual(len(result.highlights), 27)
        self.assertTrue(all(item.analyzed for item in result.highlights))
        self.assertEqual(rpc.await_count, 6)

    async def test_mode_caches_coalesce_and_expiry_moves_incidents_between_views(self):
        service = DashboardSummaryService()
        soon = make_incident(minutes=1)
        expired = make_incident("expired", minutes=-1)
        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=overview_response)) as rpc:
            first, second = await asyncio.gather(service.summarize([soon, expired], NOW), service.summarize([soon, expired], NOW))
            self.assertEqual(first, second)
            self.assertEqual(rpc.await_count, 1)
            await service.summarize([soon, expired], NOW, "overdue")
            await service.summarize([soon, expired], NOW)
            self.assertEqual(rpc.await_count, 2)
            soon.updated_at += timedelta(seconds=1)
            await service.summarize([soon, expired], NOW)
            self.assertEqual(rpc.await_count, 3)
            empty = await service.summarize([soon, expired], NOW + timedelta(minutes=1))
            self.assertEqual(empty.status, "empty")
            all_overdue = await service.summarize([soon, expired], NOW + timedelta(minutes=1), "overdue")
            self.assertEqual(len(all_overdue.highlights), 2)
            self.assertEqual(rpc.await_count, 4)

    async def test_bad_model_ids_are_rejected(self):
        response = pb.GenerateDashboardSummaryResponse(summary="Обзор", highlights=[pb.DashboardHighlight(incident_id="invented", summary="Пояснение")])
        response.generated_at.FromDatetime(NOW)
        with patch("services.dashboard_summary.generate_overview", new_callable=AsyncMock, return_value=response):
            result = await DashboardSummaryService().summarize([make_incident()], NOW)
        self.assertEqual(result.status, "fallback")
        self.assertFalse(result.highlights[0].analyzed)

    async def test_snapshot_preserves_null_and_false(self):
        incident = make_incident(minutes=None)
        incident.is_need_up = False
        snapshot = incident_snapshot(incident)
        self.assertFalse(snapshot.HasField("deadline"))
        self.assertTrue(snapshot.HasField("is_need_up"))
        self.assertFalse(snapshot.is_need_up)

    async def test_static_summary_route_precedes_incident_id_and_releases_db(self):
        authorize_test_user(self)
        db = MagicMock()
        db.scalars = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        db.rollback = AsyncMock()
        async def database():
            return db
        app.dependency_overrides[get_db] = database
        self.addCleanup(app.dependency_overrides.pop, get_db)
        for mode, minutes in (("upcoming", 30), ("upcoming", 60), ("upcoming", 120),
                              ("upcoming", 360), ("upcoming", 720), ("upcoming", 1440), ("overdue", 1440)):
            async with ASGIConnection(f"/api/incidents/summary?mode={mode}&window_minutes={minutes}") as connection:
                status, _, body = await connection.response()
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["status"], "empty")
            self.assertEqual(json.loads(body)["mode"], mode)
            self.assertEqual(json.loads(body)["window_minutes"], 30 if mode == "overdue" else minutes)
        self.assertEqual(db.expunge_all.call_count, 7)
        self.assertEqual(db.rollback.await_count, 7)
        for query in ("mode=invalid", "window_minutes=31", "window_minutes=0", "window_minutes=1441", "window_minutes=invalid"):
            async with ASGIConnection(f"/api/incidents/summary?{query}") as connection:
                status, _, _ = await connection.response()
            self.assertEqual(status, 422)
