import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logShadowMismatch } from "@/lib/rollout";
import { getSupabaseAdmin } from "@/lib/supabase";
import { queueMessage } from "@/app/actions/messaging";

export const dynamic = "force-dynamic";

function buildFallbackInvoiceNumber(invoiceDate: string) {
  const date = new Date(`${invoiceDate}T00:00:00`);
  const yearMonth = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 7).replace("-", "")
    : `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;

  return `AMR-${yearMonth}-${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const { subscriptionId, fromDate, toDate, adjustment = false } = await req.json();

    if (!subscriptionId || !fromDate || !toDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (fromDate > toDate) {
      return NextResponse.json({ error: "From date cannot be later than to date" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const billingShadowEnabled =
      env.rollout.deliveryStatusShadowEnabled ||
      env.rollout.autoExtensionShadowEnabled ||
      env.rollout.retroSkipAdjustmentShadowEnabled ||
      env.rollout.prorationShadowEnabled;
    const billingWriteEnabled =
      env.rollout.deliveryStatusWriteEnabled ||
      env.rollout.autoExtensionWriteEnabled ||
      env.rollout.retroSkipAdjustmentWriteEnabled ||
      env.rollout.prorationWriteEnabled;

    const { data: overlappingInvoice } = await sb
      .from("invoices")
      .select("id, invoice_number")
      .eq("subscription_id", subscriptionId)
      .neq("invoice_type", "adjustment")
      .not("billing_period_start", "is", null)
      .not("billing_period_end", "is", null)
      .lte("billing_period_start", toDate)
      .gte("billing_period_end", fromDate)
      .limit(1)
      .maybeSingle();

    if (overlappingInvoice && !adjustment) {
      return NextResponse.json(
        { error: `Billing period overlaps with existing invoice ${overlappingInvoice.invoice_number}` },
        { status: 409 }
      );
    }

    const [legacyDeliveriesResult, enhancedDeliveriesResult] = await Promise.all([
      sb
        .from("deliveries")
        .select("id, delivery_date")
        .eq("subscription_id", subscriptionId)
        .gte("delivery_date", fromDate)
        .lte("delivery_date", toDate),
      sb
        .from("deliveries")
        .select("id, delivery_date")
        .eq("subscription_id", subscriptionId)
        .gte("delivery_date", fromDate)
        .lte("delivery_date", toDate)
        .in("status", ["delivered", "confirmed"])
        .eq("billable", true),
    ]);

    if (legacyDeliveriesResult.error || enhancedDeliveriesResult.error) {
      throw new Error(
        legacyDeliveriesResult.error?.message ??
          enhancedDeliveriesResult.error?.message ??
          "Failed to load deliveries."
      );
    }

    const legacyDeliveryCount = legacyDeliveriesResult.data?.length || 0;
    const enhancedDeliveryCount = enhancedDeliveriesResult.data?.length || 0;

    if (billingShadowEnabled && legacyDeliveryCount !== enhancedDeliveryCount) {
      await logShadowMismatch("SHADOW_BILLING_MISMATCH", {
        subscriptionId,
        fromDate,
        toDate,
        legacyDeliveryCount,
        enhancedDeliveryCount,
        adjustment,
      });
    }

    // Always bill on confirmed/billable deliveries only — legacy unfiltered count is kept solely for shadow logging.
    const deliveryCount = enhancedDeliveryCount;

    if (deliveryCount === 0) {
      return NextResponse.json(
        { error: "No billable deliveries found in this period. Cannot generate an empty invoice." },
        { status: 400 }
      );
    }

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

    const invoiceType = adjustment && billingWriteEnabled ? "adjustment" : "standard";
    const adjustmentReason = adjustment && billingWriteEnabled ? "Retroactive billing adjustment" : null;

    const { data: invoice, error: invoiceError } = await sb
      .from("invoices")
      .insert({
        subscription_id: subscriptionId,
        customer_id: subData.customer_id,
        invoice_number: invoiceNumber,
        amount,
        recognized_revenue: amount,
        payment_status: "Pending",
        amount_paid: 0,
        billing_period_start: fromDate,
        billing_period_end: toDate,
        invoice_date: toDate,
        invoice_type: invoiceType,
        adjustment_reason: adjustmentReason,
        adjustment_meta: {
          deliveredRows: deliveryCount,
          source: billingWriteEnabled ? "admin-generate-bill-v2" : "admin-generate-bill-legacy",
          legacyDeliveryCount,
          enhancedDeliveryCount,
        },
      })
      .select("id")
      .single();

    if (invoiceError) {
      throw new Error(invoiceError.message);
    }

    if (env.rollout.whatsappAutomationWriteEnabled) {
      await queueMessage({
        subscriptionId,
        customerId: subData.customer_id,
        eventType: "bill_generated",
        vars: {
          invoiceNumber,
          amount: amount.toFixed(0),
          period: `${fromDate} to ${toDate}`,
        },
        referenceKey: `bill:${subscriptionId}:${fromDate}:${toDate}:${invoiceType}`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber,
          fromDate,
          toDate,
          adjustment,
        },
      });
    } else if (env.rollout.whatsappAutomationShadowEnabled) {
      await logShadowMismatch("SHADOW_MESSAGE_ENQUEUE", {
        feature: "bill-generated",
        subscriptionId,
        customerId: subData.customer_id,
        invoiceId: invoice.id,
        invoiceNumber,
        fromDate,
        toDate,
        adjustment,
      });
    }

    await sb.from("system_logs").insert({
      action_type: "CUSTOM_BILL_GENERATED",
      description: `Generated bill for sub ${subscriptionId} from ${fromDate} to ${toDate} (${deliveryCount} tiffins = ${amount}) via ${billingWriteEnabled ? "v2" : "legacy"}`,
      actor: "admin",
    });

    return NextResponse.json({
      success: true,
      data: {
        invoiceId: invoice.id,
        deliveries: deliveryCount,
        amount,
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate bill" }, { status: 500 });
  }
}
