import asyncio
import json
import unittest
from unittest.mock import patch

from core.sse_manager import sse_manager
from main import app
from tests.helpers import ASGIConnection, parse_sse


class SSERouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        sse_manager.close_all()

    async def asyncTearDown(self):
        remaining = sse_manager.connection_count
        sse_manager.close_all()
        self.assertEqual(remaining, 0, "HTTP subscription leaked")

    async def connect_stream(self, path="/api/incidents/stream", **kwargs):
        client = ASGIConnection(path, **kwargs)
        self.addAsyncCleanup(client.disconnect)
        start = await client.next_message()
        self.assertEqual(start["status"], 200)
        greeting = await client.next_message()
        fields = parse_sse(greeting["body"])
        self.assertEqual(fields, {"retry": "4000"})
        return client

    async def test_named_events_and_ids_reach_the_wire(self):
        client = await self.connect_stream()
        payload = {"incident_id": "INC-1", "message": "Критический инцидент"}
        await sse_manager.broadcast_all(payload, event="incident_critical", event_id="42")
        fields = parse_sse((await client.next_message())["body"])
        self.assertEqual(fields["event"], "incident_critical")
        self.assertEqual(fields["id"], "42")
        self.assertEqual(json.loads(fields["data"]), payload)
        await client.disconnect()

    async def test_multiple_updates_preserve_order_and_empty_snapshot(self):
        client = await self.connect_stream()
        snapshots = [[{"id": "INC-1"}], [{"id": "INC-1", "status": "Resolved"}], []]
        for snapshot in snapshots:
            await sse_manager.broadcast_all(snapshot)
        for snapshot in snapshots:
            fields = parse_sse((await client.next_message())["body"])
            self.assertEqual(json.loads(fields["data"]), snapshot)
            self.assertNotIn("event", fields)
        await client.disconnect()

    async def test_reconnect_receives_new_events_without_replaying_missed_events(self):
        first = await self.connect_stream()
        await sse_manager.broadcast_all([{"id": "first"}], event_id="1")
        self.assertEqual(parse_sse((await first.next_message())["body"])["id"], "1")
        await first.disconnect()
        self.assertEqual(sse_manager.connection_count, 0)
        self.assertEqual(await sse_manager.broadcast_all([{"id": "missed"}], event_id="2"), 0)

        second = await self.connect_stream(headers=[(b"last-event-id", b"1")])
        await sse_manager.broadcast_all([{"id": "fresh"}], event_id="3")
        fields = parse_sse((await second.next_message())["body"])
        self.assertEqual(fields["id"], "3")
        self.assertEqual(json.loads(fields["data"]), [{"id": "fresh"}])
        await second.disconnect()

    async def test_client_cannot_select_another_users_identity_with_query_parameters(self):
        client = await self.connect_stream("/api/incidents/stream?user_id=7&role=admin")
        self.assertEqual(await sse_manager.send_to_user(7, {"private": True}), 0)
        self.assertEqual(await sse_manager.broadcast_to_role("admin", {"private": True}), 0)
        await sse_manager.broadcast_all([{"id": "public"}])
        fields = parse_sse((await client.next_message())["body"])
        self.assertEqual(json.loads(fields["data"]), [{"id": "public"}])
        await client.disconnect()

    async def test_idle_connection_emits_keepalive_without_fake_incident_data(self):
        # Exercise the real idle-ping path without waiting the default 15 seconds.
        with patch("fastapi.routing._PING_INTERVAL", 0.01):
            client = await self.connect_stream()
            heartbeat = (await client.next_message())["body"]
            self.assertIn(b": ping", heartbeat)
            self.assertEqual(parse_sse(heartbeat), {})
            self.assertEqual(sse_manager.connection_count, 1)
            await client.disconnect()

    async def test_cancelling_http_request_unregisters_subscription(self):
        client = await self.connect_stream()
        client.task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await client.task
        self.assertEqual(sse_manager.connection_count, 0)

    async def test_application_shutdown_finishes_active_http_streams(self):
        async with app.router.lifespan_context(app):
            client = await self.connect_stream()
            self.assertEqual(sse_manager.connection_count, 1)
        terminal = await client.next_message()
        self.assertFalse(terminal.get("more_body", False))
        self.assertEqual(terminal.get("body", b""), b"")
        await asyncio.wait_for(client.task, timeout=2)

    async def test_invalid_publication_does_not_break_connected_stream(self):
        client = await self.connect_stream()
        with self.assertRaises(ValueError):
            await sse_manager.broadcast_all({}, event_id="invalid\0id")
        await sse_manager.broadcast_all([{"id": "valid"}])
        data = parse_sse((await client.next_message())["body"])["data"]
        self.assertEqual(json.loads(data), [{"id": "valid"}])
        await client.disconnect()

    async def test_stream_does_not_accept_write_requests(self):
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            with self.subTest(method=method):
                async with ASGIConnection("/api/incidents/stream", method=method) as client:
                    status, headers, body = await client.response()
                    self.assertEqual(status, 405)
                    self.assertIn(b"GET", headers[b"allow"])
                    self.assertEqual(json.loads(body)["detail"], "Method Not Allowed")


class ApplicationRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_health_returns_json_without_opening_subscriptions(self):
        async with ASGIConnection("/health") as client:
            status, headers, body = await client.response()
        self.assertEqual(status, 200)
        self.assertIn(b"application/json", headers[b"content-type"])
        self.assertEqual(json.loads(body), {"status": "ok"})
        self.assertEqual(sse_manager.connection_count, 0)

    async def test_documentation_and_oauth_redirect_are_served(self):
        for path in ("/docs", "/redoc", "/docs/oauth2-redirect"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    async with ASGIConnection(path, method=method) as client:
                        status, headers, body = await client.response()
                    self.assertEqual(status, 200)
                    self.assertIn(b"text/html", headers[b"content-type"])
                    if method == "GET":
                        self.assertIn(b"<html", body.lower())

    async def test_openapi_is_valid_and_describes_the_sse_contract(self):
        async with ASGIConnection("/openapi.json") as client:
            status, headers, body = await client.response()
        self.assertEqual(status, 200)
        self.assertIn(b"application/json", headers[b"content-type"])
        schema = json.loads(body)
        self.assertIn("openapi", schema)
        self.assertIn("get", schema["paths"]["/health"])
        stream = schema["paths"]["/api/incidents/stream"]["get"]
        self.assertIn("text/event-stream", stream["responses"]["200"]["content"])
        self.assertFalse(stream.get("requestBody"))
        self.assertFalse(stream.get("parameters"))

    async def test_old_ws_and_unknown_http_paths_are_not_registered(self):
        for path in ("/ws", "/missing-route"):
            with self.subTest(path=path):
                async with ASGIConnection(path) as client:
                    status, _, body = await client.response()
                self.assertEqual(status, 404)
                self.assertEqual(json.loads(body)["detail"], "Not Found")


if __name__ == "__main__":
    unittest.main()
