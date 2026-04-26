"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { logShadowMismatch } from "@/lib/rollout";
import { getSupabaseAdmin } from "@/lib/supabase";
import { queueMessage } from "@/app/actions/messaging";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function revalidateOperationalViews() {
  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath("/menus");
  revalidatePath("/admin");
  revalidatePath("/kot");
}

export async function markTodayDelivered(targetDate: string) {
  try {
    const sb = getSupabaseAdmin();
    const {
      deliveryStatusShadowEnabled,
      deliveryStatusWriteEnabled,
      whatsappAutomationShadowEnabled,
    } = env.rollout;

    if (deliveryStatusShadowEnabled) {
      const { count: projectedEligibleCount } = await sb
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .in("status", ["Active", "Grace"])
        .gt("remaining_tiffins", 0)
        .lte("start_date", targetDate);

      await logShadowMismatch("SHADOW_DELIVERY_STATUS_MISMATCH", {
        targetDate,
        legacyRpc: "mark_today_delivered",
        projectedRpc: "mark_today_delivered_v2",
        projectedEligibleCount: projectedEligibleCount ?? 0,
      });
    }

    const { data, error } = deliveryStatusWriteEnabled
      ? await sb.rpc("mark_today_delivered_v2", {
          p_target_date: targetDate,
          p_stage: "delivered",
        })
      : await sb.rpc("mark_today_delivered", {
          p_target_date: targetDate,
        });

    if (error) {
      return { error: error.message };
    }

    const deliveredRowsQuery = sb
      .from("deliveries")
      .select("subscription_id")
      .eq("delivery_date", targetDate);

    const { data: deliveredRows } = deliveryStatusWriteEnabled
      ? await deliveredRowsQuery.in("status", ["delivered", "confirmed"])
      : await deliveredRowsQuery;

    const deliveredSubIds = Array.from(
      new Set((deliveredRows ?? []).map((row) => Number(row.subscription_id)).filter(Boolean))
    );

    if (deliveredSubIds.length > 0) {
      const { data: subscriptions } = await sb
        .from("subscriptions")
        .select("id, customer_id")
        .in("id", deliveredSubIds);

      if (env.rollout.whatsappAutomationWriteEnabled) {
        await Promise.all(
          (subscriptions ?? []).map((subscription) =>
            queueMessage({
              subscriptionId: subscription.id,
              customerId: subscription.customer_id,
              eventType: "delivery_receipt",
              vars: { date: targetDate },
              referenceKey: `delivery-receipt:${subscription.id}:${targetDate}`,
              metadata: { deliveryDate: targetDate, source: "bulk-delivery" },
            })
          )
        );
      } else if (whatsappAutomationShadowEnabled) {
        await logShadowMismatch("SHADOW_MESSAGE_ENQUEUE", {
          feature: "delivery-receipt",
          targetDate,
          subscriptionIds: deliveredSubIds,
        });
      }
    }

    revalidateOperationalViews();
    return { count: data };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function manualAdjustDelivery(
  subId: number,
  targetDate: string,
  action: "DEDUCT" | "RESTORE" | "CUSTOMER_SKIP" | "KITCHEN_FAULT" | "OUT_FOR_DELIVERY" | "CONFIRM",
  reason: string
) {
  try {
    const sb = getSupabaseAdmin();
    const {
      deliveryStatusShadowEnabled,
      deliveryStatusWriteEnabled,
      kitchenFaultShadowEnabled,
      kitchenFaultWriteEnabled,
      retroSkipAdjustmentShadowEnabled,
      retroSkipAdjustmentWriteEnabled,
      whatsappAutomationShadowEnabled,
    } = env.rollout;

    const requiresDeliveryStatusWrite = action === "OUT_FOR_DELIVERY" || action === "CONFIRM";
    const requiresKitchenFaultWrite = action === "KITCHEN_FAULT";
    const requiresRetroSkipWrite = action === "CUSTOMER_SKIP";

    if (deliveryStatusShadowEnabled || kitchenFaultShadowEnabled || retroSkipAdjustmentShadowEnabled) {
      await logShadowMismatch("SHADOW_DELIVERY_ADJUSTMENT_MISMATCH", {
        subscriptionId: subId,
        targetDate,
        action,
        reason,
      });
    }

    if (
      (requiresDeliveryStatusWrite && !deliveryStatusWriteEnabled) ||
      (requiresKitchenFaultWrite && !kitchenFaultWriteEnabled) ||
      (requiresRetroSkipWrite && !retroSkipAdjustmentWriteEnabled)
    ) {
      return { error: "This delivery correction is feature-flagged off in the current rollout phase." };
    }

    const useEnhancedFlow =
      deliveryStatusWriteEnabled || kitchenFaultWriteEnabled || retroSkipAdjustmentWriteEnabled;

    const { data, error } = useEnhancedFlow
      ? await sb.rpc("manual_adjust_delivery_v2", {
          p_sub_id: subId,
          p_target_date: targetDate,
          p_action: action,
          p_reason: reason,
        })
      : await sb.rpc("manual_adjust_delivery", {
          p_sub_id: subId,
          p_target_date: targetDate,
          p_action: action,
          p_reason: reason,
        });

    if (error) {
      return { error: error.message };
    }

    const { data: subscription } = await sb
      .from("subscriptions")
      .select("customer_id")
      .eq("id", subId)
      .maybeSingle();

    if (subscription?.customer_id) {
      if ((action === "DEDUCT" || action === "CONFIRM") && env.rollout.whatsappAutomationWriteEnabled) {
        await queueMessage({
          subscriptionId: subId,
          customerId: subscription.customer_id,
          eventType: "delivery_receipt",
          vars: { date: targetDate },
          referenceKey: `delivery-receipt:${subId}:${targetDate}`,
          metadata: { deliveryDate: targetDate, source: "manual-adjustment", action },
        });
      } else if ((action === "DEDUCT" || action === "CONFIRM") && whatsappAutomationShadowEnabled) {
        await logShadowMismatch("SHADOW_MESSAGE_ENQUEUE", {
          feature: "manual-delivery-receipt",
          subscriptionId: subId,
          targetDate,
          action,
        });
      }

      if (action === "KITCHEN_FAULT" && env.rollout.whatsappAutomationWriteEnabled) {
        await queueMessage({
          subscriptionId: subId,
          customerId: subscription.customer_id,
          eventType: "delivery_issue",
          vars: { date: targetDate, reason },
          referenceKey: `delivery-issue:${subId}:${targetDate}`,
          metadata: { deliveryDate: targetDate, source: "manual-adjustment", action, reason },
        });
      } else if (action === "KITCHEN_FAULT" && whatsappAutomationShadowEnabled) {
        await logShadowMismatch("SHADOW_MESSAGE_ENQUEUE", {
          feature: "delivery-issue",
          subscriptionId: subId,
          targetDate,
          action,
          reason,
        });
      }
    }

    revalidateOperationalViews();
    return { data };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function getDeliveryHistory(subId: number) {
  try {
    const sb = getSupabaseAdmin();

    const { data, error } = await sb
      .from("deliveries")
      .select("*")
      .eq("subscription_id", subId)
      .order("delivery_date", { ascending: false })
      .limit(30);

    if (error) {
      return { error: error.message, data: [] };
    }

    return { data: data ?? [] };
  } catch (error) {
    return { error: toErrorMessage(error), data: [] };
  }
}
