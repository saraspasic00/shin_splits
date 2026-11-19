import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { checkInRequestSchema } from "@/lib/schemas/check-in";
import { savedCheckInReceiptSchema } from "@/lib/schemas/saved-check-in";

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return reply({ message: "Request origin not allowed." }, 403);
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return reply(
        { message: "Sign in before saving your check-in." },
        401,
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return reply(
        { message: "The request must contain valid JSON." },
        400,
      );
    }

    const input = checkInRequestSchema.safeParse(body);

    if (!input.success) {
      return reply(
        { message: "Check the date, energy, and sleep values." },
        422,
      );
    }

    const { data, error } = await supabase
      .from("check_ins")
      .upsert(
        {
          user_id: user.id,
          date: input.data.date,
          energy: input.data.energy,
          sleep: input.data.sleep,
        },
        { onConflict: "user_id,date" },
      )
      .select("date, energy, sleep")
      .single();

    if (error) {
      return reply(
        { message: "We couldn’t confirm the save. Please try again." },
        500,
      );
    }

    const receipt = savedCheckInReceiptSchema.safeParse({
      status: "saved",
      persisted: true,
      checkIn: data,
    });

    if (
      !receipt.success ||
      receipt.data.checkIn.date !== input.data.date ||
      receipt.data.checkIn.energy !== input.data.energy ||
      receipt.data.checkIn.sleep !== input.data.sleep
    ) {
      return reply(
        { message: "We couldn’t verify the saved check-in. Please reload." },
        502,
      );
    }

    revalidatePath("/");

    return reply(receipt.data);
  } catch {
    return reply(
      { message: "We couldn’t confirm the save. Please reload to check." },
      503,
    );
  }
}