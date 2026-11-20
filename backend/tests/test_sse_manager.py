import asyncio
import json
import unittest
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel

from core.sse_manager import SSEConnectionManager


class SSEManagerEdgeCaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.manager = SSEConnectionManager()
        self.addAsyncCleanup(self.cleanup_manager)

    async def cleanup_manager(self):
        self.manager.close_all()
        self.assertEqual(self.manager.connection_count, 0)

    def test_nonpositive_queue_capacity_is_rejected(self):
        for size in (0, -1, -100):
            with self.subTest(size=size), self.assertRaises(ValueError):
                SSEConnectionManager(queue_size=size)

    async def test_multiple_tabs_have_independent_lifecycles(self):
        first = await self.manager.connect(user_id=7, role="coordinator")
        second = await self.manager.connect(user_id=7, role="coordinator")
        self.assertNotEqual(first.id, second.id)
        self.manager.disconnect(first)
        self.assertEqual(await self.manager.send_to_user(7, {"id": "INC-1"}), 1)
        self.assertEqual(json.loads((await anext(second.events())).raw_data), {"id": "INC-1"})
        self.assertEqual(self.manager.connection_count, 1)

    async def test_empty_target_sets_do_not_retain_or_deliver_events(self):
        self.assertEqual(await self.manager.broadcast_all(["before connect"]), 0)
        async with self.manager.subscribe() as subscription:
            self.assertEqual(await self.manager.send_to_user(999, {}), 0)
            self.assertEqual(await self.manager.broadcast_to_roles([], {}), 0)
            self.assertTrue(subscription.queue.empty())
            await self.manager.broadcast_all(["after connect"])
            self.assertEqual(json.loads((await anext(subscription.events())).raw_data), ["after connect"])

    async def test_all_subscribers_receive_events_in_publisher_order(self):
        clients = [await self.manager.connect() for _ in range(20)]
        for number in range(25):
            self.assertEqual(await self.manager.broadcast_all({"number": number}), 20)
        for client in clients:
            received = [json.loads((await anext(client.events())).raw_data)["number"] for _ in range(25)]
            self.assertEqual(received, list(range(25)))

    async def test_role_iterable_and_string_enum_do_not_duplicate_events(self):
        class Role(str, Enum):
            COORDINATOR = "coordinator"

        coordinator = await self.manager.connect(user_id=1, role=Role.COORDINATOR)
        engineer = await self.manager.connect(user_id=2, role="engineer")
        roles = (role for role in ["coordinator", "coordinator"])
        self.assertEqual(await self.manager.broadcast_to_roles(roles, []), 1)
        self.assertEqual(json.loads((await anext(coordinator.events())).raw_data), [])
        self.assertTrue(coordinator.queue.empty())
        self.assertTrue(engineer.queue.empty())

    async def test_subscription_is_removed_when_publisher_scope_raises(self):
        with self.assertRaisesRegex(RuntimeError, "service failed"):
            async with self.manager.subscribe() as subscription:
                raise RuntimeError("service failed")
        self.assertTrue(subscription.closed)
        self.assertEqual(self.manager.connection_count, 0)

    async def test_disconnect_from_another_manager_does_not_close_connection(self):
        subscription = await self.manager.connect()
        other_manager = SSEConnectionManager()
        other_manager.disconnect(subscription)
        self.assertFalse(subscription.closed)
        self.assertEqual(await self.manager.broadcast_all([1]), 1)
        self.assertEqual(json.loads((await anext(subscription.events())).raw_data), [1])

    async def test_shutdown_wakes_every_waiting_consumer_and_allows_new_connections(self):
        clients = [await self.manager.connect() for _ in range(3)]
        pending = [asyncio.create_task(anext(client.events())) for client in clients]
        await asyncio.sleep(0)
        self.manager.close_all()
        self.manager.close_all()
        results = await asyncio.wait_for(asyncio.gather(*pending, return_exceptions=True), 1)
        self.assertTrue(all(isinstance(result, StopAsyncIteration) for result in results))
        async with self.manager.subscribe() as fresh:
            self.assertEqual(await self.manager.broadcast_all([]), 1)
            self.assertEqual(json.loads((await anext(fresh.events())).raw_data), [])

    async def test_serialization_supports_pydantic_datetime_and_enum(self):
        class Status(str, Enum):
            OPEN = "Open"

        class Incident(BaseModel):
            id: str
            status: Status
            created_at: datetime

        created = datetime(2026, 11, 21, tzinfo=timezone.utc)
        incident = Incident(id="INC-1", status=Status.OPEN, created_at=created)
        async with self.manager.subscribe() as subscriber:
            await self.manager.broadcast_all([incident])
            data = json.loads((await anext(subscriber.events())).raw_data)
            self.assertEqual(data[0]["id"], incident.id)
            self.assertEqual(data[0]["status"], "Open")
            self.assertEqual(datetime.fromisoformat(data[0]["created_at"]), created)

    async def test_newline_payload_cannot_inject_sse_fields(self):
        payload = {"summary": "Ошибка\r\nevent: forged\nid: 99\n\nданные"}
        async with self.manager.subscribe() as subscriber:
            await self.manager.broadcast_all(payload)
            event = await anext(subscriber.events())
            self.assertEqual(json.loads(event.raw_data), payload)
            self.assertNotIn("\n", event.raw_data)
            self.assertNotIn("\r", event.raw_data)
            self.assertIsNone(event.event)
            self.assertIsNone(event.id)

    async def test_invalid_metadata_and_nonfinite_values_leave_queue_unchanged(self):
        cases = [
            ({}, {"event": "bad\nevent"}),
            ({}, {"event": "bad\revent"}),
            ({}, {"event_id": "bad\nid"}),
            ({}, {"event_id": "bad\rid"}),
            ({}, {"event_id": "bad\0id"}),
            ({"value": float("inf")}, {}),
            ({"value": float("-inf")}, {}),
        ]
        async with self.manager.subscribe() as subscriber:
            for payload, metadata in cases:
                with self.subTest(payload=payload, metadata=metadata):
                    with self.assertRaises(ValueError):
                        await self.manager.broadcast_all(payload, **metadata)
                    self.assertTrue(subscriber.queue.empty())
            await self.manager.broadcast_all({"valid": True})
            self.assertEqual(json.loads((await anext(subscriber.events())).raw_data), {"valid": True})

    async def test_overflow_during_role_delivery_does_not_affect_other_roles(self):
        manager = SSEConnectionManager(queue_size=1)
        self.addCleanup(manager.close_all)
        slow = await manager.connect(user_id=1, role="coordinator")
        engineer = await manager.connect(user_id=2, role="engineer")
        await manager.broadcast_to_role("coordinator", {"number": 1})
        self.assertEqual(await manager.broadcast_to_role("coordinator", {"number": 2}), 0)
        self.assertTrue(slow.closed)
        self.assertFalse(engineer.closed)
        self.assertEqual(await manager.send_to_user(2, {"number": 3}), 1)
        self.assertEqual(json.loads((await anext(engineer.events())).raw_data), {"number": 3})


if __name__ == "__main__":
    unittest.main()
