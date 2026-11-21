"""Import the original ITSM export; never create accounts from source employees."""

import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import func, select

from config import PROJECT_DIR
from core.db import AsyncSessionLocal, engine
from services.incidents import import_incidents
from models import LegacyIncident
from services.users import seed_default_users

FIXTURE_PATH = PROJECT_DIR / "fixtures" / "character_problems.json"


async def seed_data(session, *, fixture_path: Path = FIXTURE_PATH):
    records = json.loads(fixture_path.read_text(encoding="utf-8-sig"))
    return await import_incidents(session, records)


async def main(path: Path = FIXTURE_PATH) -> None:
    try:
        async with AsyncSessionLocal.begin() as session:
            result = await seed_data(session, fixture_path=path)
            result["users_created"] = await seed_default_users(session)
            result["legacy_incidents_preserved"] = await session.scalar(
                select(func.count()).select_from(LegacyIncident)
            )
        print(json.dumps(result))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=FIXTURE_PATH)
    args = parser.parse_args()
    asyncio.run(main(args.path))
