from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import create_access_token, hash_password, verify_password
from models.user import User
from models.schemas import SignUpRequest, SignInRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new user. Accepts JSON with 'pass' key (Python keyword workaround)."""
    body = await request.json()

    # Map 'pass' → 'pass_'
    login      = body.get("login", "")
    name       = body.get("name", "")
    surname    = body.get("surname", "")
    middlename = body.get("middlename", "")
    password   = body.get("pass", "")

    if not login or not password:
        raise HTTPException(status_code=400, detail="login and pass are required")

    # Check duplicate
    existing = await db.execute(select(User).where(User.login == login))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Login already taken")

    user = User(
        login=login,
        name=name,
        surname=surname,
        middlename=middlename,
        pass_hash=hash_password(password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/auth", response_model=TokenResponse)
async def auth(request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate user, return JWT token."""
    body = await request.json()
    login    = body.get("login", "")
    password = body.get("pass", "")

    result = await db.execute(select(User).where(User.login == login))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.pass_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.login, "id": user.id})
    return TokenResponse(access_token=token)


@router.get("/health")
async def health():
    return {"status": "ok"}
