from datetime import date, timedelta
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.planning import (
    WEEKDAYS,
    allocate_running_minutes,
    choose_running_days,
)
from app.runner_profile import RunnerProfile
from app.schemas import RestSession, RunningSession, TrainingPlan


class PreviewModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PlanPreviewRequest(PreviewModel):
    profile: RunnerProfile
    week_start: date = Field(alias="weekStart")

    @model_validator(mode="after")
    def check_week_start(self) -> Self:
        if self.week_start.weekday() != 0:
            raise ValueError("The preview week must start on a Monday.")
        return self


class PreviewReady(PreviewModel):
    status: Literal["preview"] = "preview"
    policy_version: Literal["consistency-v1"] = Field(
        default="consistency-v1",
        alias="policyVersion",
    )
    persisted: Literal[False] = False
    plan: TrainingPlan
    notes: list[str]


class PreviewUnavailable(PreviewModel):
    status: Literal["unsupported", "needs_review"]
    message: str


PlanPreviewResponse = Annotated[
    PreviewReady | PreviewUnavailable,
    Field(discriminator="status"),
]


def build_plan_preview(
    request: PlanPreviewRequest,
) -> PreviewReady | PreviewUnavailable:
    profile = request.profile

    if (
        profile.experience != "regular"
        or profile.goal != "consistency"
        or profile.current_runs_per_week == 0
    ):
        return PreviewUnavailable(
            status="unsupported",
            message=(
                "This preview currently supports regular runners "
                "building consistency with a non-zero running baseline. "
                "Beginner, returning-runner, and race plans are coming later."
            ),
        )

    # All three baseline answers describe the same historical week.
    maximum_possible_total = (
        profile.current_runs_per_week
        * profile.longest_recent_run_minutes
    )

    if profile.current_weekly_minutes > maximum_possible_total:
        return PreviewUnavailable(
            status="needs_review",
            message=(
                "Your weekly minutes exceed the number of runs multiplied "
                "by your longest run. Check that all three answers describe "
                "the same week."
            ),
        )

    session_count = min(
        profile.current_runs_per_week,
        len(profile.available_days),
    )

    selected_days = choose_running_days(
        profile.available_days,
        session_count,
    )

    session_cap = min(
        profile.max_session_minutes,
        profile.longest_recent_run_minutes,
    )

    allocation = allocate_running_minutes(
        weekly_minutes=profile.current_weekly_minutes,
        session_count=session_count,
        session_cap_minutes=session_cap,
    )

    minutes_by_day = dict(
        zip(selected_days, allocation.durations, strict=True)
    )

    sessions: list[RunningSession | RestSession] = []

    for index, weekday in enumerate(WEEKDAYS):
        session_date = request.week_start + timedelta(days=index)
        session_id = f"preview-{session_date.isoformat()}"

        if weekday in minutes_by_day:
            sessions.append(
                RunningSession(
                    id=session_id,
                    date=session_date,
                    kind="run",
                    title="Easy run",
                    durationMinutes=minutes_by_day[weekday],
                    effort="easy",
                )
            )
        else:
            sessions.append(
                RestSession(
                    id=session_id,
                    date=session_date,
                    kind="rest",
                    title="Rest day",
                )
            )

    notes = [
        "This first-week plan focuses on building consistency.",
        (
            "Minutes are distributed evenly. This version does not "
            "prescribe pace or progressive overload."
        ),
    ]

    if allocation.unallocated_minutes:
        notes.append(
            f"{allocation.unallocated_minutes} baseline minutes were not "
            "scheduled because of the available days and session caps."
        )

    selected_indexes = {
        WEEKDAYS.index(day) for day in selected_days
    }

    has_adjacent_days = any(
        (index + 1) % 7 in selected_indexes
        for index in selected_indexes
    )

    if has_adjacent_days:
        notes.append(
            "The selected schedule includes consecutive running days, "
            "counting the Sunday-to-Monday boundary if repeated."
        )

    plan = TrainingPlan(
        id=f"preview-{request.week_start.isoformat()}",
        version=1,
        weekStart=request.week_start,
        source="baseline",
        sessions=sessions,
    )

    return PreviewReady(plan=plan, notes=notes)