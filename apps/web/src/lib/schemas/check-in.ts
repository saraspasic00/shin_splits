import { z } from "zod";

export const checkInRequestSchema = z.strictObject({
  date: z.iso.date(),
  energy: z.enum(["low", "okay", "good"]),
  sleep: z.enum(["poor", "okay", "good"]),
});

export const checkInReceiptSchema = z.strictObject({
  status: z.literal("received"),
  persisted: z.literal(false),
  date: z.iso.date(),
});