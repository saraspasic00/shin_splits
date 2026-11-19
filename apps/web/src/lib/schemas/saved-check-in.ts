import { z } from "zod";
import { checkInRequestSchema } from "@/lib/schemas/check-in";

export const savedCheckInReceiptSchema = z.strictObject({
  status: z.literal("saved"),
  persisted: z.literal(true),
  checkIn: checkInRequestSchema,
});

export type SavedCheckIn = z.infer<typeof checkInRequestSchema>;