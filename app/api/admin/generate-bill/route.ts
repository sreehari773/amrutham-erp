import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { inferSubscriptionSelection, DEFAULT_SUBSCRIPTION_CATALOG } from "@/lib/subscription-catalog";

export const dynamic = "force-dynamic";
import { getSubscriptionCatalog } from "@/app/actions/sprint1";

function buildFallbackInvoiceNumber(invoiceDate: string) {
  const date = new Date(`${invoiceDate}T00:00:00`);
  const yearMonth = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 7).replace("-", "")
    : `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;

  return `AMR-${yearMonth}-${Date.now()}`;
}

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
      if (deliveryError.message.includes("Could not find the table 'public.deliveries'")) {
        throw new Error("The deliveries table is missing from the live database schema. Apply the latest delivery schema patch in Supabase and reload the schema cache.");
      }

      throw new Error(deliveryError.message);
    }

    const deliveryCount = deliveries?.length || 0;

    // 2. Get subscription info for pricing and invoice ownership
    const { data: subData, error: subError } = await sb
      .from("subscriptions")
      .select("price_per_tiffin, customer_id")
      .eq("id", subscriptionId)
      .single();

    if (subError || !subData) {
      throw new Error(subError?.message || "Subscription not found");
    }

    if (!subData.customer_id) {
      throw new Error("Subscription is missing a customer reference.");
    }

    const amount = deliveryCount * subData.price_per_tiffin;
    let invoiceNumber = buildFallbackInvoiceNumber(toDate);

    const { data: generatedInvoiceNumber, error: invoiceNumberError } = await sb.rpc(
      "generate_invoice_number",
      { p_date: toDate }
    );

    if (!invoiceNumberError && typeof generatedInvoiceNumber === "string" && generatedInvoiceNumber.trim()) {
      invoiceNumber = generatedInvoiceNumber;
    }

    // 3. Create invoice record
    const { data: invoice, error: invoiceError } = await sb
      .from("invoices")
      .insert({
        subscription_id: subscriptionId,
        customer_id: subData.customer_id,
        invoice_number: invoiceNumber,
        amount: amount,
        payment_status: "Pending",
        amount_paid: 0,
        billing_period_start: fromDate,
        billing_period_end: toDate,
        invoice_date: toDate,
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
