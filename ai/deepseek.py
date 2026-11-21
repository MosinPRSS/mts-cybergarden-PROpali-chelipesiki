import asyncio
import json
import math
import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import grpc
import requests


@dataclass(frozen=True)
class DeepSeekConfig:
    api_key: str = field(default="", repr=False)
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-flash"
    timeout_seconds: float = 60
    max_tokens: int = 2048

    def __post_init__(self):
        url = urlsplit(self.base_url)
        if url.scheme not in {"http", "https"} or not url.netloc or url.query or url.fragment or url.username:
            raise ValueError("DEEPSEEK_BASE_URL must be an HTTP(S) base URL")
        if not self.model.strip():
            raise ValueError("DEEPSEEK_MODEL must not be empty")
        if not math.isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("DEEPSEEK_TIMEOUT_SECONDS must be positive and finite")
        if not 1 <= self.max_tokens <= 16384:
            raise ValueError("DEEPSEEK_MAX_TOKENS must be between 1 and 16384")

    @classmethod
    def from_env(cls):
        return cls(
            api_key=os.environ.get("DEEPSEEK_API_KEY", "").strip(),
            base_url=os.environ.get("DEEPSEEK_BASE_URL", cls.base_url).rstrip("/"),
            model=os.environ.get("DEEPSEEK_MODEL", cls.model),
            timeout_seconds=float(os.environ.get("DEEPSEEK_TIMEOUT_SECONDS", "60")),
            max_tokens=int(os.environ.get("DEEPSEEK_MAX_TOKENS", "2048")),
        )


class DeepSeekError(Exception):
    def __init__(self, code: grpc.StatusCode, message: str):
        super().__init__(message)
        self.code = code


class DeepSeekClient:
    def __init__(self, config: DeepSeekConfig):
        self.config = config

    async def complete(self, messages: list[dict], timeout: float | None = None) -> dict:
        if not self.config.api_key:
            raise DeepSeekError(grpc.StatusCode.FAILED_PRECONDITION, "DEEPSEEK_API_KEY is not configured")
        budget = self.config.timeout_seconds
        if timeout is not None:
            budget = min(budget, timeout)
        if budget <= 0:
            raise DeepSeekError(grpc.StatusCode.DEADLINE_EXCEEDED, "Summary deadline exceeded")
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(self._complete, messages, budget), timeout=budget
            )
        except TimeoutError:
            raise DeepSeekError(grpc.StatusCode.DEADLINE_EXCEEDED, "DeepSeek request timed out") from None

    def _complete(self, messages: list[dict], timeout: float) -> dict:
        payload = {
            "model": self.config.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "thinking": {"type": "disabled"},
            "max_tokens": self.config.max_tokens,
            "stream": False,
        }
        try:
            with requests.post(
                self.config.base_url.rstrip("/") + "/chat/completions",
                headers={"Authorization": f"Bearer {self.config.api_key}"},
                json=payload,
                timeout=(min(5.0, timeout), timeout),
                allow_redirects=False,
            ) as response:
                self._check_status(response.status_code)
                try:
                    data = response.json()
                    choice = data["choices"][0]
                    if choice["finish_reason"] == "length":
                        raise DeepSeekError(grpc.StatusCode.RESOURCE_EXHAUSTED, "DeepSeek output token limit reached")
                    if choice["finish_reason"] != "stop":
                        raise ValueError("Incomplete completion")
                    content = choice["message"]["content"]
                    if not isinstance(content, str) or not content.strip():
                        raise ValueError("Empty completion")
                    result = json.loads(content)
                    if not isinstance(result, dict):
                        raise ValueError("Expected JSON object")
                    return result
                except (ValueError, KeyError, IndexError, TypeError):
                    raise DeepSeekError(grpc.StatusCode.DATA_LOSS, "DeepSeek returned an invalid JSON completion") from None
        except requests.Timeout:
            raise DeepSeekError(grpc.StatusCode.DEADLINE_EXCEEDED, "DeepSeek request timed out") from None
        except requests.RequestException:
            raise DeepSeekError(grpc.StatusCode.UNAVAILABLE, "DeepSeek is unavailable") from None

    @staticmethod
    def _check_status(status: int):
        if status == 200:
            return
        if status in (401, 403):
            code, message = grpc.StatusCode.FAILED_PRECONDITION, "DeepSeek authentication failed; check DEEPSEEK_API_KEY"
        elif status == 402:
            code, message = grpc.StatusCode.RESOURCE_EXHAUSTED, "DeepSeek account balance is insufficient"
        elif status in (413, 429):
            code, message = grpc.StatusCode.RESOURCE_EXHAUSTED, "DeepSeek request size or rate limit reached"
        elif status in (408, 504):
            code, message = grpc.StatusCode.DEADLINE_EXCEEDED, "DeepSeek request timed out"
        elif 300 <= status < 500:
            code, message = grpc.StatusCode.FAILED_PRECONDITION, "DeepSeek rejected the request; check endpoint, model and parameters"
        else:
            code, message = grpc.StatusCode.UNAVAILABLE, "DeepSeek is unavailable"
        raise DeepSeekError(code, message)
