"""Bridge PostgreSQL notifications to the existing full-snapshot SSE feed."""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from services.incidents import INCIDENT_NOTIFICATION_ORIGIN, publish_incident_snapshot

logger = logging.getLogger(__name__)
CHANNEL = "incidents_changed"


class IncidentChangeListener:
    def __init__(self, engine: AsyncEngine, sessions: async_sessionmaker, *,
                 debounce_seconds: float = 0.1, retry_seconds: float = 1,
                 heartbeat_seconds: float = 30):
        self.engine = engine
        self.sessions = sessions
        self.debounce_seconds = debounce_seconds
        self.retry_seconds = retry_seconds
        self.heartbeat_seconds = heartbeat_seconds
        self.ready = asyncio.Event()

    async def _publish(self):
        async with self.sessions() as session:
            await publish_incident_snapshot(session)

    async def run(self):
        delay = self.retry_seconds
        while True:
            try:
                # Reserve one pool connection for LISTEN. Driver calls run outside
                # a transaction, so PostgreSQL can deliver notifications at once.
                async with self.engine.connect() as connection:
                    raw = await connection.get_raw_connection()
                    driver = raw.driver_connection
                    changed = asyncio.Event()
                    disconnected = asyncio.Event()

                    def notification(_connection, _pid, _channel, payload):
                        # This process's API already publishes synchronously after
                        # commit. Other processes and direct SQL still reach us.
                        if payload != INCIDENT_NOTIFICATION_ORIGIN:
                            changed.set()

                    def terminated(_connection):
                        disconnected.set()
                        changed.set()

                    driver.add_termination_listener(terminated)
                    try:
                        await driver.add_listener(CHANNEL, notification)
                        # LISTEN first, then resync: also catches writes made while
                        # disconnected, which PostgreSQL does not replay.
                        await self._publish()
                        self.ready.set()
                        delay = self.retry_seconds
                        logger.info("Listening for PostgreSQL incident changes")
                        while not disconnected.is_set():
                            try:
                                await asyncio.wait_for(changed.wait(), self.heartbeat_seconds)
                            except TimeoutError:
                                await driver.fetchval("SELECT 1", timeout=10)
                                continue
                            if disconnected.is_set():
                                break
                            await asyncio.sleep(self.debounce_seconds)
                            # Clear before reading: a commit during publication
                            # schedules another pass instead of being lost.
                            changed.clear()
                            await self._publish()
                        raise ConnectionError("PostgreSQL listener disconnected")
                    finally:
                        self.ready.clear()
                        driver.remove_termination_listener(terminated)
                        if not driver.is_closed():
                            try:
                                await driver.remove_listener(CHANNEL, notification)
                            except Exception:
                                # Never return a connection still LISTENing to the pool.
                                await connection.invalidate()
            except Exception as error:
                # Do not include connection strings or exception messages in logs.
                self.ready.clear()
                logger.warning("Incident change listener retry in %ss (%s)", delay, type(error).__name__)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 30)


@asynccontextmanager
async def watch_incident_changes(engine: AsyncEngine, sessions: async_sessionmaker):
    listener = IncidentChangeListener(engine, sessions)
    task = asyncio.create_task(listener.run(), name="incident-change-listener")
    try:
        yield listener
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
