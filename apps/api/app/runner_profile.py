from datetime import date
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


class RunnerProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    experience: Literal["starting", "returning", "regular"]
    goal: Literal["start-running", "consistency", "5k", "10k"]

    race_date: date | None = Field(default=None, alias="raceDate")

    current_runs_per_week: int = Field(
        alias="currentRunsPerWeek",
        ge=0,
        le=7,
        strict=True,
    )
    current_weekly_minutes: int = Field(
        alias="currentWeeklyMinutes",
        ge=0,
        le=10080,
        strict=True,
    )
    longest_recent_run_minutes: int = Field(
        alias="longestRecentRunMinutes",
        ge=0,
        le=1440,
        strict=True,
    )
    available_days: list[Weekday] = Field(
        alias="availableDays",
        min_length=1,
        max_length=7,
    )
    max_session_minutes: int = Field(
        alias="maxSessionMinutes",
        ge=1,
        le=1440,
        strict=True,
    )

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        if len(self.available_days) != len(set(self.available_days)):
            raise ValueError("Available days must not repeat.")

        if self.longest_recent_run_minutes > self.current_weekly_minutes:
            raise ValueError(
                "The longest run cannot exceed the week's total minutes."
            )

        if self.current_runs_per_week == 0:
            if (
                self.current_weekly_minutes != 0
                or self.longest_recent_run_minutes != 0
            ):
                raise ValueError(
                    "With no running days, both duration fields must be zero."
                )
        elif (
            self.current_weekly_minutes == 0
            or self.longest_recent_run_minutes == 0
        ):
            raise ValueError(
                "With running days, both duration fields must be positive."
            )

        if self.race_date is not None and self.goal not in ("5k", "10k"):
            raise ValueError("A race date requires a race goal.")

        return self