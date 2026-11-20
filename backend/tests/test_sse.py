import asyncio
import json
import unittest

from core.sse_manager import SSEConnectionManager, sse_manager
from main import app
from tests.helpers import ASGIConnection


class ManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_broadcast_reaches_each_connection_and_freezes_payload(self):
        manager = SSEConnectionManager()
        async with manager.subscribe() as first, manager.subscribe() as second:
            payload = [{"id": "INC-1", "service": "МТС"}]
            self.assertEqual(await manager.broadcast_all(payload), 2)
            payload[0]["service"] = "changed after publishing"
            for subscription in (first, second):
                event = await anext(subscription.events())
                self.assertEqual(json.loads(event.raw_data)[0]["service"], "МТС")
                self.assertIsNone(event.event)  # Existing frontend uses onmessage.
        self.assertEqual(manager.connection_count, 0)

    async def test_user_and_role_delivery_are_isolated(self):
        manager = SSEConnectionManager()
        first_tab = await manager.connect(user_id=1, role="coordinator")
        second_tab = await manager.connect(user_id=1, role="coordinator")
        engineer = await manager.connect(user_id=2, role="engineer")
        anonymous = await manager.connect()
        try:
            self.assertEqual(await manager.send_to_user(1, {"private": True}), 2)
            for tab in (first_tab, second_tab):
                self.assertEqual(json.loads((await anext(tab.events())).raw_data), {"private": True})
            self.assertTrue(engineer.queue.empty())
            self.assertTrue(anonymous.queue.empty())

            count = await manager.broadcast_to_roles(
                ["coordinator", "coordinator", "engineer"],
                {"id": "INC-1"}, event="incident_updated", event_id="42",
            )
            self.assertEqual(count, 3)
            for subscriber in (first_tab, second_tab, engineer):
                event = await anext(subscriber.events())
                self.assertEqual((event.event, event.id), ("incident_updated", "42"))
                self.assertTrue(subscriber.queue.empty())
            self.assertTrue(anonymous.queue.empty())
            self.assertEqual(await manager.broadcast_to_role("observer", {}), 0)
            self.assertEqual(await manager.broadcast_to_role("engineer", {}), 1)
            self.assertEqual(json.loads((await anext(engineer.events())).raw_data), {})
            self.assertTrue(first_tab.queue.empty())
            self.assertTrue(second_tab.queue.empty())
        finally:
            manager.close_all()

    async def test_slow_subscriber_does_not_block_healthy_subscriber(self):
        manager = SSEConnectionManager(queue_size=1)
        slow = await manager.connect()
        healthy = await manager.connect()
        self.assertEqual(await manager.broadcast_all([1]), 2)
        await anext(healthy.events())
        self.assertEqual(await manager.broadcast_all([2]), 1)
        self.assertTrue(slow.closed)
        self.assertEqual(manager.connection_count, 1)
        self.assertEqual(json.loads((await anext(healthy.events())).raw_data), [2])
        with self.assertRaises(StopAsyncIteration):
            await anext(slow.events())
        manager.close_all()

    async def test_disconnect_wakes_waiting_consumer_and_is_idempotent(self):
        manager = SSEConnectionManager()
        subscription = await manager.connect()
        pending = asyncio.create_task(anext(subscription.events()))
        await asyncio.sleep(0)
        manager.disconnect(subscription)
        manager.disconnect(subscription)
        with self.assertRaises(StopAsyncIteration):
            await asyncio.wait_for(pending, timeout=1)
        self.assertEqual(manager.connection_count, 0)

    async def test_cancellation_unregisters_subscription(self):
        manager = SSEConnectionManager()
        ready = asyncio.Event()

        async def consume():
            async with manager.subscribe() as subscription:
                ready.set()
                await anext(subscription.events())

        task = asyncio.create_task(consume())
        await ready.wait()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(manager.connection_count, 0)

    async def test_invalid_event_is_rejected_before_enqueue(self):
        manager = SSEConnectionManager()
        async with manager.subscribe() as subscription:
            with self.assertRaises(ValueError):
                await manager.broadcast_all({}, event="invalid\nevent")
            with self.assertRaises(ValueError):
                await manager.broadcast_all({"invalid": float("nan")})
            self.assertTrue(subscription.queue.empty())


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        sse_manager.close_all()

    async def asyncTearDown(self):
        sse_manager.close_all()

    async def test_real_stream_headers_fanout_and_disconnect_cleanup(self):
        clients = [ASGIConnection("/api/incidents/stream") for _ in range(2)]
        try:
            for client in clients:
                response = await client.next_message()
                self.assertEqual(response["status"], 200)
                headers = dict(response["headers"])
                self.assertIn(b"text/event-stream", headers[b"content-type"])
                self.assertEqual(headers[b"cache-control"], b"no-cache")
                self.assertEqual(headers[b"x-accel-buffering"], b"no")
                greeting = await client.next_message()
                self.assertIn(b": connected", greeting["body"])
                self.assertIn(b"retry: 4000", greeting["body"])
                self.assertNotIn(b"data:", greeting["body"])

            self.assertEqual(sse_manager.connection_count, 2)
            payload = [{"id": "INC-1", "service": "МТС"}]
            self.assertEqual(await sse_manager.broadcast_all(payload), 2)
            for client in clients:
                message = await client.next_message()
                body = message["body"].decode()
                self.assertTrue(body.endswith("\n\n"))
                self.assertNotIn("event:", body)
                self.assertEqual(json.loads(body.removeprefix("data: ").strip()), payload)

            await clients[0].disconnect()
            self.assertEqual(sse_manager.connection_count, 1)
            self.assertEqual(await sse_manager.broadcast_all([]), 1)
            self.assertIn(b"data: []", (await clients[1].next_message())["body"])
        finally:
            for client in clients:
                await client.disconnect()
        self.assertEqual(sse_manager.connection_count, 0)

    async def test_health_and_documented_stream(self):
        client = ASGIConnection("/health")
        try:
            self.assertEqual((await client.next_message())["status"], 200)
            self.assertEqual(json.loads((await client.next_message())["body"]), {"status": "ok"})
        finally:
            await client.disconnect()
        schema = app.openapi()
        stream = schema["paths"]["/api/incidents/stream"]["get"]
        self.assertIn("text/event-stream", stream["responses"]["200"]["content"])
        self.assertNotIn("/ws", schema["paths"])

    async def test_application_shutdown_closes_subscriptions(self):
        async with app.router.lifespan_context(app):
            subscription = await sse_manager.connect()
            self.assertEqual(sse_manager.connection_count, 1)
        self.assertTrue(subscription.closed)
        self.assertEqual(sse_manager.connection_count, 0)


if __name__ == "__main__":
    unittest.main()
