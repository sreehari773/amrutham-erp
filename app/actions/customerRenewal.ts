"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getCustomerSession } from "./customerAuth";

export async function submitRenewalRequest(planId: number, utrNumber: string) {
  const customerId = await getCustomerSession();
  if (!customerId) return { error: "Not authenticated" };

  if (!utrNumber || utrNumber.length < 6) {
    return { error: "Please enter a valid UPI Reference / UTR Number." };
  }

  const sb = getSupabaseAdmin();
  const { data: sub } = await sb
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { error } = await sb.from("renewal_requests").insert({
    subscription_id: sub?.id || null, // Can be null if it's their very first plan
    customer_id: customerId,
    plan_id: planId,
    utr_number: utrNumber.trim()
  });

  if (error) {
    return { error: error.message };
  }
  
  // Create system log so Admin sees it
  await sb.from("system_logs").insert({
    action_type: "RENEWAL_SUBMITTED",
    description: `Customer submitted new renewal payment request with UTR: ${utrNumber}`,
    actor: `Customer #${customerId}`
  });

  return { success: true };
}
