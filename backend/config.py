from pathlib import Path
from secrets import token_urlsafe

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

PROJECT_DIR = Path(__file__).resolve().parent


class Setup(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR.parent / ".env", PROJECT_DIR / ".env"),
        extra="ignore", populate_by_name=True,
    )
    DATABASE_URL: str | None = Field(
        default=None, validation_alias=AliasChoices("DATABASE_URL", "DB_URL"), repr=False
    )
    POSTGRES_DB: str = "mts_incidents"
    POSTGRES_USER: str = "mts"
    POSTGRES_PASSWORD: str = Field(default="", repr=False)
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432
    SECRET_KEY: str = Field(default_factory=lambda: token_urlsafe(32), repr=False)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    AUTH_COOKIE_SECURE: bool = False
    AI_GRPC_TARGET: str = "ai:50051"
    AI_SUMMARY_TIMEOUT_SECONDS: float = Field(default=65, gt=0, le=120)
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            url = make_url(self.DATABASE_URL)
            if url.drivername in ("postgres", "postgresql"):
                url = url.set(drivername="postgresql+asyncpg")
            if url.drivername != "postgresql+asyncpg":
                raise ValueError("DATABASE_URL must use PostgreSQL with the asyncpg driver")
        else:
            url = URL.create(
                "postgresql+asyncpg", username=self.POSTGRES_USER,
                password=self.POSTGRES_PASSWORD, host=self.POSTGRES_HOST,
                port=self.POSTGRES_PORT, database=self.POSTGRES_DB,
            )
        return url.render_as_string(hide_password=False)


settings = Setup()
