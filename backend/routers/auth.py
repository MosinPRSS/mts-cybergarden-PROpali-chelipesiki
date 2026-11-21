from collections import OrderedDict, deque
from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from starlette.concurrency import run_in_threadpool

from config import settings
from core.auth import AuthDatabase, COOKIE_NAME, CurrentSession, ensure_coordinator, token_digest, verify_request_origin
from core.security import hash_password, verify_password
from core.sse_manager import sse_manager
from models import User
from models.user_session import UserSession
from schemas.auth import LoginRequest, UserResponse

# Bound password hashing work for the single-worker deployment.
_attempts: OrderedDict[str, deque] = OrderedDict()
_dummy_hash = hash_password(token_urlsafe(32))


async def limit_auth_attempts(request: Request):
    verify_request_origin(request)
    key = request.client.host if request.client else "unknown"
    now = monotonic()
    attempts = _attempts.setdefault(key, deque())
    _attempts.move_to_end(key)
    while attempts and now - attempts[0] >= 60:
        attempts.popleft()
    if len(attempts) >= 20:
        raise HTTPException(429, "Слишком много попыток. Повторите через минуту", headers={"Retry-After": "60"})
    attempts.append(now)
    if len(_attempts) > 10000:
        _attempts.popitem(last=False)


router = APIRouter(prefix="/api/auth", tags=["auth"])


async def start_session(user: User, request: Request, response: Response, db: AuthDatabase):
    now = datetime.now(timezone.utc)
    old_token = request.cookies.get(COOKIE_NAME)
    await db.execute(delete(UserSession).where(UserSession.expires_at <= now))
    if old_token:
        await db.execute(delete(UserSession).where(UserSession.token_hash == token_digest(old_token)))
    token = token_urlsafe(32)
    db.add(UserSession(token_hash=token_digest(token), user_id=user.id,
                       expires_at=now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)))
    await db.commit()
    if old_token:
        sse_manager.close_session(token_digest(old_token))
    response.set_cookie(COOKIE_NAME, token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                        httponly=True, secure=settings.AUTH_COOKIE_SECURE or request.url.scheme == "https",
                        samesite="strict", path="/api")
    response.headers["Cache-Control"] = "no-store"
    return user.to_dict()


@router.post("/login", response_model=UserResponse,
             dependencies=[Depends(limit_auth_attempts)], summary="Войти в аккаунт")
async def login(payload: LoginRequest, request: Request, response: Response, db: AuthDatabase):
    user = await db.scalar(select(User).where(func.lower(User.login) == payload.login))
    valid = await run_in_threadpool(verify_password, payload.password, user.pass_hash if user else _dummy_hash)
    if user is None or not valid:
        raise HTTPException(401, "Неверный логин или пароль")
    ensure_coordinator(user)
    return await start_session(user, request, response, db)


@router.get("/me", response_model=UserResponse, summary="Получить текущего пользователя")
async def me(session: CurrentSession, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return session.user.to_dict()


@router.post("/logout", status_code=204, dependencies=[Depends(verify_request_origin)], summary="Выйти из аккаунта")
async def logout(request: Request, response: Response, db: AuthDatabase):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        digest = token_digest(token)
        await db.execute(delete(UserSession).where(UserSession.token_hash == digest))
        await db.commit()
        sse_manager.close_session(digest)
    response.delete_cookie(COOKIE_NAME, path="/api", httponly=True, samesite="strict",
                           secure=settings.AUTH_COOKIE_SECURE or request.url.scheme == "https")
    response.headers["Cache-Control"] = "no-store"
