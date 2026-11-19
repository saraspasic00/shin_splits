import { z } from "zod";

const calendarDate = z.iso.date();
const note = z.string().trim().max(1000);

export const runLogIdentitySchema = z.object({
  planId: z.uuid(),
  planVersion: z.number().int().positive(),
  sessionId: z.uuid(),
});

export const runFeedbackSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("completed"),
    completedOn: calendarDate,
    actualMinutes: z.number().int().min(1).max(1440),
    perceivedEffort: z.number().int().min(1).max(10).nullable(),
    note,
  }),
  z.strictObject({
    status: z.literal("skipped"),
    completedOn: z.null(),
    actualMinutes: z.null(),
    perceivedEffort: z.null(),
    note,
  }),
]);

export const runLogRequestSchema = z.strictObject({
  ...runLogIdentitySchema.shape,
  expectedRevision: z.number().int().min(0),
  feedback: runFeedbackSchema,
});

export const plannedRunSchema = z.object({
  id: z.uuid(),
  date: calendarDate,
  kind: z.literal("run"),
  title: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  effort: z.enum(["easy", "steady"]),
});

export const savedRunLogSchema = z.object({
  ...runLogIdentitySchema.shape,
  id: z.uuid(),
  revision: z.number().int().positive(),
  plannedSession: plannedRunSchema,
  feedback: runFeedbackSchema,
  updatedAt: z.iso.datetime({ offset: true }),
}).refine((log) => log.sessionId === log.plannedSession.id, {
  message: "The session reference does not match the saved snapshot.",
});

export const runLogReceiptSchema = z.object({
  status: z.literal("saved"),
  log: savedRunLogSchema,
});

const rowSchema = z.object({
  id: z.uuid(),
  plan_id: z.uuid(),
  plan_version: z.number().int().positive(),
  session_id: z.uuid(),
  revision: z.number().int().positive(),
  planned_session: plannedRunSchema,
  status: z.enum(["completed", "skipped"]),
  completed_on: calendarDate.nullable(),
  actual_minutes: z.number().int().nullable(),
  perceived_effort: z.number().int().nullable(),
  note: z.string(),
  updated_at: z.iso.datetime({ offset: true }),
});

export function runLogFromRow(value: unknown): SavedRunLog {
  const row = rowSchema.parse(value);
  return savedRunLogSchema.parse({
    id: row.id,
    planId: row.plan_id,
    planVersion: row.plan_version,
    sessionId: row.session_id,
    revision: row.revision,
    plannedSession: row.planned_session,
    feedback: {
      status: row.status,
      completedOn: row.completed_on,
      actualMinutes: row.actual_minutes,
      perceivedEffort: row.perceived_effort,
      note: row.note,
    },
    updatedAt: row.updated_at,
  });
}

export function sameFeedback(left: RunFeedback, right: RunFeedback): boolean {
  return left.status === right.status
    && left.completedOn === right.completedOn
    && left.actualMinutes === right.actualMinutes
    && left.perceivedEffort === right.perceivedEffort
    && left.note === right.note;
}

export type RunLogIdentity = z.infer<typeof runLogIdentitySchema>;
export type RunFeedback = z.infer<typeof runFeedbackSchema>;
export type SavedRunLog = z.infer<typeof savedRunLogSchema>;
export type PlannedRun = z.infer<typeof plannedRunSchema>;
