import unittest

from app.planning import choose_running_days


class ChooseRunningDaysTests(unittest.TestCase):
    def test_spaces_sessions_within_available_days(self):
        result = choose_running_days(["tue", "wed", "thu"], 2)

        self.assertEqual(result, ["tue", "thu"])

    def test_handles_availability_that_requires_consecutive_days(self):
        result = choose_running_days(["tue", "wed", "thu"], 3)

        self.assertEqual(result, ["tue", "wed", "thu"])

    def test_spreads_three_sessions_across_a_full_week(self):
        result = choose_running_days(
            ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
            3,
        )

        self.assertEqual(result, ["mon", "wed", "fri"])

    def test_considers_sunday_to_monday_gap(self):
        result = choose_running_days(["mon", "thu", "sun"], 2)

        # Sunday and Monday are adjacent across the week boundary.
        self.assertEqual(result, ["mon", "thu"])

    def test_input_order_does_not_change_schedule(self):
        result = choose_running_days(["thu", "tue", "wed"], 2)

        self.assertEqual(result, ["tue", "thu"])

    def test_supports_one_available_day(self):
        self.assertEqual(
            choose_running_days(["sat"], 1),
            ["sat"],
        )

    def test_rejects_impossible_session_count(self):
        with self.assertRaises(ValueError):
            choose_running_days(["tue", "thu"], 3)

    def test_rejects_duplicate_days(self):
        with self.assertRaises(ValueError):
            choose_running_days(["tue", "tue"], 2)


if __name__ == "__main__":
    unittest.main()