"""Export the live API contract for Swagger Editor and other OpenAPI tools."""

import json
from pathlib import Path

from config import PROJECT_DIR
from main import app


def export_schema(path: Path = PROJECT_DIR / "openapi.json") -> None:
    path.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    export_schema()
    print("Exported openapi.json")
