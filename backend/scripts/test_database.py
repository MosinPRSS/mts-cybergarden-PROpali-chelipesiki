"""Run all tests against a fresh temporary PostgreSQL database, then remove it."""

import asyncio
import os
import sys
import unittest
from uuid import uuid4

import asyncpg
from sqlalchemy.engine import make_url

from config import PROJECT_DIR, settings


async def manage_database(name: str, *, create: bool) -> None:
    # name is generated here, never accepted from configuration or command input.
    url = make_url(settings.database_url)
    connection = await asyncpg.connect(
        host=url.host, port=url.port or 5432, user=url.username,
        password=url.password, database="postgres", timeout=10,
    )
    try:
        if create:
            await connection.execute(f'CREATE DATABASE "{name}"')
        else:
            await connection.execute(f'DROP DATABASE "{name}" WITH (FORCE)')
    finally:
        await connection.close()


def main() -> int:
    name = "mts_test_" + uuid4().hex[:12]
    asyncio.run(manage_database(name, create=True))
    previous_url = os.environ.get("TEST_DATABASE_URL")
    try:
        url = make_url(settings.database_url).set(database=name)
        os.environ["TEST_DATABASE_URL"] = url.render_as_string(hide_password=False)
        print(f"Testing against temporary database {name}", flush=True)
        suite = unittest.defaultTestLoader.discover(
            str(PROJECT_DIR / "tests"), top_level_dir=str(PROJECT_DIR)
        )
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url
        asyncio.run(manage_database(name, create=False))
        print(f"Removed temporary database {name}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
