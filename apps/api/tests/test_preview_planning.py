import unittest

from app.plan_preview import (
    PlanPreviewRequest,
    PreviewReady,
    PreviewUnavailable,
    build_plan_preview,
)


def make_request(**changes):
    profile = {
        "experience": "regular",
        "goal": "consistency",
        "currentRunsPerWeek": 3,
        "currentWeeklyMinutes": 120,
        "longestRecentRunMinutes": 45,
        "availableDays": ["tue", "wed", "thu"],
        "maxSessionMinutes": 70,
        **changes,
    }

    return PlanPreviewRequest.model_validate({
        "weekStart": "2026-11-23",
        "profile": profile,
    })


class PlanPreviewTests(unittest.TestCase):
    def test_builds_seven_days_from_profile(self):
        result = build_plan_preview(make_request())

        self.assertIsInstance(result, PreviewReady)
        self.assertEqual(len(result.plan.sessions), 7)

        runs = [
            session
            for session in result.plan.sessions
            if session.kind == "run"
        ]

        self.assertEqual(
            [session.date.weekday() for session in runs],
            [1, 2, 3],
        )
        self.assertEqual(
            [session.duration_minutes for session in runs],
            [40, 40, 40],
        )
        self.assertTrue(
            any("consecutive" in note for note in result.notes)
        )

    def test_caps_duration_and_explains_reduction(self):
        result = build_plan_preview(
            make_request(maxSessionMinutes=30)
        )

        self.assertIsInstance(result, PreviewReady)

        total = sum(
            session.duration_minutes
            for session in result.plan.sessions
            if session.kind == "run"
        )

        self.assertEqual(total, 90)
        self.assertTrue(
            any("30 baseline minutes" in note for note in result.notes)
        )

    def test_every_experience_and_goal_receives_a_starter_week(self):
        for experience in ("starting", "returning", "regular"):
            for goal in ("start-running", "consistency", "5k", "10k"):
                for count, minutes, longest in [(0, 0, 0), (3, 90, 35)]:
                    with self.subTest(experience=experience, goal=goal, baseline=count):
                        result = build_plan_preview(make_request(
                            experience=experience, goal=goal,
                            currentRunsPerWeek=count, currentWeeklyMinutes=minutes,
                            longestRecentRunMinutes=longest, maxSessionMinutes=8,
                        ))
                        self.assertIsInstance(result, PreviewReady)
                        self.assertEqual(len(result.plan.sessions), 7)
                        runs = [s for s in result.plan.sessions if s.kind == "run"]
                        self.assertEqual(len(runs), 3 if count else 2)
                        self.assertTrue(all(s.duration_minutes == 8 for s in runs))
                        self.assertTrue(all(s.date.weekday() in (1, 2, 3) for s in runs))

    def test_requests_review_of_contradictory_baseline(self):
        result = build_plan_preview(
            make_request(currentWeeklyMinutes=150)
        )

        self.assertIsInstance(result, PreviewUnavailable)
        self.assertEqual(result.status, "needs_review")

    def test_response_uses_frontend_field_names(self):
        result = build_plan_preview(make_request())
        output = result.model_dump(mode="json", by_alias=True)

        self.assertEqual(output["policyVersion"], "starter-v1")
        self.assertFalse(output["persisted"])
        self.assertEqual(output["plan"]["weekStart"], "2026-11-23")

        tuesday = output["plan"]["sessions"][1]
        self.assertEqual(tuesday["durationMinutes"], 40)


if __name__ == "__main__":
    unittest.main()