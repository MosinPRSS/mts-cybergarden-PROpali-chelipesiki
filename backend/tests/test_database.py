import asyncio
import copy
import json
import os
import unittest
from datetime import datetime, timedelta, timezone

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from config import PROJECT_DIR
from core.db import Base, get_db
from main import app
from models import Incident, IncidentState, LegacyIncident, User
from scripts.seed import FIXTURE_PATH, seed_data
from services.incidents import import_incidents
from tests.helpers import ASGIConnection, authorize_test_user


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "Run python -m scripts.test_database for PostgreSQL tests")
class PostgreSQLTests(unittest.IsolatedAsyncioTestCase):
    async def test_completion_undo_restores_previous_state_and_records_both_actions(self):
        from models import IncidentAction
        await self.seed()
        identifier = self.records[0]["id"]
        path = f"/api/incidents/{identifier}"
        before = (await self.auth_request(path))[2]
        source = (await self.auth_request(path + "/source"))[2]
        status, _, resolved = await self.auth_request(path + "/resolve", method="POST")
        self.assertEqual(status, 200)
        self.assertIsNotNone(resolved["undo_resolve_until"])
        _, _, repeated = await self.auth_request(path + "/resolve", method="POST")
        self.assertEqual(repeated["updated"], resolved["updated"])
        self.assertIsNone(repeated["undo_resolve_until"])
        status, _, restored = await self.auth_request(path + "/undo-resolve", method="POST",
            data={"updated_at": resolved["updated"]})
        self.assertEqual(status, 200)
        for key in ("stateEnum", "stateId", "state", "completionDate", "team", "assignee"):
            self.assertEqual(restored[key], before[key])
        self.assertEqual((await self.auth_request(path + "/source"))[2], source)
        self.assertEqual((await self.auth_request(path + "/undo-resolve", method="POST",
            data={"updated_at": resolved["updated"]}))[0], 409)
        async with self.sessions() as db:
            actions = (await db.scalars(select(IncidentAction).where(IncidentAction.incident_id == identifier)
                .order_by(IncidentAction.occurred_at))).all()
            self.assertEqual([item.action for item in actions], ["resolve", "undo_resolve"])
            self.assertTrue(all(item.actor_id == 1 and item.actor_login == "test" for item in actions))

    async def test_research_undo_remains_available_and_preserves_new_assignments(self):
        from models import IncidentAction
        await self.seed()
        path = f'/api/incidents/{self.records[0]["id"]}'
        _, _, resolved = await self.auth_request(path + "/resolve", method="POST")
        async with self.sessions.begin() as db:
            action = await db.scalar(select(IncidentAction))
            action.occurred_at -= timedelta(days=3)
        await self.auth_request(path + "/assign", method="POST", data={"team": "Новая команда"})
        self.assertEqual((await self.auth_request(path + "/undo-resolve", method="POST",
            data={"updated_at": resolved["updated"]}))[0], 409)
        current = (await self.auth_request(path))[2]
        status, _, restored = await self.auth_request(path + "/undo-resolve", method="POST", data={"updated_at": current["updated"]})
        self.assertEqual(status, 200)
        self.assertEqual(restored["team"], "Новая команда")
        self.assertIsNone(restored["resolved_by"])
        self.assertEqual(restored["status"], self.records[0]["stateEnum"])

    async def test_research_close_keeps_resolution_and_closure_authors(self):
        from models import IncidentAction
        await self.seed()
        path = f'/api/incidents/{self.records[0]["id"]}'
        before = (await self.auth_request(path))[2]
        self.assertEqual((await self.auth_request(path + "/close", method="POST", data={"updated_at": before["updated"]}))[0], 409)
        _, _, research = await self.auth_request(path + "/resolve", method="POST")
        self.assertEqual(research["status"], "Research")
        self.assertEqual(research["resolved_by"], "User Test")
        self.assertIn("Исследование ситуации", research["groups"])
        from core.auth import get_current_session
        current_session = await app.dependency_overrides[get_current_session]()
        current_session.user.name = "Другой"
        status, _, closed = await self.auth_request(path + "/close", method="POST", data={"updated_at": research["updated"]})
        self.assertEqual(status, 200)
        self.assertEqual(closed["status"], "Closed")
        self.assertEqual(closed["resolved_by"], "User Test")
        self.assertEqual(closed["closed_by"], "User Другой")
        self.assertEqual(closed["completionDate"], research["completionDate"])
        self.assertIsNotNone(closed["closed_at"])
        reloaded = (await self.auth_request(path))[2]
        self.assertEqual(reloaded["closed_by"], "User Другой")
        self.assertEqual((await self.auth_request(path + "/undo-resolve", method="POST", data={"updated_at": closed["updated"]}))[0], 409)
        async with self.sessions() as db:
            self.assertEqual([item.action for item in (await db.scalars(select(IncidentAction).order_by(IncidentAction.occurred_at))).all()], ["resolve", "close"])

    async def test_concurrent_undo_requests_only_restore_once(self):
        await self.seed()
        path = f'/api/incidents/{self.records[0]["id"]}'
        _, _, resolved = await self.auth_request(path + "/resolve", method="POST")
        responses = await asyncio.gather(*(self.auth_request(path + "/undo-resolve", method="POST",
            data={"updated_at": resolved["updated"]}) for _ in range(2)))
        self.assertEqual(sorted(item[0] for item in responses), [200, 409])

    async def test_team_incident_selection_reads_database_and_batches_all_eligible_incidents(self):
        from unittest.mock import patch
        from ai_proto import generate_pb2 as pb
        from tests.test_team_recommendation import CANDIDATES, routing_response
        from services.team_recommendation import validate_recommendation

        await self.seed()
        await self.auth_request(f'/api/incidents/{self.records[0]["id"]}/assign', method="POST",
            data={"team": "Digital Platform"})
        await self.auth_request(f'/api/incidents/{self.records[1]["id"]}/assign', method="POST",
            data={"team": "Other", "team_selected_with_ai": True})
        async with self.sessions() as db:
            expected = set((await db.scalars(select(Incident.id).where(
                Incident.state_enum.in_([IncidentState.ASSIGNED, IncidentState.WORK_IN_PROGRESS, IncidentState.RESEARCH]),
                Incident.assigned_group_name != "Digital Platform", Incident.team_selected_with_ai.is_(False)))).all())
        seen = []
        async def generate(request):
            self.assertLessEqual(len(request.incidents), 5)
            seen.extend(item.id for item in request.incidents)
            return [validate_recommendation(child, routing_response(child)) for child in [
                pb.RecommendIncidentTeamRequest(incident=item, teams=[request.team], as_of=request.as_of)
                for item in request.incidents]]
        with patch("routers.summary.team_incident_service.recommend", new=generate):
            status, _, result = await self.auth_request("/api/incidents/recommend-for-team", method="POST", data=CANDIDATES[0])
        self.assertEqual(status, 200)
        self.assertEqual(set(seen), expected)
        self.assertEqual({item["incident_id"] for item in result}, expected)
        self.assertTrue(all(item["match_percent"] == 86 for item in result))

    async def test_confirmed_ai_team_survives_reload_and_blocks_regeneration_until_reassigned(self):
        from unittest.mock import AsyncMock, patch
        from tests.test_team_recommendation import CANDIDATES

        await self.seed()
        identifier = self.records[0]["id"]
        path = f"/api/incidents/{identifier}"
        status, _, saved = await self.auth_request(path + "/assign", method="POST",
            data={"team": "Digital Platform", "team_selected_with_ai": True})
        self.assertEqual(status, 200)
        self.assertTrue(saved["team_selected_with_ai"])
        self.assertTrue((await self.auth_request(path))[2]["team_selected_with_ai"])
        with patch("routers.summary.team_recommendation_service.recommend", new=AsyncMock()) as provider:
            status, _, error = await self.auth_request(path + "/recommend-team", method="POST", data={"teams": CANDIDATES})
        self.assertEqual(status, 409)
        self.assertEqual(error["detail"], "Команда уже выбрана с помощью ИИ.")
        provider.assert_not_awaited()

        # A source update with the same team retains the confirmation.
        raw = (await self.auth_request(path + "/source"))[2]
        self.assertNotIn("team_selected_with_ai", raw)
        raw["header"] += " — уточнение"
        async with self.sessions.begin() as db:
            await import_incidents(db, [raw])
        await self.seed()
        self.assertTrue((await self.auth_request(path))[2]["team_selected_with_ai"])

        # Manual selection clears the marker, including confirmation of the same team.
        status, _, saved = await self.auth_request(path + "/assign", method="POST", data={"team": "Digital Platform"})
        self.assertEqual(status, 200)
        self.assertFalse(saved["team_selected_with_ai"])
        await self.auth_request(path + "/assign", method="POST",
            data={"team": "Digital Platform", "team_selected_with_ai": True})
        raw = (await self.auth_request(path + "/source"))[2]
        raw["assignedGroupName"] = "Другая команда из ITSM"
        async with self.sessions.begin() as db:
            await import_incidents(db, [raw])
        self.assertFalse((await self.auth_request(path))[2]["team_selected_with_ai"])

    async def test_ai_selection_migration_preserves_existing_incidents(self):
        await self.seed()
        await self.migrate("downgrade", "0006")
        await self.migrate("upgrade", "head")
        async with self.sessions() as db:
            incidents = (await db.scalars(select(Incident))).all()
            self.assertEqual(len(incidents), len(self.retained_records))
            self.assertTrue(all(item.team_selected_with_ai is False for item in incidents))

    async def test_team_recommendation_uses_current_database_version_without_assigning(self):
        from unittest.mock import AsyncMock, patch
        from services.team_recommendation import TeamRecommendationService
        from tests.test_team_recommendation import CANDIDATES, routing_response

        await self.seed()
        identifier = self.records[0]["id"]
        path = f"/api/incidents/{identifier}/recommend-team"

        async def changed_during_analysis(request):
            self.assertEqual(request.incident.header, self.records[0]["header"])
            await self.auth_request(f"/api/incidents/{identifier}/assign", method="POST", data={"team": "Исполнители"})
            return routing_response(request)

        with patch("services.team_recommendation.recommend_incident_team", new=changed_during_analysis), \
             patch("routers.summary.team_recommendation_service", new=TeamRecommendationService()):
            status, _, _ = await self.auth_request(path, method="POST", data={"teams": CANDIDATES})
        self.assertEqual(status, 409)

        with patch("services.team_recommendation.recommend_incident_team", new=AsyncMock(side_effect=routing_response)), \
             patch("routers.summary.team_recommendation_service", new=TeamRecommendationService()):
            status, _, result = await self.auth_request(path, method="POST", data={"teams": CANDIDATES})
        self.assertEqual(status, 200)
        self.assertEqual(result["team"]["name"], "Digital Platform")
        self.assertEqual(result["match_percent"], 86)
        async with self.sessions() as db:
            self.assertEqual((await db.get(Incident, identifier)).assigned_group_name, "Исполнители")

    async def assert_serialized_actions(self, first_path, second_path, *, first_data=None,
                                        second_data=None, expected_state="Research", expected_team="Исполнители"):
        from unittest.mock import patch
        from sqlalchemy.ext.asyncio import AsyncSession

        await self.seed()
        before_commit = asyncio.Event()
        release = asyncio.Event()
        original_commit = AsyncSession.commit
        first_commit = True

        async def paused_commit(db):
            nonlocal first_commit
            if first_commit:
                first_commit = False
                before_commit.set()
                await release.wait()
            await original_commit(db)

        with patch.object(AsyncSession, "commit", paused_commit):
            first = asyncio.create_task(self.auth_request(first_path, method="POST", data=first_data))
            second = None
            try:
                await asyncio.wait_for(before_commit.wait(), timeout=3)
                second = asyncio.create_task(self.auth_request(second_path, method="POST", data=second_data))
                blocked = False
                for _ in range(100):
                    async with self.engine.connect() as connection:
                        blocked = await connection.scalar(text("""
                            SELECT EXISTS (
                                SELECT 1 FROM pg_stat_activity
                                WHERE datname = current_database() AND wait_event_type = 'Lock'
                            )
                        """))
                    if blocked:
                        break
                    await asyncio.sleep(0.01)
                self.assertTrue(blocked, "Second writer must wait on a real PostgreSQL row lock")
                self.assertFalse(second.done())
            finally:
                release.set()
                results = await asyncio.wait_for(asyncio.gather(
                    *[task for task in (first, second) if task is not None], return_exceptions=True
                ), timeout=5)
            for result in results:
                if isinstance(result, BaseException):
                    raise result
                self.assertIn(result[0], (200, 201))

        async with self.sessions() as db:
            incident = await db.get(Incident, self.records[0]["id"])
            self.assertEqual(incident.state_enum.value, expected_state)
            self.assertEqual(incident.source_payload["stateEnum"], expected_state)
            self.assertEqual(incident.assigned_group_name, expected_team)
            self.assertEqual(incident.source_payload["assignedGroupName"], expected_team)
            completion = incident.completion_date.isoformat() if incident.completion_date else None
            self.assertEqual(incident.source_payload["completionDate"], completion)

    async def test_assignment_waits_for_resolution_and_preserves_both_changes(self):
        identifier = self.records[0]["id"]
        await self.assert_serialized_actions(
            f"/api/incidents/{identifier}/resolve", f"/api/incidents/{identifier}/assign",
            second_data={"team": "Исполнители"})

    async def test_resolution_waits_for_assignment_and_preserves_both_changes(self):
        identifier = self.records[0]["id"]
        await self.assert_serialized_actions(
            f"/api/incidents/{identifier}/assign", f"/api/incidents/{identifier}/resolve",
            first_data={"team": "Исполнители"})

    async def test_source_import_waits_for_writer_before_comparing_payloads(self):
        identifier = self.records[0]["id"]
        await self.assert_serialized_actions(
            f"/api/incidents/{identifier}/resolve", "/api/incidents", second_data=self.records[0],
            expected_state=self.records[0]["stateEnum"], expected_team=self.records[0]["assignedGroupName"])

    async def test_startup_seed_preserves_resolution_assignment_and_record_version(self):
        await self.seed()
        identifier = self.records[0]["id"]
        await self.auth_request(f"/api/incidents/{identifier}/assign", method="POST", data={"team": "Исполнители"})
        await self.auth_request(f"/api/incidents/{identifier}/resolve", method="POST")
        async with self.sessions() as db:
            before = (await db.get(Incident, identifier)).to_dict()
        self.assertEqual(await self.seed(), {"incidents_created": 0, "incidents_updated": 0, "incidents_unchanged": 44})
        async with self.sessions() as db:
            after = (await db.get(Incident, identifier)).to_dict()
        self.assertEqual(after, before)

    async def test_explicit_seed_update_can_refresh_existing_source_data(self):
        await self.seed()
        identifier = self.records[0]["id"]
        await self.auth_request(f"/api/incidents/{identifier}/resolve", method="POST")
        async with self.sessions.begin() as db:
            result = await seed_data(db, update_existing=True)
        self.assertEqual(result["incidents_updated"], 1)
        async with self.sessions() as db:
            incident = await db.get(Incident, identifier)
            self.assertEqual(incident.state_enum.value, self.records[0]["stateEnum"])
            self.assertEqual(incident.source_payload, self.records[0])

    async def test_original_post_updates_groups_broadcasts_and_preserves_raw_payload(self):
        from core.sse_manager import sse_manager
        raw = copy.deepcopy(self.records[0])
        raw["futureField"] = {"keep": True}
        async with sse_manager.subscribe() as subscription:
            status, _, created = await self.auth_request("/api/incidents", method="POST", data=raw)
            self.assertEqual(status, 201)
            self.assertTrue(created["created"])
            self.assertEqual(created["sseNotified"], 1)
            snapshot = json.loads((await anext(subscription.events())).raw_data)
            self.assertEqual(snapshot[0]["groups"], ["На координаторах"])
            status, _, repeated = await self.auth_request("/api/incidents", method="POST", data=raw)
            self.assertEqual(status, 201)
            self.assertFalse(repeated["created"])
            self.assertEqual(repeated["sseNotified"], 0)
            self.assertTrue(subscription.queue.empty())
            raw.update(priorityId=4, priority="Наивысший")
            await self.auth_request("/api/incidents", method="POST", data=raw)
            snapshot = json.loads((await anext(subscription.events())).raw_data)
            self.assertEqual(snapshot[0]["groups"], ["Критические", "На координаторах"])
            status, _, original = await self.auth_request(f'/api/incidents/{raw["id"]}/source')
            self.assertEqual(original, raw)
            status, _, assigned = await self.auth_request(f'/api/incidents/{raw["id"]}/assign', method="POST", data={"team": "Исполнители"})
            self.assertEqual(status, 200)
            self.assertEqual(assigned["groups"], ["Критические"])
            status, _, resolved = await self.auth_request(f'/api/incidents/{raw["id"]}/resolve', method="POST")
            self.assertEqual(status, 200)
            self.assertEqual(resolved["groups"], ["Исследование ситуации"])
            self.assertEqual(resolved["status"], "Research")

    async def test_single_summary_api_rejects_stale_results_and_handles_provider_failure(self):
        from unittest.mock import AsyncMock, patch
        import grpc
        from ai_proto import generate_pb2 as pb
        from services.incident_summary import IncidentSummaryService

        await self.seed()
        target_id = self.records[0]["id"]
        changed_context = None

        async def generate(request):
            nonlocal changed_context
            self.assertLessEqual(len(request.related_incidents), 5)
            response = pb.GenerateIncidentSummaryResponse(incident_id=target_id, summary="Ошибка авторизации.", next_step="Уточните ход восстановления.",
                incident_updated_at=request.incident.updated_at)
            response.generated_at.FromDatetime(datetime.now(timezone.utc))
            if changed_context is not None:
                async with self.sessions.begin() as session:
                    incident = await session.get(Incident, changed_context)
                    incident.header = "Обновлён во время анализа"
                    incident.updated_at = datetime.now(timezone.utc)
            return response

        with patch("services.incident_summary.generate_incident_summary", new=AsyncMock(side_effect=generate)):
            with patch("routers.summary.incident_summary_service", new=IncidentSummaryService()):
                status, _, result = await self.auth_request(f"/api/incidents/{target_id}/summary")
            self.assertEqual(status, 200)
            self.assertEqual(result["incident_id"], target_id)
            changed_context = target_id
            with patch("routers.summary.incident_summary_service", new=IncidentSummaryService()):
                status, _, _ = await self.auth_request(f"/api/incidents/{target_id}/summary")
            self.assertEqual(status, 409)
        with patch("services.incident_summary.generate_incident_summary", new=AsyncMock(side_effect=grpc.RpcError)):
            with patch("routers.summary.incident_summary_service", new=IncidentSummaryService()):
                status, _, _ = await self.auth_request(f"/api/incidents/{target_id}/summary")
            self.assertEqual(status, 503)
        status, _, _ = await self.auth_request("/api/incidents/missing/summary")
        self.assertEqual(status, 404)

    async def test_dashboard_summary_uses_sql_priority_and_live_api(self):
        from unittest.mock import AsyncMock, patch
        from ai_proto import generate_pb2 as pb
        from domain.incidents import COORDINATOR_TEAM
        from services.dashboard_summary import priority_query
        from tests.test_dashboard_summary import make_incident, NOW

        as_of = datetime.now(timezone.utc)
        urgent = make_incident("urgent", minutes=5)
        urgent.deadline = as_of + timedelta(minutes=5)
        critical = make_incident("critical", minutes=None)
        coordinator = make_incident("coordinator", priority=2, minutes=-20)
        coordinator.deadline = as_of - timedelta(minutes=20)
        coordinator.assigned_group_name = COORDINATOR_TEAM
        resolved = make_incident("resolved", minutes=-60)
        resolved.state_enum = IncidentState.RESOLVED
        resolved.state_id = 7
        for index, incident in enumerate([coordinator, critical, resolved, urgent]):
            incident.sys_id = f"dashboard-test-{index}"
        async with self.sessions.begin() as db:
            db.add_all([coordinator, critical, resolved, urgent])
        async with self.sessions() as db:
            self.assertEqual(list(await db.scalars(priority_query(as_of).with_only_columns(Incident.id))), ["urgent"])
            self.assertEqual(list(await db.scalars(priority_query(as_of, "overdue").with_only_columns(Incident.id))), ["coordinator"])

        async def generate(request):
            expected = ["coordinator"] if request.mode == pb.SUMMARY_MODE_OVERDUE else ["urgent"]
            self.assertEqual([item.id for item in request.incidents], expected)
            response = pb.GenerateDashboardSummaryResponse(summary="Инциденты по срокам", highlights=[
                pb.DashboardHighlight(incident_id=item.id, summary="Проверьте статус") for item in request.incidents])
            response.generated_at.FromDatetime(datetime.now(timezone.utc))
            return response

        with patch("services.dashboard_summary.generate_overview", new=AsyncMock(side_effect=generate)):
            for mode, expected_id in [("upcoming", "urgent"), ("overdue", "coordinator")]:
                async with ASGIConnection(f"/api/incidents/summary?mode={mode}") as client:
                    status, _, body = await client.response()
                self.assertEqual(status, 200)
                overview = json.loads(body)
                self.assertEqual(overview["status"], "ready")
                self.assertEqual(overview["mode"], mode)
                self.assertEqual(overview["analyzed_count"], 1)
                self.assertEqual([item["incident"]["id"] for item in overview["highlights"]], [expected_id])

    async def asyncSetUp(self):
        authorize_test_user(self)
        url = make_url(os.environ["TEST_DATABASE_URL"])
        if not (url.database or "").startswith("mts_test_"):
            self.fail("Database tests require an isolated mts_test_* database")
        self.engine = create_async_engine(url, poolclass=NullPool)
        self.addAsyncCleanup(self.engine.dispose)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        await self.migrate("upgrade", "head")
        self.addAsyncCleanup(self.migrate, "downgrade", "base")
        self.records = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        self.retained_records = self.records

        async def test_db():
            async with self.sessions() as session:
                yield session

        previous = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = test_db

        def restore_dependency():
            if previous is None:
                app.dependency_overrides.pop(get_db, None)
            else:
                app.dependency_overrides[get_db] = previous

        self.addCleanup(restore_dependency)

    async def migrate(self, action, revision):
        def run(connection):
            config = Config(str(PROJECT_DIR / "alembic.ini"))
            config.attributes["connection"] = connection
            getattr(command, action)(config, revision)
        async with self.engine.begin() as connection:
            await connection.run_sync(run)

    async def seed(self):
        async with self.sessions.begin() as session:
            return await seed_data(session)

    async def test_migration_matches_models_and_registers_revision(self):
        async with self.engine.connect() as connection:
            differences = await connection.run_sync(
                lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata)
            )
            revision = await connection.scalar(text("SELECT version_num FROM alembic_version"))
        self.assertEqual(differences, [])
        self.assertEqual(revision, "0009")

    async def test_import_preserves_all_original_fields_without_creating_accounts(self):
        self.assertEqual(await self.seed(), {"incidents_created": 44, "incidents_updated": 0, "incidents_unchanged": 0})
        async with self.sessions() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(Incident)), len(self.retained_records))
            self.assertEqual(await session.scalar(select(func.count()).select_from(User)), 0)
            for source in self.retained_records:
                incident = await session.get(Incident, source["id"])
                self.assertEqual(incident.source_payload, source)
                self.assertEqual(incident.sys_id, source["sysId"])
                self.assertEqual(incident.assigned_employee_login, source["assignedEmployeeLogin"])
                self.assertIsNone(incident.waiting_exit_date)
            incident = await session.get(Incident, "INC000021939297")
            self.assertTrue(incident.is_need_up)
            self.assertEqual(incident.state_enum, IncidentState.RESEARCH)
            self.assertIsNone(incident.deadline)
            self.assertEqual(incident.source_payload["waitingExitDate"], "0001-01-01T00:00:00")

    async def test_repeat_import_keeps_ingestion_time_and_ai_annotations(self):
        await self.seed()
        async with self.sessions.begin() as session:
            incident = await session.get(Incident, self.records[0]["id"])
            ingested = incident.ingested_at
            incident.ai_recommendation = "Результат отдельного анализа"
            incident.tags = ["Наблюдение"]
        async with self.sessions() as session:
            updated = (await session.get(Incident, self.records[0]["id"])).updated_at
        self.assertEqual(await self.seed(), {"incidents_created": 44 - len(self.retained_records), "incidents_updated": 0, "incidents_unchanged": len(self.retained_records)})
        async with self.sessions() as session:
            incident = await session.get(Incident, self.records[0]["id"])
            self.assertEqual(incident.ingested_at, ingested)
            self.assertEqual(incident.updated_at, updated)
            self.assertEqual(incident.ai_recommendation, "Результат отдельного анализа")
            self.assertEqual(incident.tags, ["Наблюдение"])

    async def test_changed_source_updates_priority_deadline_and_computed_groups(self):
        await self.seed()
        changed = copy.deepcopy(self.records)
        changed[0]["priorityId"] = 4
        changed[0]["priority"] = "Наивысший"
        changed[0]["deadline"] = "2026-12-01T00:00:00Z"
        async with self.sessions.begin() as session:
            result = await import_incidents(session, changed)
        self.assertEqual(result, {"incidents_created": 44 - len(self.retained_records), "incidents_updated": 1, "incidents_unchanged": len(self.retained_records) - 1})
        async with self.sessions() as session:
            incident = await session.get(Incident, changed[0]["id"])
            self.assertEqual(incident.to_dict()["groups"], ["Критические", "На координаторах"])
            self.assertEqual(incident.source_payload, changed[0])

    async def test_invalid_export_rolls_back_and_does_not_modify_previous_snapshot(self):
        await self.seed()
        changed = copy.deepcopy(self.records)
        changed[0]["header"] = "Не должно сохраниться"
        changed[-1]["stateId"] = 999
        with self.assertRaises(ValueError):
            async with self.sessions.begin() as session:
                await import_incidents(session, changed)
        async with self.sessions() as session:
            self.assertEqual((await session.get(Incident, self.records[0]["id"])).header, self.records[0]["header"])

    async def test_database_conflict_rolls_back_earlier_inserts_in_the_same_batch(self):
        async with self.sessions.begin() as session:
            await import_incidents(session, self.records[:1])
        changed = copy.deepcopy(self.records[1:3])
        changed[1]["sysId"] = self.records[0]["sysId"]
        with self.assertRaises(IntegrityError):
            async with self.sessions.begin() as session:
                await import_incidents(session, changed)
        async with self.sessions() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(Incident)), 1)

    async def test_database_enforces_codes_state_pairs_and_unique_system_ids(self):
        await self.seed()
        statements = [
            "UPDATE incidents SET priority_id = 5 WHERE id = 'INC000021931151'",
            "UPDATE incidents SET urgency_id = 0 WHERE id = 'INC000021931151'",
            "UPDATE incidents SET impact_id = 0 WHERE id = 'INC000021931151'",
            "UPDATE incidents SET state_enum = 'invalid' WHERE id = 'INC000021931151'",
            "UPDATE incidents SET state_id = 7 WHERE id = 'INC000021931151'",
            "UPDATE incidents SET sys_id = (SELECT sys_id FROM incidents WHERE id = 'INC000021931151') WHERE id = 'INC000021931582'",
        ]
        for statement in statements:
            with self.subTest(statement=statement), self.assertRaises(IntegrityError):
                async with self.sessions.begin() as session:
                    await session.execute(text(statement))

    async def test_snapshot_detail_and_raw_source_read_the_original_export(self):
        await self.seed()
        async with ASGIConnection("/api/incidents") as client:
            status, _, body = await client.response()
        self.assertEqual(status, 200)
        incidents = json.loads(body)
        self.assertEqual(len(incidents), len(self.retained_records))
        counts = {name: sum(name in row["groups"] for row in incidents) for name in ["Критические", "На координаторах", "Высокий приоритет", "Исследование ситуации"]}
        self.assertEqual(list(counts.values()), [0, 2, 1, 15])
        self.assertEqual(sum(row["is_active"] for row in incidents), 24)
        for incident in incidents:
            self.assertNotIn("pass_hash", incident)
            self.assertIn("productName", incident)
            self.assertIn("deadline", incident)
            self.assertIn("stateEnum", incident)
        original = self.records[0]
        async with ASGIConnection(f'/api/incidents/{original["id"]}/source') as client:
            status, _, body = await client.response()
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), original)
        async with ASGIConnection(f'/api/incidents/{original["id"]}') as client:
            status, _, body = await client.response()
        self.assertEqual(status, 200)
        detail = json.loads(body)
        self.assertEqual(detail["sysId"], original["sysId"])
        self.assertEqual(detail["service"], original["service"])
        self.assertEqual(detail["productName"], original["productName"])
        async with ASGIConnection("/api/incidents/DOES-NOT-EXIST") as client:
            status, _, body = await client.response()
        self.assertEqual(status, 404)

    async def test_snapshot_of_empty_database_is_an_empty_array(self):
        async with ASGIConnection("/api/incidents") as client:
            status, _, body = await client.response()
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), [])

    async def test_unknown_source_fields_and_nullable_values_survive_roundtrip(self):
        rows = copy.deepcopy(self.records[-1:])
        rows[0]["futureField"] = {"value": "не потерять"}
        async with self.sessions.begin() as session:
            await import_incidents(session, rows)
        async with self.sessions() as session:
            incident = await session.get(Incident, rows[0]["id"])
            self.assertEqual(incident.source_payload, rows[0])
            self.assertIsNone(incident.deadline)
            self.assertIsNone(incident.service_id)
            self.assertTrue(incident.is_need_up)

    async def test_revision_archives_legacy_rows_and_preserves_user_relationships(self):
        await self.migrate("downgrade", "0001")
        async with self.engine.begin() as connection:
            user_id = await connection.scalar(text("INSERT INTO users (login,pass_hash,name,surname,role) VALUES ('legacy','hash','Demo','User','engineer') RETURNING id"))
            await connection.execute(text("INSERT INTO incidents (id,priority,status,service,area,summary,sla,assignee_id,groups,tags) VALUES ('INC-legacy','High','In Progress','Demo','Area','Preserve me',60,:assignee,'[]','[]')"), {"assignee": user_id})
        await self.migrate("upgrade", "head")
        await self.seed()
        async with self.sessions() as session:
            legacy = await session.get(LegacyIncident, "INC-legacy")
            self.assertEqual(legacy.summary, "Preserve me")
            self.assertEqual(legacy.assignee_id, user_id)
            self.assertEqual(legacy.assignee.login, "legacy")
            self.assertEqual(await session.scalar(select(func.count()).select_from(Incident)), len(self.retained_records))
            self.assertEqual(await session.scalar(select(func.count()).select_from(User)), 1)

    async def test_migration_can_be_reverted_and_reapplied(self):
        await self.seed()
        await self.migrate("downgrade", "base")
        async with self.engine.connect() as connection:
            tables = await connection.run_sync(lambda sync: inspect(sync).get_table_names())
        self.assertNotIn("users", tables)
        self.assertNotIn("incidents", tables)
        self.assertNotIn("legacy_incidents", tables)
        await self.migrate("upgrade", "head")
        self.assertEqual((await self.seed())["incidents_created"], 44)

    async def auth_request(self, path, *, method="GET", data=None, cookie=None):
        headers = [(b"content-type", b"application/json")]
        if cookie:
            headers.append((b"cookie", cookie))
        async with ASGIConnection(path, method=method, headers=headers,
                                  body=json.dumps(data).encode() if data is not None else b"") as client:
            status, response_headers, body = await client.response()
        return status, response_headers, json.loads(body) if body else None

    def enable_real_auth(self):
        from core.auth import get_current_session
        from routers.auth import _attempts
        app.dependency_overrides.pop(get_current_session, None)
        _attempts.clear()
        self.addCleanup(_attempts.clear)

    async def create_auth_test_account(self, login="ivan.ivanov"):
        from core.security import hash_password
        from models import UserRole
        payload = {"login": login, "password": "a long passphrase"}
        async with self.sessions.begin() as db:
            db.add(User(login=login, name="Иван", surname="Иванов", role=UserRole.COORDINATOR,
                        pass_hash=hash_password(payload["password"])))
        return payload

    async def test_auth_login_restore_and_revocable_logout(self):
        from core.auth import token_digest
        from core.security import verify_password
        from models import UserSession
        self.enable_real_auth()
        payload = await self.create_auth_test_account()
        status, headers, user = await self.auth_request("/api/auth/login", method="POST", data=payload)
        self.assertEqual(status, 200)
        self.assertEqual((user["login"], user["full_name"], user["role"]), ("ivan.ivanov", "Иванов Иван", "coordinator"))
        self.assertNotIn("pass_hash", user)
        cookie = headers[b"set-cookie"].split(b";", 1)[0]
        self.assertIn(b"HttpOnly", headers[b"set-cookie"])
        self.assertIn(b"SameSite=strict", headers[b"set-cookie"])
        async with self.sessions() as db:
            stored = await db.get(User, user["id"])
            self.assertTrue(verify_password(payload["password"], stored.pass_hash))
            raw_token = cookie.decode().split("=", 1)[1]
            self.assertIsNotNone(await db.get(UserSession, token_digest(raw_token)))
            self.assertIsNone(await db.get(UserSession, raw_token))
        status, _, restored = await self.auth_request("/api/auth/me", cookie=cookie)
        self.assertEqual((status, restored), (200, user))
        status, _, _ = await self.auth_request("/api/auth/logout", method="POST", cookie=cookie)
        self.assertEqual(status, 204)
        self.assertEqual((await self.auth_request("/api/auth/me", cookie=cookie))[0], 401)
        status, _, _ = await self.auth_request("/api/auth/login", method="POST", data={"login": "IVAN.IVANOV", "password": "wrong"})
        self.assertEqual(status, 401)
        status, headers, _ = await self.auth_request("/api/auth/login", method="POST", data={"login": "IVAN.IVANOV", "password": payload["password"]})
        self.assertEqual(status, 200)
        self.assertNotEqual(headers[b"set-cookie"].split(b";", 1)[0], cookie)

    async def test_auth_expiry_and_privilege_escalation(self):
        from models import UserSession
        self.enable_real_auth()
        payload = await self.create_auth_test_account()
        self.assertEqual((await self.auth_request("/api/auth/login", method="POST", data={**payload, "role": "admin"}))[0], 422)
        status, headers, user = await self.auth_request("/api/auth/login", method="POST", data=payload)
        self.assertEqual(status, 200)
        self.assertEqual(user["role"], "coordinator")
        async with self.sessions.begin() as db:
            sessions = (await db.scalars(select(UserSession))).all()
            self.assertEqual(len(sessions), 1)
            sessions[0].expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        cookie = headers[b"set-cookie"].split(b";", 1)[0]
        self.assertEqual((await self.auth_request("/api/auth/me", cookie=cookie))[0], 401)

    async def test_auth_logout_closes_real_stream_and_rejects_reused_cookie(self):
        from core.sse_manager import sse_manager
        self.enable_real_auth()
        payload = await self.create_auth_test_account("stream.user")
        status, headers, _ = await self.auth_request("/api/auth/login", method="POST", data=payload)
        self.assertEqual(status, 200)
        cookie = headers[b"set-cookie"].split(b";", 1)[0]
        async with ASGIConnection("/api/incidents/stream", headers=[(b"cookie", cookie)]) as client:
            self.assertEqual((await client.next_message())["status"], 200)
            await client.next_message()
            self.assertEqual(sse_manager.connection_count, 1)
            self.assertEqual((await self.auth_request("/api/auth/logout", method="POST", cookie=cookie))[0], 204)
            self.assertEqual(sse_manager.connection_count, 0)
            self.assertFalse((await client.next_message()).get("more_body", False))
        self.assertEqual((await self.auth_request("/api/incidents/stream", cookie=cookie))[0], 401)

    async def test_five_default_accounts_are_seeded_once_without_resetting_credentials(self):
        from core.security import hash_password
        from services.users import seed_default_users
        async with self.sessions.begin() as db:
            self.assertEqual(await seed_default_users(db), 5)
        async with self.sessions.begin() as db:
            users = (await db.scalars(select(User))).all()
            self.assertEqual(len(users), 5)
            self.assertEqual({user.login for user in users}, {"admin", "coordinator", "engineer1", "engineer2", "observer"})
            self.assertEqual(sorted(user.role.value for user in users), ["coordinator"] * 5)
            admin = next(user for user in users if user.login == "admin")
            changed_hash = hash_password("updated passphrase")
            admin.pass_hash = changed_hash
            admin.name = "Новое имя"
        async with self.sessions.begin() as db:
            self.assertEqual(await seed_default_users(db), 0)
        async with self.sessions() as db:
            admin = await db.scalar(select(User).where(User.login == "admin"))
            self.assertEqual((admin.pass_hash, admin.name), (changed_hash, "Новое имя"))
            self.assertEqual(await db.scalar(select(func.count()).select_from(User)), 5)

    async def test_other_roles_cannot_login_or_reuse_existing_sessions(self):
        from core.auth import token_digest
        from core.security import hash_password
        from models import UserRole, UserSession
        self.enable_real_auth()
        password = "a long passphrase"
        password_hash = hash_password(password)
        endpoints = [
            ("/api/auth/me", "GET"), ("/api/incidents", "GET"),
            ("/api/incidents", "POST"), ("/api/incidents/INC-1", "GET"),
            ("/api/incidents/INC-1/source", "GET"), ("/api/incidents/stream", "GET"),
            ("/api/incidents/INC-1/resolve", "POST"), ("/api/incidents/INC-1/assign", "POST"),
        ]
        for role in (UserRole.ADMIN, UserRole.ENGINEER, UserRole.OBSERVER):
            with self.subTest(role=role.value):
                token = f"existing-session-{role.value}"
                async with self.sessions.begin() as db:
                    user = User(login=f"legacy.{role.value}", name="Test", surname="User",
                                role=role, pass_hash=password_hash)
                    db.add(user)
                    await db.flush()
                    db.add(UserSession(user_id=user.id, token_hash=token_digest(token),
                                       expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
                status, headers, data = await self.auth_request("/api/auth/login", method="POST",
                                                                data={"login": user.login, "password": password})
                self.assertEqual(status, 403)
                self.assertIn("только координаторам", data["detail"])
                self.assertNotIn(b"set-cookie", headers)
                for path, method in endpoints:
                    status, _, data = await self.auth_request(path, method=method,
                        data={} if method == "POST" else None, cookie=f"mts_session={token}".encode())
                    self.assertEqual(status, 403, (role.value, path))
                    self.assertIn("только координаторам", data["detail"])

    async def test_coordinator_migration_preserves_credentials_and_revokes_other_sessions(self):
        from core.security import hash_password
        from models import UserRole, UserSession
        await self.migrate("downgrade", "0004")
        password_hash = hash_password("existing passphrase")
        async with self.sessions.begin() as db:
            initial = User(login="engineer1", name="Changed", surname="Profile",
                           role=UserRole.ENGINEER, pass_hash=password_hash)
            other = User(login="legacy.engineer", name="Other", surname="User",
                         role=UserRole.ENGINEER, pass_hash=password_hash)
            db.add_all([initial, other])
            await db.flush()
            expires = datetime.now(timezone.utc) + timedelta(hours=1)
            db.add_all([UserSession(token_hash="initial-session", user_id=initial.id, expires_at=expires),
                        UserSession(token_hash="other-session", user_id=other.id, expires_at=expires)])
        await self.migrate("upgrade", "head")
        async with self.sessions() as db:
            promoted = await db.get(User, initial.id)
            self.assertEqual(promoted.role, UserRole.COORDINATOR)
            self.assertEqual((promoted.pass_hash, promoted.name), (password_hash, "Changed"))
            self.assertIsNotNone(await db.get(UserSession, "initial-session"))
            self.assertIsNone(await db.get(UserSession, "other-session"))
            self.assertEqual((await db.get(User, other.id)).role, UserRole.ENGINEER)
