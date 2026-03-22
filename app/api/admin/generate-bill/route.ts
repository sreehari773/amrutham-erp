import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { inferSubscriptionSelection, DEFAULT_SUBSCRIPTION_CATALOG } from "@/lib/subscription-catalog";

export const dynamic = "force-dynamic";
import { getSubscriptionCatalog } from "@/app/actions/sprint1";

export async function POST(req: Request) {
  try {
    const { subscriptionId, fromDate, toDate } = await req.json();

    if (!subscriptionId || !fromDate || !toDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 1. Get deliveries in range
    const { data: deliveries, error: deliveryError } = await sb
      .from("deliveries")
      .select("id")
      .eq("subscription_id", subscriptionId)
      .gte("delivery_date", fromDate)
      .lte("delivery_date", toDate)
      .eq("status", "Delivered");

    if (deliveryError) {
      throw new Error(deliveryError.message);
    }

    const deliveryCount = deliveries?.length || 0;

    // 2. Get subscription info for pricing
    const { data: subData, error: subError } = await sb
      .from("subscriptions")
      .select("price_per_tiffin")
      .eq("id", subscriptionId)
      .single();

    if (subError || !subData) {
      throw new Error(subError?.message || "Subscription not found");
    }

    const amount = deliveryCount * subData.price_per_tiffin;

    // 3. Create invoice record
    const { data: invoice, error: invoiceError } = await sb
      .from("invoices")
      .insert({
        subscription_id: subscriptionId,
        amount: amount,
        status: "Draft",
        billing_period_start: fromDate,
        billing_period_end: toDate,
      })
      .select("id")
      .single();

    if (invoiceError) {
      throw new Error(invoiceError.message);
    }

    // 4. Log it
    await sb.from("system_logs").insert({
      action_type: "CUSTOM_BILL_GENERATED",
      description: `Generated bill for sub ${subscriptionId} from ${fromDate} to ${toDate} (${deliveryCount} tiffins = ${amount})`,
      actor: "admin",
    });

    return NextResponse.json({
      success: true,
      data: {
        invoiceId: invoice.id,
        deliveries: deliveryCount,
        amount: amount,
      }
    });

  } catch (error) {
    console.error("Custom Billing Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate bill" }, { status: 500 });
  }
}
