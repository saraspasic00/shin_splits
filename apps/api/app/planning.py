from itertools import combinations
from dataclasses import dataclass
from app.runner_profile import Weekday


WEEKDAYS: tuple[Weekday, ...] = (
    "mon", "tue", "wed", "thu", "fri", "sat", "sun"
)


def choose_running_days(
    available_days: list[Weekday],
    session_count: int,
) -> list[Weekday]:
    """Choose available days with the most balanced weekly spacing."""

    if not available_days:
        raise ValueError("At least one available day is required.")

    if len(set(available_days)) != len(available_days):
        raise ValueError("Available days must not repeat.")

    if any(day not in WEEKDAYS for day in available_days):
        raise ValueError("Unknown weekday.")

    if not 1 <= session_count <= len(available_days):
        raise ValueError(
            "Session count must fit the number of available days."
        )

    # Calendar order makes the result independent of checkbox/input order.
    available_indexes = tuple(
        index
        for index, day in enumerate(WEEKDAYS)
        if day in available_days
    )

    def spacing_score(days: tuple[int, ...]) -> tuple[int, ...]:
        gaps = [
            days[index + 1] - days[index]
            for index in range(len(days) - 1)
        ]

        # Include the gap into the next week.
        gaps.append(days[0] + 7 - days[-1])

        # Maximize the smallest gap first, then the next smallest.
        return tuple(sorted(gaps))

    candidates = combinations(available_indexes, session_count)
    selected = max(candidates, key=spacing_score)

    return [WEEKDAYS[index] for index in selected]
@dataclass(frozen=True)
class DurationAllocation:
    durations: tuple[int, ...]
    requested_minutes: int

    @property
    def scheduled_minutes(self) -> int:
        return sum(self.durations)

    @property
    def unallocated_minutes(self) -> int:
        return self.requested_minutes - self.scheduled_minutes


def allocate_running_minutes(
    weekly_minutes: int,
    session_count: int,
    session_cap_minutes: int,
) -> DurationAllocation:
    """Distribute a time budget evenly without exceeding the session cap."""

    values = (weekly_minutes, session_count, session_cap_minutes)

    if any(type(value) is not int for value in values):
        raise ValueError("Duration allocation requires whole-number inputs.")

    if not 1 <= session_count <= 7:
        raise ValueError("Session count must be between one and seven.")

    if session_cap_minutes < 1:
        raise ValueError("The session cap must be positive.")

    if weekly_minutes < session_count:
        raise ValueError(
            "The time budget must allow at least one minute per session."
        )

    capacity = session_count * session_cap_minutes
    scheduled_minutes = min(weekly_minutes, capacity)

    minutes_per_session, remainder = divmod(
        scheduled_minutes,
        session_count,
    )

    # Any leftover minutes go to the last sessions.
    durations = tuple(
        minutes_per_session + (
            1 if index >= session_count - remainder else 0
        )
        for index in range(session_count)
    )

    return DurationAllocation(
        durations=durations,
        requested_minutes=weekly_minutes,
    )