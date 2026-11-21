from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    login: str = Field(min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_.@+\-]+$")
    password: str = Field(min_length=1, max_length=128, repr=False)

    @field_validator("login", mode="before")
    @classmethod
    def normalize_login(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class UserResponse(BaseModel):
    id: int
    login: str
    full_name: str
    role: Literal["coordinator"]
