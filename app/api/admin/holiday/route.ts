import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { date } = await req.json();

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 1. Get all currently active subscriptions
    const { data: activeSubs, error: fetchError } = await sb
      .from("subscriptions")
      .select("id")
      .eq("status", "Active");

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!activeSubs || activeSubs.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const subIds = activeSubs.map(s => s.id);

    // 2. Set pause_start and pause_end to the selected date
    const { error: updateError } = await sb
      .from("subscriptions")
      .update({
        pause_start: date,
        pause_end: date
      })
      .in("id", subIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 3. Log the system action
    await sb.from("system_logs").insert([
      {
        action_type: "HOLIDAY_MARKED",
        description: `Marked holiday for ${activeSubs.length} subscriptions on ${date}`,
        actor: "system",
      },
    ]);

    return NextResponse.json({ count: activeSubs.length });
  } catch (error) {
    console.error("Holiday API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
