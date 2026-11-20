"""
FastAPI entry point for the MTS Incident Command backend.

Endpoints:
  GET  /health                 → health check
  POST /api/register           → user registration
  POST /api/auth               → login → JWT token
  GET  /api/incidents          → incidents JSON
  GET  /api/incidents/stream   → SSE live stream
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from core.config import settings
from core.database import engine, Base
from routers import auth, incidents as incidents_router
from routers.incidents import _watch_incidents

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables if they don't exist yet
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables ready")
    except Exception as exc:
        logger.warning("Database connection failed or tables skipped: %s", exc)

    # Start background file watcher for incidents.json
    watcher_task = asyncio.create_task(_watch_incidents())
    logger.info("Incidents file watcher started")

    yield

    watcher_task.cancel()
    try:
        await watcher_task
    except asyncio.CancelledError:
        pass
    try:
        await engine.dispose()
    except Exception:
        pass
    logger.info("Shutdown complete")


app = FastAPI(
    title="Incident Command API",
    version="2.0.0",
    description="MTS Incident Command Dashboard Backend",
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(incidents_router.router)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "version": "2.0.0"}


# ─── Static dashboard (serves index.html etc.) ───────────────────────────────
_dashboard_dir = Path(__file__).parent / "dashboard"
if _dashboard_dir.exists():
    app.mount("/dashboard", StaticFiles(directory=str(_dashboard_dir), html=True), name="dashboard")


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/dashboard/")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, app_dir=str(Path(__file__).parent))

