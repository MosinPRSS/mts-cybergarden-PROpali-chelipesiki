import atexit
import asyncio
import copy
import json
import pathlib
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import AsyncMock, patch

import grpc
import requests

ROOT = pathlib.Path(__file__).resolve().parents[2]
GENERATED = tempfile.TemporaryDirectory(prefix="mts-ai-tests-")
atexit.register(GENERATED.cleanup)
subprocess.run([
    sys.executable, "-m", "grpc_tools.protoc", "-I", str(ROOT / "proto"),
    f"--python_out={GENERATED.name}", f"--grpc_python_out={GENERATED.name}",
    str(ROOT / "proto/generate.proto"),
], check=True, capture_output=True)
sys.path[:0] = [GENERATED.name, str(ROOT / "ai")]

import generate_pb2 as pb
from deepseek import DeepSeekClient, DeepSeekConfig, DeepSeekError
from summary import IncidentSummaryService, build_messages, build_response, validate_request


def make_request(with_context=True):
    request = pb.GenerateIncidentSummaryRequest()
    request.as_of.FromJsonString("2026-11-21T12:00:00Z")
    target = request.incident
    target.id = "INC-TEST-1"
    target.sys_id = "179413934903718013"
    target.header = "Недоступна авторизация"
    target.state_enum = pb.INCIDENT_STATE_WORK_IN_PROGRESS
    target.priority_id = 3
    target.urgency_id = 2
    target.impact_id = 2
    target.service_type_id = 30
    target.submit_date.FromJsonString("2026-11-21T10:00:00Z")
    target.updated_at.FromJsonString("2026-11-21T11:00:00Z")
    if with_context:
        related = request.related_incidents.add()
        related.incident.CopyFrom(target)
        related.incident.id = "INC-TEST-0"
        related.incident.submit_date.FromJsonString("2026-11-20T10:00:00Z")
        related.relations.add(
            kind=pb.RELATION_KIND_PREVIOUS_SIMILAR_INCIDENT,
            explanation="Ранее наблюдались те же симптомы",
        )
    return request


def make_result(with_context=True):
    return {
        "incident_id": "INC-TEST-1",
        "summary": "Нарушена авторизация; инцидент в работе.",
        "related_incidents_used": ([{
            "incident_id": "INC-TEST-0", "contribution": "Ранее были похожие симптомы.",
        }] if with_context else []),
        "limitations": ["Причина текущей проблемы не установлена."],
    }


def http_response(status=200, content=None, finish_reason="stop"):
    response = requests.Response()
    response.status_code = status
    response._content = json.dumps({
        "choices": [{"finish_reason": finish_reason, "message": {
            "content": json.dumps(make_result(), ensure_ascii=False) if content is None else content,
        }}],
    }).encode()
    response._content_consumed = True
    return response


