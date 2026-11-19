from datetime import date, timedelta
from typing import Literal

from app.schemas import (
    PlannedSession,
    RestSession,
    RunningSession,
    TrainingPlan,
)


def get_sample_plan() -> TrainingPlan:
    week_start = date(2026, 11, 16)

    schedule: list[
        tuple[str, int | None, Literal["easy", "steady"]]
    ] = [
        ("Easy", 36, "easy"),
        ("Rest", None, "easy"),
        ("Steady", 40, "steady"),
        ("Rest", None, "easy"),
        ("Easy", 30, "easy"),
        ("Rest", None, "easy"),
        ("Long", 55, "easy"),
    ]

    sessions: list[PlannedSession] = []

    for offset, (title, minutes, effort) in enumerate(schedule):
        session_date = week_start + timedelta(days=offset)
        session_id = f"sample-{session_date.isoformat()}"

        if minutes is None:
            sessions.append(
                RestSession(
                    id=session_id,
                    date=session_date,
                    kind="rest",
                    title=title,
                )
            )
        else:
            sessions.append(
                RunningSession(
                    id=session_id,
                    date=session_date,
                    kind="run",
                    title=title,
                    duration_minutes=minutes,
                    effort=effort,
                )
            )

    return TrainingPlan(
        id="sample-plan-001",
        version=1,
        week_start=week_start,
        source="sample",
        sessions=sessions,
    )