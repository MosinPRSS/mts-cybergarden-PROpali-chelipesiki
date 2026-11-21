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
from services.dashboard_summary import DashboardSummaryService, incident_snapshot, priority_query
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
    def test_sql_filters_and_orders_before_fetching(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        with engine.begin() as db:
            db.execute(text("CREATE TABLE incidents (id TEXT, state_enum TEXT, priority_id INTEGER, deadline DATETIME, impact_id INTEGER, assigned_group_name TEXT, submit_date DATETIME)"))
            fixtures = [
                ("overdue", 4, -10, 2, "Team", "WorkInProgress"),
                ("soon-high", 4, 5, 4, "Team", "Assigned"),
                ("soon-low", 4, 5, 1, "Team", "Assigned"),
                ("boundary", 4, 30, 4, "Team", "Assigned"),
                ("later", 4, 60, 4, "Team", "Assigned"),
                ("unknown", 4, None, 4, "Team", "Assigned"),
                ("coordinator", 2, -20, 4, COORDINATOR_TEAM, "Assigned"),
                ("coordinator-later", 3, 5, 4, COORDINATOR_TEAM, "Assigned"),
                ("research", 4, -50, 4, COORDINATOR_TEAM, "Research"),
                ("resolved", 4, -50, 4, "Team", "Resolved"),
                ("closed", 4, -50, 4, "Team", "Closed"),
                ("other", 3, 0, 4, "Team", "Assigned"),
            ]
            for identifier, priority, minutes, impact, team, state in fixtures:
                db.execute(text("INSERT INTO incidents VALUES (:id, :state, :priority, :deadline, :impact, :team, :submitted)"), dict(
                    id=identifier, state=state, priority=priority, impact=impact, team=team,
                    deadline=(NOW + timedelta(minutes=minutes)).replace(tzinfo=None) if minutes is not None else None,
                    submitted=(NOW - timedelta(hours=1)).replace(tzinfo=None)))
            ids = db.scalars(priority_query(NOW).with_only_columns(Incident.id)).all()
        self.assertEqual(ids, ["overdue", "soon-high", "soon-low", "boundary", "later", "unknown", "coordinator", "coordinator-later"])


class DashboardServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_does_not_call_provider(self):
        with patch("services.dashboard_summary.generate_overview", new_callable=AsyncMock) as generate:
            result = await DashboardSummaryService().summarize([], NOW)
        self.assertEqual(result.status, "empty")
        generate.assert_not_awaited()

    async def test_unavailable_keeps_priority_queue(self):
        rows = [make_incident(), make_incident("INC-2", minutes=None)]
        with patch("services.dashboard_summary.generate_overview", new_callable=AsyncMock, side_effect=grpc.RpcError):
            result = await DashboardSummaryService().summarize(rows, NOW)
        self.assertEqual(result.status, "fallback")
        self.assertEqual(result.analyzed_count, 0)
        self.assertIsNone(result.generated_at)
        self.assertEqual([item.incident.id for item in result.highlights], ["INC-1", "INC-2"])
        self.assertEqual([item.reason for item in result.highlights], ["critical_urgent", "critical"])

    async def test_success_cache_coalesces_and_invalidates_on_update_and_boundary(self):
        incident = make_incident(minutes=30)
        response = pb.GenerateDashboardSummaryResponse(summary="Обзор", highlights=[pb.DashboardHighlight(incident_id=incident.id, summary="Пояснение")])
        response.generated_at.FromDatetime(NOW)
        service = DashboardSummaryService()
        with patch("services.dashboard_summary.generate_overview", new_callable=AsyncMock, return_value=response) as generate:
            first, second = await asyncio.gather(service.summarize([incident], NOW), service.summarize([incident], NOW))
            self.assertEqual(first.status, "ready")
            self.assertEqual(first, second)
            self.assertEqual(generate.await_count, 1)
            await service.summarize([incident], NOW + timedelta(seconds=1))
            self.assertEqual(generate.await_count, 2)
            incident.updated_at += timedelta(seconds=1)
            await service.summarize([incident], NOW + timedelta(seconds=2))
            self.assertEqual(generate.await_count, 3)

    async def test_bad_model_ids_are_rejected(self):
        response = pb.GenerateDashboardSummaryResponse(summary="Обзор", highlights=[pb.DashboardHighlight(incident_id="invented", summary="Пояснение")])
        response.generated_at.FromDatetime(NOW)
        with patch("services.dashboard_summary.generate_overview", new_callable=AsyncMock, return_value=response):
            result = await DashboardSummaryService().summarize([make_incident()], NOW)
        self.assertEqual(result.status, "fallback")

    async def test_snapshot_preserves_null_and_false(self):
        incident = make_incident(minutes=None)
        incident.is_need_up = False
        snapshot = incident_snapshot(incident)
        self.assertFalse(snapshot.HasField("deadline"))
        self.assertTrue(snapshot.HasField("is_need_up"))
        self.assertFalse(snapshot.is_need_up)

    async def test_static_summary_route_precedes_incident_id_and_releases_db(self):
        authorize_test_user(self)
        from core.auth import get_current_session
        authorized_session = app.dependency_overrides[get_current_session]()

        async def current_session():
            return authorized_session

        app.dependency_overrides[get_current_session] = current_session
        db = MagicMock()
        db.scalars = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        db.rollback = AsyncMock()
        async def database():
            return db

        app.dependency_overrides[get_db] = database
        self.addCleanup(app.dependency_overrides.pop, get_db)
        async with ASGIConnection("/api/incidents/summary") as connection:
            status, _, body = await connection.response()
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["status"], "empty")
        db.expunge_all.assert_called_once()
        db.rollback.assert_awaited_once()
