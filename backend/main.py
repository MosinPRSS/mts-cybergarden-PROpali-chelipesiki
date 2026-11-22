from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from sqlalchemy.engine import Connection

from alembic import command
from alembic.config import Config
from core.db import AsyncSessionLocal, engine
from core.sse_manager import sse_manager
from routers.incidents import router as incidents_router
from routers.auth import router as auth_router
from routers.sse import router as sse_router
from routers.summary import router as summary_router
from schemas.incidents import HealthResponse
from services.users import seed_default_users
from services.incident_changes import watch_incident_changes


def apply_migrations(connection: Connection) -> None:
    config_path = Path(__file__).resolve().parent / "alembic.ini"
    config = Config(str(config_path))
    config.attributes["connection"] = connection

    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as connection:
            await connection.run_sync(apply_migrations)

        async with AsyncSessionLocal.begin() as session:
            await seed_default_users(session)

        async with watch_incident_changes(engine, AsyncSessionLocal):
            yield  # Миграции завершены — API начинает обслуживать запросы.
    finally:
        sse_manager.close_all()
        await engine.dispose()


app = FastAPI(
    title="МТС Incident Command API",
    version="0.2.0",
    docs_url="/docs", redoc_url="/redoc", openapi_url="/openapi.json",
    openapi_tags=[
        {"name": "incidents", "description": "Чтение инцидентов из БД и подписка на обновления."},
        {"name": "system", "description": "Проверка доступности процесса API."},
    ],
    swagger_ui_parameters={"displayRequestDuration": True, "filter": True, "docExpansion": "list"},
    lifespan=lifespan,
)
# Register the static /stream route before /{incident_id}.
app.include_router(sse_router)
app.include_router(summary_router)
app.include_router(incidents_router)
app.include_router(auth_router)


@app.get("/health", tags=["system"], response_model=HealthResponse, summary="Проверить процесс API")
async def health():
    return {"status": "ok"}


@app.get("/swagger", include_in_schema=False)
async def swagger():
    return RedirectResponse(url="/docs")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        app_dir=str(Path(__file__).resolve().parent),
    )
