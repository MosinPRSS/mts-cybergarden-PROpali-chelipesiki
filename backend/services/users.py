"""Install the five initial accounts without changing existing credentials."""
import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from config import PROJECT_DIR
from models import User

DEFAULT_USERS_PATH = PROJECT_DIR / "fixtures" / "default_users.json"


async def seed_default_users(session: AsyncSession, *, fixture_path: Path = DEFAULT_USERS_PATH) -> int:
    users = json.loads(fixture_path.read_text(encoding="utf-8"))
    logins = [user["login"] for user in users]
    existing = set((await session.scalars(
        select(func.lower(User.login)).where(func.lower(User.login).in_(logins))
    )).all())
    missing = [user for user in users if user["login"] not in existing]
    if not missing:
        return 0
    result = await session.scalars(
        insert(User).values(missing).on_conflict_do_nothing(index_elements=[User.login]).returning(User.id)
    )
    return len(result.all())
