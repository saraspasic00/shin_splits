// Calendar dates use YYYY-MM-DD.
// TypeScript documents this convention; the API will validate it at runtime.
export type CalendarDate = string;

export type RunningSession = {
  id: string;
  date: CalendarDate;
  kind: "run";
  title: string;
  durationMinutes: number;
  effort: "easy" | "steady";
};

export type RestSession = {
  id: string;
  date: CalendarDate;
  kind: "rest";
  title: string;
};

export type PlannedSession = RunningSession | RestSession;

export type TrainingPlan = {
  id: string;
  version: number;
  weekStart: CalendarDate;
  source: "sample" | "baseline" | "llm";
  sessions: PlannedSession[];
};

export type EnergyLevel = "low" | "okay" | "good";
export type SleepQuality = "poor" | "okay" | "good";

// This records what someone reports, not an inferred cycle phase.
export type PeriodLog = {
  bleeding?: "none" | "spotting" | "light" | "medium" | "heavy";
  symptoms?: Array<"cramps" | "headache" | "bloating">;
};

export type DailyCheckIn = {
  date: CalendarDate;
  energy: EnergyLevel;
  sleep: SleepQuality;
  periodLog?: PeriodLog;
};