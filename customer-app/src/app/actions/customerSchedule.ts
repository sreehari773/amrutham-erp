"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getCustomerSession } from "./customerAuth";

export async function getUpcomingDeliveries() {
  const customerId = await getCustomerSession();
  if (!customerId) return { error: "Not authenticated" };

  const sb = getSupabaseAdmin();
  const { data: sub } = await sb
    .from("subscriptions")
    .select("id, start_date, pause_start, pause_end, skip_saturday, meal_preference")
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

  // Cut-off Check Rule: Lunch < 8 AM, Dinner < 1 PM
  const now = new Date();
  const targetDate = new Date(targetDateStr);
  
  if (now.toDateString() === targetDate.toDateString()) {
    const currentHour = now.getHours();
    // Assuming standard time zone (IST) if deployed there, or standard local
    if (!isDinner && currentHour >= 8) {
      return { error: "Too late! Lunch skips must be made before 8:00 AM today." };
    }
    if (isDinner && currentHour >= 13) {
      return { error: "Too late! Dinner skips must be made before 1:00 PM today." };
    }
  } else if (targetDate < now && now.toDateString() !== targetDate.toDateString()) {
    return { error: "You cannot skip past dates." };
  }

  const sb = getSupabaseAdmin();
  const { data: sub } = await sb
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customerId)
    .in("status", ["Active", "Grace"])
    .limit(1)
    .single();
    
    if (!sub) return { error: "No active subscription found." };

  // Insert a 1-day pause
  const { error } = await sb.from("pause_history").insert({
    subscription_id: sub.id,
    pause_start: targetDateStr,
    pause_end: targetDateStr,
    reason: "Customer Skipped via Mobile App"
  });

  if (error) return { error: error.message };

  return { success: true };
}
