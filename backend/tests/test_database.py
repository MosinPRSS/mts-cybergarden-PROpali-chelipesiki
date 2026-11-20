import copy
import json
import os
import unittest

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
from tests.helpers import ASGIConnection


@unittest.skipUnless(os.getenv("TEST_DATABASE_URL"), "Run python -m scripts.test_database for PostgreSQL tests")
class PostgreSQLTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = make_url(os.environ["TEST_DATABASE_URL"])
        if not (url.database or "").startswith("mts_test_"):
            self.fail("Database tests require an isolated mts_test_* database")
        self.engine = create_async_engine(url, poolclass=NullPool)
        self.addAsyncCleanup(self.engine.dispose)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        await self.migrate("upgrade", "head")
        self.addAsyncCleanup(self.migrate, "downgrade", "base")
        self.records = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

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
        self.assertEqual(revision, "0002")

    async def test_import_preserves_all_original_fields_without_creating_accounts(self):
        self.assertEqual(await self.seed(), {"incidents_created": 44, "incidents_updated": 0, "incidents_unchanged": 0})
        async with self.sessions() as session:
            self.assertEqual(await session.scalar(select(func.count()).select_from(Incident)), 44)
            self.assertEqual(await session.scalar(select(func.count()).select_from(User)), 0)
            for source in self.records:
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
        self.assertEqual(await self.seed(), {"incidents_created": 0, "incidents_updated": 0, "incidents_unchanged": 44})
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
        self.assertEqual(result, {"incidents_created": 0, "incidents_updated": 1, "incidents_unchanged": 43})
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
        self.assertEqual(len(incidents), 44)
        counts = {name: sum(name in row["groups"] for row in incidents) for name in ["Критические", "На координаторах", "Высокий приоритет", "Исследование ситуации"]}
        self.assertEqual(list(counts.values()), [0, 2, 1, 5])
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
            self.assertEqual(await session.scalar(select(func.count()).select_from(Incident)), 44)
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
