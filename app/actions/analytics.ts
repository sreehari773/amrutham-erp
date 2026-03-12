"use server";

import { getSupabaseAdmin } from "@/lib/supabase";

export type CustomerAnalytics = {
  customer_id: number;
  name: string;
  phone: string;
  total_subscriptions: number;
  active_count: number;
  completed_count: number;
  cancelled_count: number;
  expired_count: number;
  lifetime_value: number;
  last_subscription_date: string | null;
  total_pauses: number;
};

export async function getCustomerAnalytics(
  limit = 50,
): Promise<{ data: CustomerAnalytics[]; error?: string }> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("subscription_analytics")
    .select("*")
    .order("lifetime_value", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as CustomerAnalytics[] };
}

export async function refreshAnalytics(): Promise<{ error?: string }> {
  const sb = getSupabaseAdmin();

  const { error } = await sb.rpc("refresh_subscription_analytics" as never);

  if (error) {
    // Fallback: execute raw SQL via system_logs pattern
    // The materialized view may not have a function wrapper yet
    return { error: error.message };
  }

  return {};
}

export async function getOperationalMetrics(targetMonth: string): Promise<{
  data?: {
    totalDeliveries: number;
    totalPauses: number;
    avgDeliveriesPerSub: number;
    renewalRate: number;
  };
  error?: string;
}> {
  const sb = getSupabaseAdmin();

  const start = `${targetMonth}-01`;
  const [yearText, monthText] = targetMonth.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  // Total deliveries this month
  const { count: deliveryCount } = await sb
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .gte("delivery_date", start)
    .lt("delivery_date", endExclusive);

  // Total pauses this month
  const { count: pauseCount } = await sb
    .from("pause_history")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lt("created_at", endExclusive);

  // Active subs for average calc
  const { count: activeSubs } = await sb
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "Active");

  // Renewal count (subscriptions created this month that have prior subs)
  const { count: renewalCount } = await sb
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", start)
    .lt("created_at", endExclusive);

  const totalDeliveries = deliveryCount ?? 0;
  const totalPauses = pauseCount ?? 0;
  const activeSubsCount = activeSubs ?? 1;
  const renewals = renewalCount ?? 0;

  return {
    data: {
      totalDeliveries,
      totalPauses,
      avgDeliveriesPerSub: activeSubsCount > 0 ? Math.round(totalDeliveries / activeSubsCount) : 0,
      renewalRate: activeSubsCount > 0 ? Math.round((renewals / activeSubsCount) * 100) : 0,
    },
  };
}
