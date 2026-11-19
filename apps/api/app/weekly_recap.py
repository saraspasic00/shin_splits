"""Week-level facts for one saved plan. Inputs use the web app's mapped log shape."""
from datetime import date, timedelta
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class Session(BaseModel):
    id: UUID
    date: date
    kind: Literal["run", "rest"]
    durationMinutes: int | None = Field(default=None, strict=True, ge=1)


class Plan(BaseModel):
    id: UUID
    version: int = Field(strict=True, ge=1)
    weekStart: date
    sessions: list[Session] = Field(min_length=7, max_length=7)

    @model_validator(mode="after")
    def validate_week(self) -> Self:
        expected = {self.weekStart + timedelta(days=i) for i in range(7)}
        if self.weekStart.weekday() != 0 or {s.date for s in self.sessions} != expected:
            raise ValueError("Expected one session per day of a Monday-start week")
        if len({s.id for s in self.sessions}) != 7:
            raise ValueError("Session IDs must be unique")
        if any(s.kind == "run" and s.durationMinutes is None for s in self.sessions):
            raise ValueError("A run needs planned minutes")
        return self


class Feedback(BaseModel):
    status: Literal["completed", "skipped"]
    completedOn: date | None
    actualMinutes: int | None = Field(strict=True, ge=1, le=1440)

    @model_validator(mode="after")
    def validate_outcome(self) -> Self:
        completed = self.status == "completed"
        if (self.completedOn is not None) != completed or (self.actualMinutes is not None) != completed:
            raise ValueError("Only completed feedback carries a run date and actual minutes")
        return self


class Log(BaseModel):
    planId: UUID
    planVersion: int = Field(strict=True, ge=1)
    sessionId: UUID
    feedback: Feedback


class WeekFacts(BaseModel):
    week_start: date
    as_of: date
    planned_runs: int
    planned_minutes: int
    completed_runs: int
    recorded_minutes: int
    skipped_runs: int
    past_without_feedback: int
    due_today: int
    upcoming_runs: int


def summarize_week(plan: Plan, logs: list[Log], *, today: date) -> WeekFacts:
    """today is the runner's local calendar date. Summarize latest known feedback."""
    runs = {s.id: s for s in plan.sessions if s.kind == "run"}
    feedback = {}
    for log in logs:
        if (log.planId, log.planVersion) != (plan.id, plan.version):
            continue
        if log.sessionId not in runs or log.sessionId in feedback:
            raise ValueError("Expected at most one log per scheduled run")
        if log.feedback.completedOn and log.feedback.completedOn > today:
            raise ValueError("A completed run cannot have a future actual date")
        feedback[log.sessionId] = log.feedback

    unlogged = [s.date for s in runs.values() if s.id not in feedback]
    return WeekFacts(
        week_start=plan.weekStart, as_of=today, planned_runs=len(runs),
        planned_minutes=sum(s.durationMinutes for s in runs.values() if s.durationMinutes is not None),
        completed_runs=sum(f.status == "completed" for f in feedback.values()),
        recorded_minutes=sum(f.actualMinutes for f in feedback.values() if f.actualMinutes is not None),
        skipped_runs=sum(f.status == "skipped" for f in feedback.values()),
        past_without_feedback=sum(d < today for d in unlogged),
        due_today=sum(d == today for d in unlogged),
        upcoming_runs=sum(d > today for d in unlogged),
    )
