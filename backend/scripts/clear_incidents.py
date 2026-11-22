"""Script to remove all incidents and related actions from the database."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, select

from core.db import AsyncSessionLocal, engine
from models import Incident, IncidentAction, LegacyIncident


async def count_records(session) -> dict[str, int]:
    return {
        "incidents": (await session.scalar(select(func.count()).select_from(Incident))) or 0,
        "legacy_incidents": (await session.scalar(select(func.count()).select_from(LegacyIncident))) or 0,
        "incident_actions": (await session.scalar(select(func.count()).select_from(IncidentAction))) or 0,
    }


async def clear_database(
    *,
    clear_canonical: bool = True,
    clear_legacy: bool = True,
    clear_actions: bool = True,
) -> dict[str, int]:
    result: dict[str, int] = {}
    async with AsyncSessionLocal.begin() as session:
        if clear_actions:
            del_actions = await session.execute(delete(IncidentAction))
            result["incident_actions"] = del_actions.rowcount or 0
        else:
            result["incident_actions"] = 0

        if clear_canonical:
            del_incidents = await session.execute(delete(Incident))
            result["incidents"] = del_incidents.rowcount or 0
        else:
            result["incidents"] = 0

        if clear_legacy:
            del_legacy = await session.execute(delete(LegacyIncident))
            result["legacy_incidents"] = del_legacy.rowcount or 0
        else:
            result["legacy_incidents"] = 0

    return result


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-y", "--yes", "--force",
        action="store_true",
        dest="yes",
        help="Не запрашивать подтверждение перед удалением",
    )
    parser.add_argument(
        "--keep-actions",
        action="store_true",
        help="Сохранить историю действий над инцидентами (incident_actions)",
    )
    parser.add_argument(
        "--keep-legacy",
        action="store_true",
        help="Сохранить архивные/демо инциденты (legacy_incidents)",
    )
    parser.add_argument(
        "--only-canonical",
        action="store_true",
        help="Удалить только основные инциденты (incidents)",
    )
    parser.add_argument(
        "--only-legacy",
        action="store_true",
        help="Удалить только архивные/демо инциденты (legacy_incidents)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Вывести результат в формате JSON",
    )
    args = parser.parse_args()

    clear_canonical = not args.only_legacy
    clear_legacy = not args.only_canonical and not args.keep_legacy
    clear_actions = not args.only_legacy and not args.keep_actions

    try:
        async with AsyncSessionLocal() as session:
            counts = await count_records(session)

        total_to_delete = (
            (counts["incidents"] if clear_canonical else 0)
            + (counts["legacy_incidents"] if clear_legacy else 0)
            + (counts["incident_actions"] if clear_actions else 0)
        )

        if not args.yes and sys.stdin.isatty():
            print("Текущее состояние базы данных:")
            print(f"  - Основные инциденты (incidents): {counts['incidents']}")
            print(f"  - Архивные/демо инциденты (legacy_incidents): {counts['legacy_incidents']}")
            print(f"  - История действий (incident_actions): {counts['incident_actions']}")
            if total_to_delete == 0:
                print("\nНет инцидентов для удаления.")
                return 0

            confirm = input("\nВы уверены, что хотите удалить указанные данные? [y/N]: ").strip().lower()
            if confirm not in ("y", "yes", "да", "д"):
                print("Операция отменена.")
                return 1

        deleted = await clear_database(
            clear_canonical=clear_canonical,
            clear_legacy=clear_legacy,
            clear_actions=clear_actions,
        )

        if args.json:
            print(json.dumps(deleted, ensure_ascii=False, indent=2))
        else:
            print("Очистка успешно завершена:")
            if clear_canonical:
                print(f"  - Удалено основных инцидентов (incidents): {deleted['incidents']}")
            if clear_legacy:
                print(f"  - Удалено архивных/демо инцидентов (legacy_incidents): {deleted['legacy_incidents']}")
            if clear_actions:
                print(f"  - Удалено записей действий (incident_actions): {deleted['incident_actions']}")
        return 0
    finally:
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
