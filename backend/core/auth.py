import hashlib
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyCookie
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.db import get_db
from models.user_session import UserSession
from models.user import User, UserRole

COOKIE_NAME = "mts_session"
cookie_scheme = APIKeyCookie(name=COOKIE_NAME, auto_error=False)
AuthDatabase = Annotated[AsyncSession, Depends(get_db, scope="function")]
COORDINATOR_ACCESS_MESSAGE = "Доступ к сервису разрешён только координаторам"


def ensure_coordinator(user: User) -> None:
    if user.role != UserRole.COORDINATOR:
        raise HTTPException(403, COORDINATOR_ACCESS_MESSAGE)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_request_origin(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("origin")
    if origin:
        if origin not in settings.CORS_ORIGINS and origin != str(request.base_url).rstrip("/"):
            raise HTTPException(403, "Источник запроса не разрешён")


async def get_current_session(
    request: Request, db: AuthDatabase,
    token: Annotated[str | None, Security(cookie_scheme)],
) -> UserSession:
    verify_request_origin(request)
    if not token or len(token) > 128:
        raise HTTPException(401, "Войдите в аккаунт")
    session = await db.scalar(select(UserSession).where(UserSession.token_hash == token_digest(token)))
    if session is None or session.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, "Сессия истекла. Войдите снова")
    ensure_coordinator(session.user)
    return session


CurrentSession = Annotated[UserSession, Depends(get_current_session)]


async def require_operator(session: CurrentSession) -> None:
    ensure_coordinator(session.user)
