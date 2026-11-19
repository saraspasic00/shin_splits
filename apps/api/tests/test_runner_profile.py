import unittest

from pydantic import ValidationError

from app.runner_profile import RunnerProfile


def example_profile(**changes):
    return {
        "experience": "regular",
        "goal": "consistency",
        "currentRunsPerWeek": 3,
        "currentWeeklyMinutes": 120,
        "longestRecentRunMinutes": 45,
        "availableDays": ["tue", "wed", "thu"],
        "maxSessionMinutes": 70,
        **changes,
    }


class RunnerProfileTests(unittest.TestCase):
    def test_accepts_frontend_payload(self):
        profile = RunnerProfile.model_validate(example_profile())

        self.assertEqual(profile.current_weekly_minutes, 120)
        self.assertEqual(profile.available_days, ["tue", "wed", "thu"])

        output = profile.model_dump(by_alias=True, mode="json")
        self.assertEqual(output["maxSessionMinutes"], 70)

    def test_accepts_beginner_without_running_history(self):
        profile = RunnerProfile.model_validate(
            example_profile(
                experience="starting",
                goal="start-running",
                currentRunsPerWeek=0,
                currentWeeklyMinutes=0,
                longestRecentRunMinutes=0,
            )
        )

        self.assertEqual(profile.current_weekly_minutes, 0)

    def test_rejects_invalid_answers(self):
        cases = [
            ("negative duration", {"currentWeeklyMinutes": -10}),
            ("numeric string", {"currentWeeklyMinutes": "120"}),
            ("boolean duration", {"currentWeeklyMinutes": True}),
            ("duplicate days", {"availableDays": ["tue", "tue"]}),
            ("no available days", {"availableDays": []}),
            ("longest exceeds total", {"longestRecentRunMinutes": 121}),
            ("minutes without runs", {"currentRunsPerWeek": 0}),
            ("runs without minutes", {
                "currentWeeklyMinutes": 0,
                "longestRecentRunMinutes": 0,
            }),
            ("race date without race goal", {"raceDate": "2030-05-10"}),
            ("unexpected field", {"inventedField": "unexpected"}),
        ]

        for label, changes in cases:
            with self.subTest(case=label):
                with self.assertRaises(ValidationError):
                    RunnerProfile.model_validate(example_profile(**changes))


if __name__ == "__main__":
    unittest.main()