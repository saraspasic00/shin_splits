from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
    )


class RunningSession(APIModel):
    id: str
    date: date
    kind: Literal["run"]
    title: str
    duration_minutes: int = Field(
        alias="durationMinutes",
        gt=0,
        strict=True,
    )
    effort: Literal["easy", "steady"]


class RestSession(APIModel):
    id: str
    date: date
    kind: Literal["rest"]
    title: str


PlannedSession = Annotated[
    RunningSession | RestSession,
    Field(discriminator="kind"),
]


class TrainingPlan(APIModel):
    id: str
    version: int = Field(ge=1, strict=True)
    week_start: date = Field(alias="weekStart")
    source: Literal["sample", "baseline", "llm"]
    sessions: list[PlannedSession]

class CheckInRequest(APIModel):
    date: date
    energy: Literal["low", "okay", "good"]
    sleep: Literal["poor", "okay", "good"]


class CheckInReceipt(APIModel):
    status: Literal["received"]
    persisted: Literal[False]
    date: date