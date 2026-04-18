"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getCustomerSession } from "./customerAuth";

export async function getCustomerDashboardData() {
  const customerId = await getCustomerSession();
  if (!customerId) return { error: "Not authenticated", data: null };

  const sb = getSupabaseAdmin();

  // Get active subscription
  const { data: sub, error: subError } = await sb
    .from("subscriptions")
    .select(`
      *,
      subscription_plans (name)
    `)
    .eq("customer_id", customerId)
    .in("status", ["Active", "Grace"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (subError && subError.code !== "PGRST116") {
    // PGRST116 means no rows found, which is fine, they just don't have an active sub
    return { error: "Failed to load subscription data", data: null };
  }

  // Get today's menu
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = days[new Date().getDay()];

  const { data: menu } = await sb
    .from("weekly_menus")
    .select("veg_description, non_veg_description")
    .eq("day_of_week", today)
    .single();

  return {
    data: {
      subscription: sub || null,
      todayMenu: menu || null,
      dayOfWeek: today
    }
  };
}
