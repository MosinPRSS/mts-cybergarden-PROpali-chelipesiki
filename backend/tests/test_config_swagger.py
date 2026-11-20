import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy.engine import make_url

from config import PROJECT_DIR, Setup
from main import app
from scripts.export_openapi import export_schema
from tests.helpers import ASGIConnection


class SettingsTests(unittest.TestCase):
    def test_postgres_fields_handle_special_characters_without_leaking_secrets(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = Setup(_env_file=None, POSTGRES_PASSWORD="p@ss:/%word", SECRET_KEY="private")
        url = make_url(settings.database_url)
        self.assertEqual(url.drivername, "postgresql+asyncpg")
        self.assertEqual(url.password, "p@ss:/%word")
        self.assertNotIn("p@ss:/%word", repr(settings))
        self.assertNotIn("private", repr(settings))

    def test_database_url_alias_and_driver_normalization(self):
        for key in ("DATABASE_URL", "DB_URL"):
            with self.subTest(key=key), patch.dict(os.environ, {key: "postgresql://demo:secret@localhost/demo"}, clear=True):
                settings = Setup(_env_file=None)
                url = make_url(settings.database_url)
                self.assertEqual(url.drivername, "postgresql+asyncpg")
                self.assertEqual(url.database, "demo")

    def test_non_asyncpg_database_is_rejected(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = Setup(_env_file=None, DATABASE_URL="sqlite:///unsupported.db")
        with self.assertRaisesRegex(ValueError, "PostgreSQL"):
            _ = settings.database_url


class SwaggerTests(unittest.IsolatedAsyncioTestCase):
    async def test_swagger_alias_points_to_documented_ui(self):
        async with ASGIConnection("/swagger") as client:
            status, headers, _ = await client.response()
        self.assertEqual(status, 307)
        self.assertEqual(headers[b"location"], b"/docs")
        async with ASGIConnection("/docs") as client:
            status, _, body = await client.response()
        self.assertEqual(status, 200)
        self.assertIn(b"SwaggerUIBundle", body)
        self.assertIn(b"/openapi.json", body)

    async def test_public_schema_has_metadata_and_typed_database_responses(self):
        schema = app.openapi()
        self.assertEqual(schema["info"]["version"], "0.2.0")
        self.assertIn("МТС", schema["info"]["title"])
        components = schema["components"]["schemas"]
        properties = components["IncidentResponse"]["properties"]
        self.assertNotIn("pass_hash", properties)
        self.assertNotIn("login", properties)
        self.assertEqual(properties["groups"]["type"], "array")
        detail = schema["paths"]["/api/incidents/{incident_id}"]["get"]
        self.assertIn("404", detail["responses"])

    async def test_exported_schema_matches_live_openapi(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "openapi.json"
            export_schema(path)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), app.openapi())
        self.assertEqual(
            json.loads((PROJECT_DIR / "openapi.json").read_text(encoding="utf-8")),
            app.openapi(),
        )
