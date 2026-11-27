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
    policy_version: Literal["starter-v1"] = Field(
        default="starter-v1",
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

    if profile.current_runs_per_week == 0:
        session_count = min(2, len(profile.available_days))
        session_cap = min(15, profile.max_session_minutes)
        weekly_minutes = session_count * session_cap
        title = "Easy walk / jog"
    else:
        weekly_minutes = profile.current_weekly_minutes
        session_count = min(profile.current_runs_per_week, len(profile.available_days), weekly_minutes)
        session_cap = min(profile.max_session_minutes, profile.longest_recent_run_minutes)
        title = "Easy run" if profile.experience == "regular" else "Easy run / walk"

    selected_days = choose_running_days(profile.available_days, session_count)
    allocation = allocate_running_minutes(weekly_minutes, session_count, session_cap)

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
                    title=title,
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

    goal_notes = {
        "start-running": "This week gives you time to practise getting out for a run.",
        "consistency": "This week focuses on building consistency.",
        "5k": "This week includes easy sessions toward your 5K goal.",
        "10k": "This week includes easy sessions toward your 10K goal.",
    }
    notes = [goal_notes[profile.goal]]
    if not profile.current_runs_per_week:
        notes.append("The session time includes walking. Add short, easy jogs if comfortable.")
    elif profile.experience != "regular":
        notes.append("Walking breaks count toward your session time.")

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
