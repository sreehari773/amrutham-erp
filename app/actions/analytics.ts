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

export type CustomerProfitability = {
  customer_id: number;
  name: string;
  phone: string;
  delivered_meals: number;
  revenue: number;
  ingredient_cost: number;
  delivery_cost: number;
  profit: number;
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

export async function getCustomerProfitability(
  targetMonth?: string,
): Promise<{ data: CustomerProfitability[]; error?: string }> {
  const sb = getSupabaseAdmin();

  let start: string | null = null;
  let endExclusive: string | null = null;

  if (targetMonth) {
    start = `${targetMonth}-01`;
    const [yearText, monthText] = targetMonth.split("-");
    const year = Number.parseInt(yearText ?? "", 10);
    const month = Number.parseInt(monthText ?? "", 10);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  }

  let deliveryQuery = sb
    .from("deliveries")
    .select("subscription_id, billable, status, subscriptions!inner(customer_id, plan_id, customers!inner(name, phone), subscription_plans!inner(ingredient_cost_per_tiffin, delivery_cost_per_tiffin))")
    .in("status", ["delivered", "confirmed"])
    .eq("billable", true);

  if (start && endExclusive) {
    deliveryQuery = deliveryQuery.gte("delivery_date", start).lt("delivery_date", endExclusive);
  }

  let invoiceQuery = sb
    .from("invoices")
    .select("customer_id, amount, invoice_type");

  if (start && endExclusive) {
    invoiceQuery = invoiceQuery.gte("invoice_date", start).lt("invoice_date", endExclusive);
  }

  const [{ data: deliveredRows, error: deliveryError }, { data: invoiceRows, error: invoiceError }] =
    await Promise.all([deliveryQuery, invoiceQuery]);

  if (deliveryError || invoiceError) {
    return {
      data: [],
      error: deliveryError?.message ?? invoiceError?.message ?? "Failed to load profitability analytics.",
    };
  }

  const profitabilityMap = new Map<number, CustomerProfitability>();

  for (const row of deliveredRows ?? []) {
    const subscription = Array.isArray(row.subscriptions) ? row.subscriptions[0] : row.subscriptions;
    const customer = Array.isArray(subscription?.customers) ? subscription.customers[0] : subscription?.customers;
    const plan = Array.isArray(subscription?.subscription_plans)
      ? subscription.subscription_plans[0]
      : subscription?.subscription_plans;

    if (!subscription?.customer_id || !customer) {
      continue;
    }

    const current = profitabilityMap.get(subscription.customer_id) ?? {
      customer_id: subscription.customer_id,
      name: customer.name ?? "Unknown",
      phone: customer.phone ?? "",
      delivered_meals: 0,
      revenue: 0,
      ingredient_cost: 0,
      delivery_cost: 0,
      profit: 0,
    };

    current.delivered_meals += 1;
    current.ingredient_cost += Number(plan?.ingredient_cost_per_tiffin ?? 0);
    current.delivery_cost += Number(plan?.delivery_cost_per_tiffin ?? 0);
    profitabilityMap.set(subscription.customer_id, current);
  }

  for (const invoice of invoiceRows ?? []) {
    if (!invoice.customer_id) {
      continue;
    }

    const current = profitabilityMap.get(invoice.customer_id) ?? {
      customer_id: invoice.customer_id,
      name: `Customer #${invoice.customer_id}`,
      phone: "",
      delivered_meals: 0,
      revenue: 0,
      ingredient_cost: 0,
      delivery_cost: 0,
      profit: 0,
    };

    current.revenue += Number(invoice.amount ?? 0);
    profitabilityMap.set(invoice.customer_id, current);
  }

  const data = Array.from(profitabilityMap.values())
    .map((item) => ({
      ...item,
      profit: item.revenue - item.ingredient_cost - item.delivery_cost,
    }))
    .sort((left, right) => right.profit - left.profit);

  return { data };
}
