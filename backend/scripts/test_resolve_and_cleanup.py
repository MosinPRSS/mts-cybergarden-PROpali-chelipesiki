"""Compatibility entry point: verify incident lifecycle in an isolated database.

Resolved incidents are now preserved. This replaces the old destructive manual
check which modified the working database and expected three-day deletion.
"""

from scripts.test_database import main


if __name__ == "__main__":
    raise SystemExit(main())
