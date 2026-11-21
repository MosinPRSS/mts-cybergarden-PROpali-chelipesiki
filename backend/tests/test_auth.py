import json
import unittest
from unittest.mock import AsyncMock

from core.auth import get_current_session, token_digest
from core.db import get_db
from core.security import hash_password, verify_password
from core.sse_manager import SSEConnectionManager
from main import app
from models import UserRole
from pydantic import ValidationError
from routers.auth import _attempts
from schemas.auth import LoginRequest
from tests.helpers import ASGIConnection, authorize_test_user


class AuthSchemaTests(unittest.TestCase):
    def test_normalization_preserves_password(self):
        data = LoginRequest(login=" Ivan.Ivanov ", password=" a long passphrase ")
        self.assertEqual(data.login, "ivan.ivanov")
        self.assertEqual(data.password, " a long passphrase ")
        self.assertNotIn(data.password, repr(data))

    def test_login_cannot_choose_role(self):
        with self.assertRaises(ValidationError):
            LoginRequest.model_validate({"login": "ivan", "password": "a long passphrase", "role": "admin"})

    def test_password_hash_is_salted(self):
        first = hash_password("a long passphrase")
        self.assertNotEqual(first, hash_password("a long passphrase"))
        self.assertTrue(verify_password("a long passphrase", first))
        self.assertFalse(verify_password("wrong", first))
        self.assertEqual(len(token_digest("secret")), 64)


class AuthRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        _attempts.clear()
        self.db = AsyncMock()
        self.db.scalar.return_value = None
        async def fake_db():
            yield self.db
        previous = dict(app.dependency_overrides)
        app.dependency_overrides[get_db] = fake_db
        self.addCleanup(lambda: (app.dependency_overrides.clear(), app.dependency_overrides.update(previous)))
        self.addCleanup(_attempts.clear)

    async def test_incidents_and_stream_require_session(self):
        for path, method in [("/api/auth/me", "GET"), ("/api/incidents", "GET"), ("/api/incidents", "POST"), ("/api/incidents/stream", "GET"), ("/api/incidents/INC-1", "GET"), ("/api/incidents/INC-1/source", "GET"), ("/api/incidents/INC-1/resolve", "POST")]:
            with self.subTest(path=path):
                async with ASGIConnection(path, method=method) as client:
                    status, _, _ = await client.response()
                self.assertEqual(status, 401)
        self.db.scalar.assert_not_awaited()

    async def test_registration_is_unavailable(self):
        async with ASGIConnection("/api/auth/register", method="POST", headers=[(b"content-type", b"application/json")], body=b"{}") as client:
            status, _, _ = await client.response()
        self.assertEqual(status, 404)
        self.assertNotIn("/api/auth/register", app.openapi()["paths"])
        self.db.commit.assert_not_awaited()

    async def test_forged_session_is_rejected(self):
        async with ASGIConnection("/api/auth/me", headers=[(b"cookie", b"mts_session=forged")]) as client:
            status, _, _ = await client.response()
        self.assertEqual(status, 401)

    async def test_unknown_login_has_generic_error(self):
        async with ASGIConnection("/api/auth/login", method="POST", headers=[(b"content-type", b"application/json")], body=b'{"login":"unknown","password":"wrong"}') as client:
            status, headers, body = await client.response()
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(body)["detail"], "Неверный логин или пароль")
        self.assertNotIn(b"set-cookie", headers)
        self.db.commit.assert_not_awaited()

    async def test_cross_origin_auth_requests_are_rejected(self):
        for route in ("login", "logout"):
            async with ASGIConnection(f"/api/auth/{route}", method="POST", headers=[(b"origin", b"https://attacker.example"), (b"content-type", b"application/json")], body=b"{}") as client:
                status, _, _ = await client.response()
            self.assertEqual(status, 403)
        self.db.commit.assert_not_awaited()

    async def test_attempts_are_rate_limited(self):
        from collections import deque
        from time import monotonic
        _attempts["127.0.0.1"] = deque([monotonic()] * 20)
        async with ASGIConnection("/api/auth/login", method="POST", headers=[(b"content-type", b"application/json")], body=b'{"login":"ivan","password":"wrong"}') as client:
            status, headers, _ = await client.response()
        self.assertEqual(status, 429)
        self.assertEqual(headers[b"retry-after"], b"60")
        self.db.scalar.assert_not_awaited()

    async def test_observer_cannot_resolve(self):
        session = authorize_test_user(self)
        session.user.role = UserRole.OBSERVER
        async with ASGIConnection("/api/incidents/INC-1/resolve", method="POST") as client:
            status, _, _ = await client.response()
        self.assertEqual(status, 403)
        self.db.get.assert_not_awaited()

    async def test_logout_clears_cookie(self):
        async with ASGIConnection("/api/auth/logout", method="POST") as client:
            status, headers, body = await client.response()
        self.assertEqual((status, body), (204, b""))
        self.assertIn(b"Max-Age=0", headers[b"set-cookie"])
        self.assertIn(b"HttpOnly", headers[b"set-cookie"])

    async def test_only_same_session_streams_close(self):
        manager = SSEConnectionManager()
        first = await manager.connect(user_id=1, session_id="first")
        second = await manager.connect(user_id=1, session_id="second")
        manager.close_session("first")
        self.assertTrue(first.closed)
        self.assertFalse(second.closed)
        manager.close_all()
