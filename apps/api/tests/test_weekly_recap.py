import unittest
from datetime import date, timedelta
from uuid import uuid4

from app.weekly_recap import Plan, Log, summarize_week


class WeeklyRecapTests(unittest.TestCase):
    def setUp(self):
        self.start = date(2026, 11, 23)
        self.plan = Plan.model_validate(dict(id=uuid4(), version=1, weekStart=self.start,
            sessions=[dict(id=uuid4(), date=self.start + timedelta(days=i),
                kind="run" if i < 4 else "rest", durationMinutes=40 if i < 4 else None)
                for i in range(7)]))

    def log(self, day, minutes=None, version=1):
        return Log.model_validate(dict(planId=self.plan.id, planVersion=version,
            sessionId=self.plan.sessions[day].id, feedback=dict(
                status="skipped" if minutes is None else "completed", actualMinutes=minutes,
                completedOn=None if minutes is None else self.plan.sessions[day].date)))

    def test_finished_week(self):
        result = summarize_week(self.plan, [self.log(0, 30), self.log(1, 35), self.log(2)],
                                today=self.start + timedelta(days=7))
        self.assertEqual(result.model_dump(exclude={"as_of","week_start"}), dict(
            planned_runs=4, planned_minutes=160, completed_runs=2, recorded_minutes=65,
            skipped_runs=1, past_without_feedback=1, due_today=0, upcoming_runs=0))

    def test_future_week(self):
        facts = summarize_week(self.plan, [], today=self.start - timedelta(days=5))
        self.assertEqual((facts.upcoming_runs, facts.past_without_feedback), (4, 0))

    def test_midweek_and_early_skip(self):
        facts = summarize_week(self.plan, [self.log(3), self.log(0, 20, version=2)],
                               today=self.start + timedelta(days=1))
        self.assertEqual((facts.past_without_feedback, facts.due_today, facts.upcoming_runs,
                          facts.skipped_runs, facts.completed_runs), (1, 1, 1, 1, 0))

    def test_duplicate_rejected(self):
        with self.assertRaises(ValueError):
            summarize_week(self.plan, [self.log(0, 30)] * 2, today=self.start)

    def test_future_completion_rejected(self):
        with self.assertRaises(ValueError):
            summarize_week(self.plan, [self.log(1, 30)], today=self.start)
