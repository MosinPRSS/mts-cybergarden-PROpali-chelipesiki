from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current_session
from core.db import get_db
from schemas.summary import DashboardSummary
from services.dashboard_summary import dashboard_summary_service, priority_query

router = APIRouter(prefix="/api/incidents", tags=["incidents"], dependencies=[Depends(get_current_session)])


@router.get("/summary", response_model=DashboardSummary, summary="ИИ-обзор приоритетных инцидентов")
async def dashboard_summary(db: Annotated[AsyncSession, Depends(get_db)]):
    as_of = datetime.now(timezone.utc)
    incidents = list((await db.scalars(priority_query(as_of))).all())
    # Detach the snapshots and release the DB connection before provider latency.
    db.expunge_all()
    await db.rollback()
    return await dashboard_summary_service.summarize(incidents, as_of)
