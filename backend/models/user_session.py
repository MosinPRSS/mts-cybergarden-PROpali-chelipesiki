from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db import Base
from models.user import User


class UserSession(Base):
    __tablename__ = "user_sessions"

    # Only a SHA-256 digest is stored; the random session secret stays in a cookie.
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    user: Mapped[User] = relationship(lazy="joined")
