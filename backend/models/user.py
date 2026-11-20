from sqlalchemy import Column, Integer, String
from core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    login = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    surname = Column(String, nullable=False)
    middlename = Column(String, nullable=True)
    pass_hash = Column(String, nullable=False)
