import { timingSafeEqual, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ensureWeek } from "@/lib/ensure-week";
import { getNextWeekStart } from "@/lib/saved-plan";

const digest = (s: string) => createHash("sha256").update(s).digest();
export async function POST(request: Request) {
  const secret = process.env.WEEKLY_JOB_SECRET;
  if (!secret || !timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest("Bearer " + secret)))
    return new Response(null, { status: 401 });
  const after = new URL(request.url).searchParams.get("after");
  if (after && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(after))
    return new Response(null, { status: 400 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const week = getNextWeekStart();
  let query = db.from("runner_profiles").select("user_id").order("user_id").limit(5);
  if (after) query = query.gt("user_id", after);
  const { data, error } = await query;
  if (error || !data) return new Response(null, { status: 503 });
  const results = await Promise.allSettled(data.map(row => ensureWeek(db,row.user_id,week)));
  return Response.json({ after: data.length === 5 ? data[data.length-1].user_id : null,
    failed: results.filter(r => r.status === "rejected").length,
    created: results.filter(r => r.status === "fulfilled" && r.value === "created").length });
}
