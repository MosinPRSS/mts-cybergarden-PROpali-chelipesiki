# models/models.py
import enum
from typing import Optional
from sqlalchemy import (
    String,
    Integer,
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column
from core.db import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"                    # Администратор системы
    COORDINATOR = "coordinator"        # ИТ-Координатор (управляет инцидентами)
    ENGINEER = "engineer"              # Инженер дежурной смены
    OBSERVER = "observer"              # Наблюдатель (только чтение)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    pass_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    surname: Mapped[str] = mapped_column(String(100), nullable=False)
    middlename: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Роль пользователя с использованием Enum
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(
            UserRole, name="user_role_enum", native_enum=False,
            values_callable=lambda roles: [role.value for role in roles],
            create_constraint=True,
        ),
        default=UserRole.ENGINEER,
        nullable=False,
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "login": self.login,
            "full_name": f"{self.surname} {self.name}" + (f" {self.middlename}" if self.middlename else ""),
            "role": self.role.value,
        }
