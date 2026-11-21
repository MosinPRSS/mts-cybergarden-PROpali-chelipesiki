import json
import unittest
from pathlib import Path

from pydantic import ValidationError
from schemas.incidents import IncidentCreate

from tests.helpers import ASGIConnection


class IncidentAPIContracts(unittest.IsolatedAsyncioTestCase):
    def test_post_accepts_all_original_records_and_validates_state_pairs(self):
        records = json.loads((Path(__file__).resolve().parents[1] / "fixtures/character_problems.json").read_text())
        for record in records:
            with self.subTest(id=record["id"]):
                parsed = IncidentCreate.model_validate(record)
                self.assertEqual(parsed.id, record["id"])
                self.assertIsNone(parsed.waiting_exit_date)
        with self.assertRaises(ValidationError):
            IncidentCreate.model_validate({**records[0], "stateId": 99})

    async def test_incident_and_source_routes_are_documented(self):
        async with ASGIConnection("/openapi.json") as client:
            status, _, body = await client.response()
        self.assertEqual(status, 200)
        paths = json.loads(body)["paths"]
        self.assertIn("get", paths["/api/incidents"])
        self.assertIn("get", paths["/api/incidents/{incident_id}"])
        self.assertIn("get", paths["/api/incidents/{incident_id}/source"])

    async def test_attention_groups_are_computed_and_not_manually_editable(self):
        async with ASGIConnection("/openapi.json") as client:
            _, _, body = await client.response()
        paths = json.loads(body)["paths"]
        self.assertNotIn("/api/incidents/{incident_id}/groups", paths)
        self.assertNotIn("/api/incidents/{incident_id}/groups/{group_name}", paths)
