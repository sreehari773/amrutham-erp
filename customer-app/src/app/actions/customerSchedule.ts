"use server";

import { env } from "@/lib/env";
import { logShadowMismatch } from "@/lib/rollout";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCustomerSession } from "./customerAuth";

const IST_TZ = "Asia/Kolkata";

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function currentIstHourMinute() {
  const hour = Number.parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, hour: "numeric", hour12: false }).format(new Date()),
    10
  );
  const minute = Number.parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: IST_TZ, minute: "numeric" }).format(new Date()),
    10
  );
  return { hour, minute };
}

export async function getUpcomingDeliveries() {
  const customerId = await getCustomerSession();
  if (!customerId) return { error: "Not authenticated" };

  const sb = getSupabaseAdmin();
  const { data: sub } = await sb
    .from("subscriptions")
    .select("id, start_date, pause_start, pause_end, skip_saturday, skip_weekdays, meal_preference")
    .eq("customer_id", customerId)
    .in("status", ["Active", "Grace"])
    .limit(1)
    .single();

  if (!sub) return { data: [] };

  // Fetch all pause history for this sub
  const { data: pauses } = await sb
    .from("pause_history")
    .select("pause_start, pause_end, reason")
    .eq("subscription_id", sub.id);

  return { data: { subscription: sub, pauses: pauses || [] } };
}

export async function pauseDeliveryForDate(targetDateStr: string, isDinner: boolean) {
  const customerId = await getCustomerSession();
  if (!customerId) return { error: "Not authenticated" };
  const { skipAutomationShadowEnabled, skipAutomationWriteEnabled } = env.rollout;

  const today = todayIST();
  const { hour, minute } = currentIstHourMinute();

  if (targetDateStr < today) {
    return { error: "You cannot skip past dates." };
  }

  if (targetDateStr === today) {
    const totalMinutes = hour * 60 + minute;
    if (!isDinner && totalMinutes >= 8 * 60) {
      return { error: "Too late! Lunch skips must be made before 8:00 AM today." };
    }
    if (isDinner && totalMinutes >= 13 * 60) {
      return { error: "Too late! Dinner skips must be made before 1:00 PM today." };
    }
  }

  const sb = getSupabaseAdmin();
  const { data: sub } = await sb
    .from("subscriptions")
    .select("id, start_date, pause_start, pause_end")
    .eq("customer_id", customerId)
    .in("status", ["Active", "Grace"])
    .limit(1)
    .single();

  if (!sub) return { error: "No active subscription found." };

  if (targetDateStr < sub.start_date) {
    return { error: "You cannot skip a date before your subscription starts." };
  }

  const effectivePauseEnd = sub.pause_end ?? sub.pause_start;
  if (
    sub.pause_start &&
    effectivePauseEnd &&
    targetDateStr >= sub.pause_start &&
    targetDateStr <= effectivePauseEnd
  ) {
    return { error: "This delivery date is already skipped or paused." };
  }

  const { error } = await sb.from("pause_history").insert({
    subscription_id: sub.id,
    pause_start: targetDateStr,
    pause_end: targetDateStr,
    reason: "Customer Skipped via Mobile App"
  });

  if (error) return { error: error.message };

  const mergedStart = sub.pause_start && sub.pause_start < targetDateStr ? sub.pause_start : targetDateStr;
  const mergedEnd =
    effectivePauseEnd && effectivePauseEnd > targetDateStr
      ? effectivePauseEnd
      : targetDateStr;

  if (skipAutomationShadowEnabled) {
    await logShadowMismatch("SHADOW_SKIP_MISMATCH", {
      subscriptionId: sub.id,
      customerId,
      targetDate: targetDateStr,
      isDinner,
      legacyWindow: {
        pause_start: sub.pause_start,
        pause_end: sub.pause_end,
      },
      projectedWindow: {
        pause_start: mergedStart,
        pause_end: mergedEnd,
      },
    });
  }

  if (!skipAutomationWriteEnabled) {
    return { success: true };
  }

  const { error: subscriptionError } = await sb
    .from("subscriptions")
    .update({
      pause_start: mergedStart,
      pause_end: mergedEnd,
    })
    .eq("id", sub.id);

  if (subscriptionError) return { error: subscriptionError.message };

  return { success: true };
}
