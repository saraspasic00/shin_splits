import type { TrainingPlan } from "@/types/training";

export const samplePlan = {
  id: "sample-plan-001",
  version: 1,
  weekStart: "2026-11-16",
  source: "sample",
  sessions: [
    {
      id: "sample-mon",
      date: "2026-11-16",
      kind: "run",
      title: "Easy",
      durationMinutes: 35,
      effort: "easy",
    },
    {
      id: "sample-tue",
      date: "2026-11-17",
      kind: "rest",
      title: "Rest",
    },
    {
      id: "sample-wed",
      date: "2026-11-18",
      kind: "run",
      title: "Steady",
      durationMinutes: 40,
      effort: "steady",
    },
    {
      id: "sample-thu",
      date: "2026-11-19",
      kind: "rest",
      title: "Rest",
    },
    {
      id: "sample-fri",
      date: "2026-11-20",
      kind: "run",
      title: "Easy",
      durationMinutes: 30,
      effort: "easy",
    },
    {
      id: "sample-sat",
      date: "2026-11-21",
      kind: "rest",
      title: "Rest",
    },
    {
      id: "sample-sun",
      date: "2026-11-22",
      kind: "run",
      title: "Long",
      durationMinutes: 55,
      effort: "easy",
    },
  ],
} satisfies TrainingPlan;