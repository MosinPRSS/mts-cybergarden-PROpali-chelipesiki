import json
import unittest

from tests.helpers import ASGIConnection


class IncidentAPIContracts(unittest.IsolatedAsyncioTestCase):
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
