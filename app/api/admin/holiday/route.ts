import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logShadowMismatch } from "@/lib/rollout";
import { getSupabaseAdmin } from "@/lib/supabase";
import { queueMessage } from "@/app/actions/messaging";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { date } = await req.json();

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const {
      holidaySkipShadowEnabled,
      holidaySkipWriteEnabled,
      whatsappAutomationShadowEnabled,
    } = env.rollout;

    if (holidaySkipShadowEnabled) {
      const [{ count: legacyCount }, { count: projectedCount }] = await Promise.all([
        sb
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("status", ["Active", "Grace"])
          .lte("start_date", date),
        sb
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("status", ["Active", "Grace"])
          .eq("holiday_opt_out", false)
          .lte("start_date", date),
      ]);

      await logShadowMismatch("SHADOW_HOLIDAY_MISMATCH", {
        date,
        legacyCandidateCount: legacyCount ?? 0,
        projectedCandidateCount: projectedCount ?? 0,
      });
    }

    let count: number | null = null;
    let holidayError: { message: string } | null = null;

    if (holidaySkipWriteEnabled) {
      const holidayResult = await sb.rpc("apply_global_holiday_skip_v2", {
        p_target_date: date,
        p_reason: "Festival/Holiday auto-skip",
      });
      count = Number(holidayResult.data ?? 0);
      holidayError = holidayResult.error;
    } else {
      const { data: legacySubscriptions, error: legacyFetchError } = await sb
        .from("subscriptions")
        .select("id")
        .in("status", ["Active", "Grace"])
        .lte("start_date", date);

      if (legacyFetchError) {
        holidayError = { message: legacyFetchError.message };
      } else {
        const ids = (legacySubscriptions ?? []).map((row) => row.id);
        count = ids.length;

        if (ids.length > 0) {
          const legacyUpdate = await sb
            .from("subscriptions")
            .update({ pause_start: date, pause_end: date })
            .in("id", ids);

          if (legacyUpdate.error) {
            holidayError = { message: legacyUpdate.error.message };
          }
        }
      }
    }

    if (holidayError) {
      return NextResponse.json({ error: holidayError.message }, { status: 500 });
    }

    const { data: impactedSubscriptions } = await sb
      .from("subscriptions")
      .select("id, customer_id")
      .eq("pause_start", date)
      .eq("pause_end", date)
      .eq("holiday_opt_out", false);

    if (env.rollout.whatsappAutomationWriteEnabled) {
      await Promise.all(
        (impactedSubscriptions ?? []).map((subscription) =>
          queueMessage({
            subscriptionId: subscription.id,
            customerId: subscription.customer_id,
            eventType: "holiday_skip_notice",
            vars: { date, reason: "festival schedule" },
            referenceKey: `holiday-skip:${subscription.id}:${date}`,
            metadata: { date, source: "holiday-route" },
          })
        )
      );
    } else if (whatsappAutomationShadowEnabled) {
      await logShadowMismatch("SHADOW_MESSAGE_ENQUEUE", {
        feature: "holiday-skip-notice",
        date,
        subscriptionIds: (impactedSubscriptions ?? []).map((subscription) => subscription.id),
      });
    }

    return NextResponse.json({ count: Number(count ?? 0) });
  } catch (error) {
    console.error("Holiday API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
