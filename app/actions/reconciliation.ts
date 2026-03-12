"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { todayIST, tomorrowIST } from "@/lib/utils";
import { generateForecast } from "./forecast";
import { queueMessage } from "./messaging";

export type ReconciliationResult = {
  run_date: string;
  resumed: number;
  delivered: number;
  expired: number;
  graced: number;
  forecast_generated: boolean;
  manifest_generated: boolean;
  errors: string[];
};

export async function runDailyReconciliation(
  targetDate?: string,
): Promise<{ data?: ReconciliationResult; error?: string }> {
  const sb = getSupabaseAdmin();
  const date = targetDate ?? todayIST();
  const errors: string[] = [];
  let resumed = 0;
  let delivered = 0;
  let expired = 0;
  let graced = 0;
  let forecastGenerated = false;
  let manifestGenerated = false;

  // Step 1: Resume paused subscriptions whose pause_end < today
  try {
    const { data: pausedSubs } = await sb
      .from("subscriptions")
      .select("id, pause_start, pause_end")
      .eq("status", "Active")
      .not("pause_end", "is", null)
      .lte("pause_end", date);

    if (pausedSubs && pausedSubs.length > 0) {
      for (const sub of pausedSubs) {
        // Log to pause_history
        await sb.from("pause_history").insert({
          subscription_id: sub.id,
          pause_start: sub.pause_start,
          pause_end: sub.pause_end,
          pause_mode: "override",
          reason: "Auto-resumed by reconciliation",
        });

        // Clear pause columns
        await sb
          .from("subscriptions")
          .update({ pause_start: null, pause_end: null })
          .eq("id", sub.id);
      }
      resumed = pausedSubs.length;
    }
  } catch (err) {
    errors.push(`Resume step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: Bulk deduction via existing RPC
  try {
    const { data: count, error } = await sb.rpc("mark_today_delivered", {
      p_target_date: date,
    });

    if (error) {
      errors.push(`Delivery step failed: ${error.message}`);
    } else {
      delivered = count ?? 0;
    }
  } catch (err) {
    errors.push(`Delivery step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 3: Trigger grace for freshly expired subscriptions
  try {
    const { data: expiredSubs } = await sb
      .from("subscriptions")
      .select("id, customer_id")
      .eq("status", "Expired")
      .eq("remaining_tiffins", 0);

    if (expiredSubs && expiredSubs.length > 0) {
      for (const sub of expiredSubs) {
        // Check if already had a grace meal delivery
        const { data: graceDelivery } = await sb
          .from("deliveries")
          .select("id")
          .eq("subscription_id", sub.id)
          .eq("reason", "Grace meal")
          .maybeSingle();

        if (!graceDelivery) {
          // Transition to Grace
          await sb
            .from("subscriptions")
            .update({ status: "Grace" })
            .eq("id", sub.id);

          graced += 1;

          // Get customer name for message
          const { data: customer } = await sb
            .from("customers")
            .select("name")
            .eq("id", sub.customer_id)
            .single();

          // Queue grace meal message
          await queueMessage({
            subscriptionId: sub.id,
            customerId: sub.customer_id,
            eventType: "grace_meal",
            vars: { name: customer?.name ?? "" },
          });

          // Log
          await sb.from("system_logs").insert({
            action_type: "GRACE_MEAL_TRIGGERED",
            description: `Grace meal triggered for Sub #${sub.id}`,
            actor: "reconciliation",
          });
        }
      }
    }
  } catch (err) {
    errors.push(`Grace step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 4: Complete grace subscriptions that already received their grace delivery
  try {
    const { data: graceSubs } = await sb
      .from("subscriptions")
      .select("id")
      .eq("status", "Grace");

    if (graceSubs && graceSubs.length > 0) {
      for (const sub of graceSubs) {
        const { data: graceDelivery } = await sb
          .from("deliveries")
          .select("id")
          .eq("subscription_id", sub.id)
          .eq("reason", "Grace meal")
          .maybeSingle();

        if (graceDelivery) {
          await sb
            .from("subscriptions")
            .update({ status: "Completed", completed_at: new Date().toISOString() })
            .eq("id", sub.id);
        }
      }
    }
  } catch (err) {
    errors.push(`Grace completion step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 5: Generate tomorrow's forecast
  try {
    const tomorrow = tomorrowIST();
    const result = await generateForecast(tomorrow);
    forecastGenerated = !result.error;
    if (result.error) {
      errors.push(`Forecast: ${result.error}`);
    }
  } catch (err) {
    errors.push(`Forecast step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 6: Queue low-balance and renewal-reminder messages
  try {
    const { data: lowBalanceSubs } = await sb
      .from("subscriptions")
      .select("id, customer_id, remaining_tiffins")
      .eq("status", "Active")
      .lte("remaining_tiffins", 2)
      .gt("remaining_tiffins", 0);

    if (lowBalanceSubs) {
      for (const sub of lowBalanceSubs) {
        const { data: customer } = await sb
          .from("customers")
          .select("name")
          .eq("id", sub.customer_id)
          .single();

        const eventType = sub.remaining_tiffins === 1 ? "renewal_reminder" : "low_balance";
        await queueMessage({
          subscriptionId: sub.id,
          customerId: sub.customer_id,
          eventType,
          vars: {
            name: customer?.name ?? "",
            remaining: String(sub.remaining_tiffins),
          },
        });
      }
    }
  } catch (err) {
    errors.push(`Messaging step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 7: Queue pause engagement messages (paused > 3 days)
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const cutoffDate = threeDaysAgo.toISOString().slice(0, 10);

    const { data: longPaused } = await sb
      .from("subscriptions")
      .select("id, customer_id")
      .eq("status", "Active")
      .not("pause_start", "is", null)
      .lte("pause_start", cutoffDate);

    if (longPaused) {
      for (const sub of longPaused) {
        const { data: customer } = await sb
          .from("customers")
          .select("name")
          .eq("id", sub.customer_id)
          .single();

        await queueMessage({
          subscriptionId: sub.id,
          customerId: sub.customer_id,
          eventType: "pause_engagement",
          vars: { name: customer?.name ?? "" },
        });
      }
    }
  } catch (err) {
    errors.push(`Pause engagement step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  manifestGenerated = true; // Manifest is generated on-demand via RPC

  // Step 8: Log the reconciliation run
  try {
    await sb.from("reconciliation_runs").insert({
      run_date: date,
      resumed,
      delivered,
      expired,
      graced,
      forecast_generated: forecastGenerated,
      manifest_generated: manifestGenerated,
      errors: errors.length > 0 ? errors : null,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    errors.push(`Logging step failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath("/operations");
  revalidatePath("/admin");

  return {
    data: {
      run_date: date,
      resumed,
      delivered,
      expired,
      graced,
      forecast_generated: forecastGenerated,
      manifest_generated: manifestGenerated,
      errors,
    },
  };
}

export async function getLatestReconciliation(): Promise<{
  data: ReconciliationResult | null;
  error?: string;
}> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("reconciliation_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return { data: null };
  }

  return {
    data: {
      run_date: data.run_date,
      resumed: data.resumed,
      delivered: data.delivered,
      expired: data.expired,
      graced: data.graced,
      forecast_generated: data.forecast_generated,
      manifest_generated: data.manifest_generated,
      errors: data.errors ?? [],
    },
  };
}
