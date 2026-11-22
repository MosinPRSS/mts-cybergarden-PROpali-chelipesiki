from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

ShortText = Annotated[str, Field(min_length=1, max_length=80)]


class TeamCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    domain: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=600)
    services: list[ShortText] = Field(min_length=1, max_length=20)
    skills: list[ShortText] = Field(min_length=1, max_length=20)


class TeamRecommendationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    teams: list[TeamCandidate] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def unique_candidates(self):
        if (len({team.id for team in self.teams}) != len(self.teams)
                or len({team.name.casefold() for team in self.teams}) != len(self.teams)
                or any(team.id == "coordinators" for team in self.teams)):
            raise ValueError("Expected unique execution teams")
        return self


class RecommendedTeam(BaseModel):
    id: str
    name: str


class TeamFitCriteria(BaseModel):
    product_service: int = Field(ge=0, le=100)
    technical_skills: int = Field(ge=0, le=100)
    responsibility: int = Field(ge=0, le=100)


class TeamRecommendation(BaseModel):
    incident_id: str
    team: RecommendedTeam | None
    match_percent: int = Field(ge=0, le=100)
    reason: str = Field(min_length=1, max_length=120)
    criteria: TeamFitCriteria
    generated_at: datetime
    incident_updated_at: datetime
