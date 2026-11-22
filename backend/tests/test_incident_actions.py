import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.sse_manager import sse_manager
from main import app
from tests.helpers import ASGIConnection, authorize_test_user
from tests.test_dashboard_summary import make_incident


class IncidentActionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        authorize_test_user(self)
        sse_manager.close_all()
        self.addCleanup(sse_manager.close_all)
        self.incident = make_incident("target")
        self.other = make_incident("other")
        self.db = AsyncMock(spec=AsyncSession)
        self.db.get.return_value = self.incident
        self.rows = MagicMock()
        self.rows.unique.return_value.all.return_value = [self.incident, self.other]
        self.db.scalars.return_value = self.rows

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

    async def request(self, path, *, method="GET", data=None):
        headers = [(b"content-type", b"application/json")] if data is not None else []
        body = json.dumps(data).encode() if data is not None else b""
        async with ASGIConnection(path, method=method, headers=headers, body=body) as client:
            status, _, response = await client.response()
        return status, json.loads(response)

    async def test_assignment_and_resolution_publish_committed_full_snapshots(self):
        async def committed_snapshot(_query):
            self.assertGreater(self.db.commit.await_count, 0)
            return self.rows

        self.db.scalars.side_effect = committed_snapshot
        async with sse_manager.subscribe() as subscriber:
            status, assigned = await self.request(
                "/api/incidents/target/assign", method="POST", data={"team": "Исполнители"}
            )
            self.assertEqual(status, 200)
            snapshot = json.loads((await anext(subscriber.events())).raw_data)
            self.assertEqual([item["id"] for item in snapshot], ["target", "other"])
            self.assertEqual(snapshot[0]["assignedGroupName"], assigned["assignedGroupName"])
            self.assertEqual(snapshot[0]["groups"], ["Критические"])

            self.db.commit.reset_mock()
            status, resolved = await self.request("/api/incidents/target/resolve", method="POST")
            self.assertEqual(status, 200)
            snapshot = json.loads((await anext(subscriber.events())).raw_data)
            self.assertEqual([item["id"] for item in snapshot], ["target", "other"])
            self.assertEqual(snapshot[0]["stateEnum"], "Research")
            self.assertEqual(snapshot[0]["completionDate"], resolved["completionDate"])
            self.assertEqual(snapshot[0]["groups"], ["Исследование ситуации"])
            self.assertTrue(subscriber.queue.empty())

            status, current = await self.request("/api/incidents")
            self.assertEqual(status, 200)
            self.assertEqual([item["id"] for item in current], ["target", "other"])
            self.assertEqual(current[0]["stateEnum"], snapshot[0]["stateEnum"])

    async def test_changed_import_publishes_full_snapshot_to_every_subscriber(self):
        async def committed_snapshot(_query):
            self.db.commit.assert_awaited_once()
            return self.rows

        self.db.scalars.side_effect = committed_snapshot
        stats = {"incidents_created": 1, "incidents_updated": 0, "incidents_unchanged": 0}
        async with sse_manager.subscribe() as first, sse_manager.subscribe() as second:
            with patch("routers.incidents.import_incidents", new=AsyncMock(return_value=stats)):
                status, response = await self.request(
                    "/api/incidents", method="POST", data=self.incident.source_payload
                )
            self.assertEqual(status, 201)
            self.assertEqual(response, {"id": "target", "created": True, "sseNotified": 2})
            for subscriber in (first, second):
                snapshot = json.loads((await anext(subscriber.events())).raw_data)
                self.assertEqual([item["id"] for item in snapshot], ["target", "other"])

    async def test_unchanged_import_does_not_load_or_publish_a_snapshot(self):
        stats = {"incidents_created": 0, "incidents_updated": 0, "incidents_unchanged": 1}
        async with sse_manager.subscribe() as subscriber:
            with patch("routers.incidents.import_incidents", new=AsyncMock(return_value=stats)):
                status, response = await self.request(
                    "/api/incidents", method="POST", data=self.incident.source_payload
                )
            self.assertEqual(status, 201)
            self.assertEqual(response["sseNotified"], 0)
            self.db.scalars.assert_not_awaited()
            self.assertTrue(subscriber.queue.empty())

    async def test_conflicting_import_rolls_back_without_publishing(self):
        self.db.commit.side_effect = IntegrityError("upsert", {}, Exception("conflict"))
        stats = {"incidents_created": 0, "incidents_updated": 1, "incidents_unchanged": 0}
        async with sse_manager.subscribe() as subscriber:
            with patch("routers.incidents.import_incidents", new=AsyncMock(return_value=stats)):
                status, _ = await self.request(
                    "/api/incidents", method="POST", data=self.incident.source_payload
                )
            self.assertEqual(status, 409)
            self.db.rollback.assert_awaited_once()
            self.db.scalars.assert_not_awaited()
            self.assertTrue(subscriber.queue.empty())

    async def test_missing_incidents_keep_the_same_404_without_writes_or_events(self):
        self.db.get.return_value = None
        paths = [
            ("GET", "/api/incidents/missing", None),
            ("GET", "/api/incidents/missing/source", None),
            ("POST", "/api/incidents/missing/resolve", None),
            ("POST", "/api/incidents/missing/assign", {"team": "Исполнители"}),
        ]
        async with sse_manager.subscribe() as subscriber:
            for method, path, data in paths:
                with self.subTest(path=path):
                    status, response = await self.request(path, method=method, data=data)
                    self.assertEqual(status, 404)
                    self.assertEqual(response, {"detail": "Incident not found"})
            self.db.commit.assert_not_awaited()
            self.db.scalars.assert_not_awaited()
            self.assertTrue(subscriber.queue.empty())