class ContractTests(unittest.TestCase):
    def test_snapshot_preserves_ids_and_null_false_distinction(self):
        request = make_request()
        validate_request(request)
        data = json.loads(build_messages(request)[1]["content"])
        self.assertEqual(data["incident"]["sys_id"], "179413934903718013")
        self.assertNotIn("deadline", data["incident"])
        self.assertNotIn("is_need_up", data["incident"])
        self.assertIs(data["incident"]["is_double"], False)
        request.incident.is_need_up = False
        data = json.loads(build_messages(request)[1]["content"])
        self.assertIs(data["incident"]["is_need_up"], False)

    def test_valid_response_uses_server_metadata(self):
        request = make_request()
        response = build_response(request, make_result())
        self.assertEqual(response.incident_id, request.incident.id)
        self.assertEqual(response.incident_updated_at, request.incident.updated_at)
        self.assertTrue(response.HasField("generated_at"))
        self.assertEqual(response.related_incidents_used[0].incident_id, "INC-TEST-0")

    def test_no_context_is_valid(self):
        request = make_request(False)
        validate_request(request)
        response = build_response(request, make_result(False))
        self.assertFalse(response.related_incidents_used)

    def test_invalid_input_is_rejected(self):
        mutations = [
            lambda r: r.ClearField("incident"),
            lambda r: r.ClearField("as_of"),
            lambda r: r.incident.ClearField("submit_date"),
            lambda r: r.incident.ClearField("updated_at"),
            lambda r: setattr(r.incident, "id", " "),
            lambda r: setattr(r.incident, "state_enum", 99),
            lambda r: setattr(r.incident, "priority_id", 0),
            lambda r: setattr(r.incident, "service_type_id", 0),
            lambda r: setattr(r.incident.deadline, "nanos", -1),
            lambda r: r.incident.submit_date.FromJsonString("2026-11-22T00:00:00Z"),
            lambda r: setattr(r.related_incidents[0].incident, "id", r.incident.id),
            lambda r: r.related_incidents[0].ClearField("relations"),
            lambda r: setattr(r.related_incidents[0].relations[0], "kind", 99),
            lambda r: setattr(r.related_incidents[0].relations[0], "explanation", ""),
            lambda r: setattr(r.related_incidents[0].relations[0], "similarity_score", float("nan")),
            lambda r: setattr(r.related_incidents[0].relations[0], "similarity_score", 2),
            lambda r: r.related_incidents[0].incident.submit_date.CopyFrom(r.incident.submit_date),
            lambda r: r.related_incidents.extend([r.related_incidents[0]] * 10),
        ]
        for i, mutate in enumerate(mutations):
            with self.subTest(case=i):
                request = make_request()
                mutate(request)
                with self.assertRaises(ValueError):
                    validate_request(request)

    def test_hallucinated_or_malformed_output_is_rejected(self):
        variants = []
        for key, value in (
            ("incident_id", "ANOTHER-INCIDENT"), ("summary", " "),
            ("summary", 123), ("limitations", "not a list"),
            ("limitations", [None]), ("related_incidents_used", [{}]),
            ("related_incidents_used", [{"incident_id": "UNKNOWN", "contribution": "Unknown"}]),
            ("related_incidents_used", [make_result()["related_incidents_used"][0]] * 2),
            ("related_incidents_used", [{"incident_id": "INC-TEST-0", "contribution": ""}]),
        ):
            result = copy.deepcopy(make_result())
            result[key] = value
            variants.append(result)
        variants.extend([{}, None, {**make_result(), "extra": "unexpected"}])
        for i, result in enumerate(variants):
            with self.subTest(case=i), self.assertRaises(ValueError):
                build_response(make_request(), result)


class DeepSeekTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = DeepSeekClient(DeepSeekConfig(api_key="test-secret", base_url="https://example.test/v1"))

    async def test_http_contract_without_sdk(self):
        with patch("deepseek.requests.post", return_value=http_response()) as post:
            result = await self.client.complete(build_messages(make_request()))
        self.assertEqual(result, make_result())
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://example.test/v1/chat/completions")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-secret")
        self.assertEqual(kwargs["json"]["response_format"], {"type": "json_object"})
        self.assertEqual(kwargs["json"]["thinking"], {"type": "disabled"})
        self.assertFalse(kwargs["allow_redirects"])
        self.assertEqual(kwargs["timeout"], (5, 60))

    async def test_missing_key_does_not_send_data(self):
        with patch("deepseek.requests.post") as post:
            with self.assertRaises(DeepSeekError) as error:
                await DeepSeekClient(DeepSeekConfig()).complete([])
        self.assertEqual(error.exception.code, grpc.StatusCode.FAILED_PRECONDITION)
        post.assert_not_called()

    async def test_provider_http_errors_are_mapped(self):
        statuses = {
            401: grpc.StatusCode.FAILED_PRECONDITION,
            403: grpc.StatusCode.FAILED_PRECONDITION,
            402: grpc.StatusCode.RESOURCE_EXHAUSTED,
            429: grpc.StatusCode.RESOURCE_EXHAUSTED,
            422: grpc.StatusCode.FAILED_PRECONDITION,
            302: grpc.StatusCode.FAILED_PRECONDITION,
            500: grpc.StatusCode.UNAVAILABLE,
            503: grpc.StatusCode.UNAVAILABLE,
            504: grpc.StatusCode.DEADLINE_EXCEEDED,
        }
        for status, expected in statuses.items():
            with self.subTest(status=status), patch("deepseek.requests.post", return_value=http_response(status)):
                with self.assertRaises(DeepSeekError) as error:
                    await self.client.complete([])
                self.assertEqual(error.exception.code, expected)

    async def test_network_errors_do_not_leak_details(self):
        for failure, code in (
            (requests.Timeout("test-secret"), grpc.StatusCode.DEADLINE_EXCEEDED),
            (requests.ConnectionError("test-secret"), grpc.StatusCode.UNAVAILABLE),
        ):
            with self.subTest(code=code), patch("deepseek.requests.post", side_effect=failure):
                with self.assertRaises(DeepSeekError) as error:
                    await self.client.complete([])
                self.assertEqual(error.exception.code, code)
                self.assertNotIn("test-secret", str(error.exception))

    async def test_blank_or_non_json_or_incomplete_content_is_rejected(self):
        for content, finish, code in (
            (" ", "stop", grpc.StatusCode.DATA_LOSS),
            ("not json", "stop", grpc.StatusCode.DATA_LOSS),
            ("[]", "stop", grpc.StatusCode.DATA_LOSS),
            ("{}", "length", grpc.StatusCode.RESOURCE_EXHAUSTED),
            ("{}", "content_filter", grpc.StatusCode.DATA_LOSS),
        ):
            with self.subTest(content=content, finish=finish):
                with patch("deepseek.requests.post", return_value=http_response(content=content, finish_reason=finish)):
                    with self.assertRaises(DeepSeekError) as error:
                        await self.client.complete([])
                    self.assertEqual(error.exception.code, code)

    async def test_requests_runs_off_event_loop(self):
        main_thread = threading.get_ident()
        release = threading.Event()
        loop = asyncio.get_running_loop()

        def slow_post(*args, **kwargs):
            self.assertNotEqual(threading.get_ident(), main_thread)
            if not release.wait(timeout=1):
                raise AssertionError("Event loop was blocked")
            return http_response()

        timer = loop.call_later(0.02, release.set)
        try:
            with patch("deepseek.requests.post", side_effect=slow_post):
                self.assertEqual(await self.client.complete([]), make_result())
        finally:
            release.set()
            timer.cancel()

    async def test_rpc_deadline_limits_wait_for_http(self):
        release = threading.Event()

        def slow_post(*args, **kwargs):
            release.wait(timeout=1)
            return http_response()

        try:
            with patch("deepseek.requests.post", side_effect=slow_post):
                with self.assertRaises(DeepSeekError) as error:
                    await self.client.complete([], timeout=0.01)
                self.assertEqual(error.exception.code, grpc.StatusCode.DEADLINE_EXCEEDED)
        finally:
            release.set()

    def test_configuration_validates_values_and_hides_key(self):
        self.assertNotIn("test-secret", repr(self.client.config))
        for kwargs in (
            {"base_url": "file:///tmp/key"}, {"model": " "},
            {"timeout_seconds": 0}, {"timeout_seconds": float("nan")},
            {"max_tokens": 0},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                DeepSeekConfig(**kwargs)


class Abort(Exception):
    def __init__(self, code, details):
        self.code = code
        self.details = details


class FakeContext:
    def time_remaining(self):
        return 30

    async def abort(self, code, details):
        raise Abort(code, details)


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_successful_service_returns_single_target(self):
        client = AsyncMock()
        client.complete.return_value = make_result()
        response = await IncidentSummaryService(client).GenerateIncidentSummary(make_request(), FakeContext())
        self.assertEqual(response.incident_id, "INC-TEST-1")
        self.assertEqual(response.related_incidents_used[0].incident_id, "INC-TEST-0")
        self.assertEqual(client.complete.call_args.kwargs["timeout"], 30)

    async def test_invalid_input_does_not_call_provider(self):
        client = AsyncMock()
        with self.assertRaises(Abort) as error:
            await IncidentSummaryService(client).GenerateIncidentSummary(pb.GenerateIncidentSummaryRequest(), FakeContext())
        self.assertEqual(error.exception.code, grpc.StatusCode.INVALID_ARGUMENT)
        client.complete.assert_not_awaited()

    async def test_provider_error_becomes_rpc_status(self):
        client = AsyncMock()
        client.complete.side_effect = DeepSeekError(grpc.StatusCode.UNAVAILABLE, "Provider unavailable")
        with self.assertLogs("summary", level="WARNING") as logs:
            with self.assertRaises(Abort) as error:
                await IncidentSummaryService(client).GenerateIncidentSummary(make_request(), FakeContext())
        self.assertEqual(error.exception.code, grpc.StatusCode.UNAVAILABLE)
        self.assertNotIn("INC-TEST", " ".join(logs.output))

    async def test_hallucinated_reference_becomes_data_loss(self):
        client = AsyncMock()
        client.complete.return_value = {**make_result(), "incident_id": "OTHER"}
        with self.assertRaises(Abort) as error:
            await IncidentSummaryService(client).GenerateIncidentSummary(make_request(), FakeContext())
        self.assertEqual(error.exception.code, grpc.StatusCode.DATA_LOSS)


if __name__ == "__main__":
    unittest.main()
