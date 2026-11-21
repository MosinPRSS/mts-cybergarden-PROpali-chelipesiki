import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from sqlalchemy import select, text
from sqlalchemy.engine import Connection

from alembic import command
from alembic.config import Config
from core.db import AsyncSessionLocal, engine
from core.sse_manager import sse_manager
from models import Incident
from routers.incidents import router as incidents_router
from routers.sse import router as sse_router
from schemas.incidents import HealthResponse


def apply_migrations(connection: Connection) -> None:
    config_path = Path(__file__).resolve().parent / "alembic.ini"
    config = Config(str(config_path))
    config.attributes["connection"] = connection

    command.upgrade(config, "head")


async def periodic_cleanup_task():
    """Фоновая очистка на уровне SQL решённых инцидентов старше 3 дней."""
    while True:
        try:
            await asyncio.sleep(60)
            async with AsyncSessionLocal() as session:
                deleted = 0
                try:
                    res = await session.execute(text("SELECT delete_expired_resolved_incidents()"))
                    deleted = res.scalar() or 0
                    await session.commit()
                except Exception:
                    await session.rollback()
                if deleted > 0:
                    all_incidents = await session.scalars(
                        select(Incident).order_by(Incident.submit_date.desc(), Incident.id)
                    )
                    full_snapshot = [inc.to_dict() for inc in all_incidents.unique().all()]
                    await sse_manager.broadcast_all(full_snapshot)
        except asyncio.CancelledError:
            break
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_task = None
    try:
        async with engine.begin() as connection:
            await connection.run_sync(apply_migrations)

        cleanup_task = asyncio.create_task(periodic_cleanup_task())
        yield  # Миграции завершены — API начинает обслуживать запросы.
    finally:
        if cleanup_task:
            cleanup_task.cancel()
        sse_manager.close_all()
        await engine.dispose()


app = FastAPI(
    title="API",
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
app.include_router(incidents_router)


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
