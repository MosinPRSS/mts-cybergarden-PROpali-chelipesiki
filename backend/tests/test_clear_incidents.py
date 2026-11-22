import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from scripts.clear_incidents import clear_database, count_records


class ClearIncidentsScriptTests(unittest.IsolatedAsyncioTestCase):
    async def test_count_records(self):
        session = AsyncMock()
        session.scalar.side_effect = [15, 5, 2]
        counts = await count_records(session)
        self.assertEqual(counts, {
            "incidents": 15,
            "legacy_incidents": 5,
            "incident_actions": 2,
        })

    async def test_clear_database_all(self):
        mock_session = AsyncMock()
        res_actions = MagicMock(rowcount=2)
        res_incidents = MagicMock(rowcount=10)
        res_legacy = MagicMock(rowcount=3)
        mock_session.execute.side_effect = [res_actions, res_incidents, res_legacy]

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_session

        with patch("scripts.clear_incidents.AsyncSessionLocal.begin", return_value=mock_context):
            result = await clear_database(clear_canonical=True, clear_legacy=True, clear_actions=True)

        self.assertEqual(result, {
            "incident_actions": 2,
            "incidents": 10,
            "legacy_incidents": 3,
        })
        self.assertEqual(mock_session.execute.call_count, 3)

    async def test_clear_database_selective(self):
        mock_session = AsyncMock()
        res_incidents = MagicMock(rowcount=8)
        mock_session.execute.side_effect = [res_incidents]

        mock_context = AsyncMock()
        mock_context.__aenter__.return_value = mock_session

        with patch("scripts.clear_incidents.AsyncSessionLocal.begin", return_value=mock_context):
            result = await clear_database(clear_canonical=True, clear_legacy=False, clear_actions=False)

        self.assertEqual(result, {
            "incident_actions": 0,
            "incidents": 8,
            "legacy_incidents": 0,
        })
        self.assertEqual(mock_session.execute.call_count, 1)


if __name__ == "__main__":
    unittest.main()
