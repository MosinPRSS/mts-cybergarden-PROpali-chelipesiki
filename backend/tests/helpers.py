"""Minimal streaming ASGI client, with no HTTP client dependency or server socket."""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import contextmanager

from main import app


class ASGIConnection:
    def __init__(self, path, *, method="GET", headers=(), application=app, body=b""):
        self.incoming = asyncio.Queue()
        self.outgoing = asyncio.Queue()
        self.incoming.put_nowait({"type": "http.request", "body": body, "more_body": False})
        path, _, query = path.partition("?")
        scope = {
            "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1", "method": method, "scheme": "http",
            "path": path, "raw_path": path.encode(), "query_string": query.encode(),
            "root_path": "", "headers": list(headers),
            "client": ("127.0.0.1", 1234), "server": ("test", 80),
        }
        self.task = asyncio.create_task(
            application(scope, self.incoming.get, self.outgoing.put)
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        await self.disconnect()

    async def next_message(self):
        if not self.outgoing.empty():
            return self.outgoing.get_nowait()
        pending = asyncio.create_task(self.outgoing.get())
        try:
            done, _ = await asyncio.wait(
                (pending, self.task), timeout=2, return_when=asyncio.FIRST_COMPLETED
            )
            if pending in done:
                return pending.result()
            if self.task in done:
                await self.task  # Surface an application exception immediately.
                if not self.outgoing.empty():
                    return self.outgoing.get_nowait()
                raise AssertionError("Response ended before the expected ASGI message")
            raise TimeoutError("No ASGI response message within 2 seconds")
        finally:
            if not pending.done():
                pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)

    async def response(self):
        """Collect a finite response; never use for an open SSE stream."""
        start = await self.next_message()
        if start["type"] != "http.response.start":
            raise AssertionError(f"Unexpected response start: {start!r}")
        chunks = []
        while True:
            message = await self.next_message()
            if message["type"] != "http.response.body":
                raise AssertionError(f"Unexpected body message: {message!r}")
            chunks.append(message.get("body", b""))
            if not message.get("more_body", False):
                return start["status"], dict(start["headers"]), b"".join(chunks)

    async def disconnect(self):
        if self.task.cancelled():
            return
        if not self.task.done():
            self.incoming.put_nowait({"type": "http.disconnect"})
        await asyncio.wait_for(self.task, timeout=2)


def parse_sse(body):
    """Parse SSE fields according to wire line endings, including multiline data."""
    text = body.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    result = {}
    for line in text.split("\n"):
        if not line or line.startswith(":"):
            continue
        field, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if field == "data" and field in result:
            result[field] += "\n" + value
        else:
            result[field] = value
    return result


def authorize_test_user(test_case):
    from core.auth import get_current_session
    from models import User, UserRole, UserSession

    session = UserSession(token_hash="test-session", user_id=1,
                          expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                          user=User(id=1, login="test", name="Test", surname="User", role=UserRole.COORDINATOR))
    previous = app.dependency_overrides.get(get_current_session)
    app.dependency_overrides[get_current_session] = lambda: session

    def restore():
        if previous is None:
            app.dependency_overrides.pop(get_current_session, None)
        else:
            app.dependency_overrides[get_current_session] = previous
    test_case.addCleanup(restore)


@contextmanager
def mock_lifespan_database():
    # Lifecycle tests exercise stream shutdown independently of PostgreSQL.
    engine = MagicMock()
    engine.begin.return_value.__aenter__.return_value.run_sync = AsyncMock()
    engine.dispose = AsyncMock()
    with patch("main.engine", engine), patch("main.seed_default_users", new=AsyncMock(return_value=0)):
        yield
