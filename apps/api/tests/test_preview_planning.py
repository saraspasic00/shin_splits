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

    def test_does_not_invent_a_beginner_plan(self):
        result = build_plan_preview(
            make_request(
                experience="starting",
                goal="start-running",
                currentRunsPerWeek=0,
                currentWeeklyMinutes=0,
                longestRecentRunMinutes=0,
            )
        )

        self.assertIsInstance(result, PreviewUnavailable)
        self.assertEqual(result.status, "unsupported")

    def test_requests_review_of_contradictory_baseline(self):
        result = build_plan_preview(
            make_request(currentWeeklyMinutes=150)
        )

        self.assertIsInstance(result, PreviewUnavailable)
        self.assertEqual(result.status, "needs_review")

    def test_response_uses_frontend_field_names(self):
        result = build_plan_preview(make_request())
        output = result.model_dump(mode="json", by_alias=True)

        self.assertEqual(output["policyVersion"], "consistency-v1")
        self.assertFalse(output["persisted"])
        self.assertEqual(output["plan"]["weekStart"], "2026-11-23")

        tuesday = output["plan"]["sessions"][1]
        self.assertEqual(tuesday["durationMinutes"], 40)


if __name__ == "__main__":
    unittest.main()