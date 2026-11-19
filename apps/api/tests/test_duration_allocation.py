import unittest

from app.planning import allocate_running_minutes


class DurationAllocationTests(unittest.TestCase):
    def test_distributes_minutes_evenly(self):
        result = allocate_running_minutes(120, 3, 45)

        self.assertEqual(result.durations, (40, 40, 40))
        self.assertEqual(result.scheduled_minutes, 120)
        self.assertEqual(result.unallocated_minutes, 0)

    def test_preserves_minutes_when_division_is_not_exact(self):
        result = allocate_running_minutes(122, 3, 45)

        self.assertEqual(result.durations, (40, 41, 41))
        self.assertEqual(result.scheduled_minutes, 122)

    def test_reports_minutes_that_do_not_fit(self):
        result = allocate_running_minutes(120, 3, 30)

        self.assertEqual(result.durations, (30, 30, 30))
        self.assertEqual(result.unallocated_minutes, 30)

    def test_does_not_fill_unused_capacity(self):
        result = allocate_running_minutes(60, 3, 45)

        self.assertEqual(result.durations, (20, 20, 20))
        self.assertEqual(result.scheduled_minutes, 60)

    def test_rejects_invalid_inputs(self):
        cases = [
            (0, 3, 30),
            (2, 3, 30),
            (120, 0, 30),
            (120, 8, 30),
            (120, 3, 0),
            (120, 3, -10),
            (120.5, 3, 45),
            (True, 1, 30),
        ]

        for arguments in cases:
            with self.subTest(arguments=arguments):
                with self.assertRaises(ValueError):
                    allocate_running_minutes(*arguments)

    def test_allocation_invariants_across_many_inputs(self):
        for sessions in range(1, 8):
            for cap in (1, 15, 30, 45, 70):
                for budget in (sessions, 60, 120, 181):
                    with self.subTest(
                        sessions=sessions,
                        cap=cap,
                        budget=budget,
                    ):
                        result = allocate_running_minutes(
                            budget, sessions, cap
                        )

                        self.assertEqual(len(result.durations), sessions)
                        self.assertTrue(
                            all(1 <= minutes <= cap
                                for minutes in result.durations)
                        )
                        self.assertEqual(
                            result.scheduled_minutes,
                            min(budget, sessions * cap),
                        )
                        self.assertEqual(
                            result.scheduled_minutes
                            + result.unallocated_minutes,
                            budget,
                        )
                        self.assertLessEqual(
                            max(result.durations) - min(result.durations),
                            1,
                        )


if __name__ == "__main__":
    unittest.main()