import asyncio
import unittest
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from ai_proto import generate_pb2 as pb
from domain.incidents import IncidentState
from services.dashboard_summary import incident_snapshot
from services.incident_summary import IncidentSummaryService, related_context
from tests.test_dashboard_summary import make_incident, NOW


class IncidentSummaryTests(unittest.IsolatedAsyncioTestCase):
    def test_analogues_prefer_similar_resolved_cases_and_do_not_link_by_id_alone(self):
        target = make_incident()
        target.header = target.short_description = target.description = "Недоступность авторизации ошибка токена"
        solved = make_incident("solved")
        solved.header = solved.short_description = solved.description = target.description
        solved.submit_date = target.submit_date - timedelta(days=1)
        solved.state_enum = IncidentState.RESOLVED
        solved.state_id = 7
        solved.solution = "Обновили сертификат"
        unrelated = make_incident("unrelated")
        unrelated.header = unrelated.short_description = unrelated.description = "Плановая замена дисков хранилища"
        unrelated.product_name = "Другой продукт с тем же ID"
        unrelated.service = "Совсем другой сервис"
        contexts = related_context(target, [target, unrelated, solved])
        self.assertEqual([item.incident.id for item in contexts], ["solved"])
        self.assertIn(pb.RELATION_KIND_PREVIOUS_SIMILAR_INCIDENT, [item.kind for item in contexts[0].relations])
        self.assertEqual(related_context(target, [make_incident(str(i)) for i in range(12)]), [])

    async def test_cache_coalesces_and_invalidates_when_context_changes(self):
        target = make_incident()
        request = pb.GenerateIncidentSummaryRequest(incident=incident_snapshot(target))
        request.as_of.FromDatetime(NOW)
        context = make_incident("context")
        context.state_enum = IncidentState.RESOLVED
        context.solution = "Обновили сертификат"
        related = related_context(target, [context])[0]
        request.related_incidents.add().CopyFrom(related)

        async def generate(sent):
            result = pb.GenerateIncidentSummaryResponse(incident_id=target.id, summary="Ошибка авторизации.", next_step="Уточните ход восстановления.",
                incident_updated_at=sent.incident.updated_at)
            result.generated_at.FromDatetime(NOW)
            return result

        service = IncidentSummaryService()
        with patch("services.incident_summary.generate_incident_summary", new=AsyncMock(side_effect=generate)) as rpc:
            await asyncio.gather(service.summarize(request), service.summarize(request))
            request.as_of.FromDatetime(NOW + timedelta(seconds=30))
            await service.summarize(request)
            self.assertEqual(rpc.await_count, 1)
            request.related_incidents[0].incident.updated_at.FromDatetime(NOW + timedelta(seconds=1))
            await service.summarize(request)
            self.assertEqual(rpc.await_count, 2)

    async def test_wrong_version_or_fabricated_context_is_rejected(self):
        request = pb.GenerateIncidentSummaryRequest(incident=incident_snapshot(make_incident()))
        request.as_of.FromDatetime(NOW)
        result = pb.GenerateIncidentSummaryResponse(incident_id=request.incident.id, summary="Обзор")
        result.generated_at.FromDatetime(NOW)
        with patch("services.incident_summary.generate_incident_summary", new=AsyncMock(return_value=result)):
            with self.assertRaises(ValueError):
                await IncidentSummaryService().summarize(request)
        result.incident_updated_at.CopyFrom(request.incident.updated_at)
        result.related_incidents_used.add(incident_id="fabricated", contribution="Причина")
        with patch("services.incident_summary.generate_incident_summary", new=AsyncMock(return_value=result)):
            with self.assertRaises(ValueError):
                await IncidentSummaryService().summarize(request)
