"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";

export type SubscriptionPlan = {
  id: number;
  name: string;
  tiffin_count: number;
  total_price: number;
  delivery_charge: number;
  created_at: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

export async function getSubscriptionPlans(limit = 100) {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("subscription_plans")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return { error: error.message, data: [] };
    }

    return { data: (data ?? []) as SubscriptionPlan[] };
  } catch (error) {
    return { error: toErrorMessage(error), data: [] };
  }
}

export async function createSubscriptionPlan(name: string, tiffinCount: number, totalPrice: number) {
  try {
    const sb = getSupabaseAdmin();

    if (!name.trim()) throw new Error("Plan name is required");
    if (tiffinCount <= 0) throw new Error("Tiffin count must be > 0");
    if (totalPrice < 0) throw new Error("Total price cannot be negative");

    // Standard hardcoded 40
    const deliveryCharge = 40;

    const { data, error } = await sb
      .from("subscription_plans")
      .insert({
        name: name.trim(),
        tiffin_count: tiffinCount,
        total_price: totalPrice,
        delivery_charge: deliveryCharge,
      })
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    await sb.from("system_logs").insert({
      action_type: "SUBSCRIPTION_PLAN_CREATED",
      description: `Created plan: ${name} (${tiffinCount} tiffins for ₹${totalPrice})`,
      actor: "admin",
    });

    revalidatePath("/subscriptions");
    return { data: data as SubscriptionPlan };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function updateSubscriptionPlan(id: number, name: string, tiffinCount: number, totalPrice: number) {
  try {
    const sb = getSupabaseAdmin();

    if (!name.trim()) throw new Error("Plan name is required");
    if (tiffinCount <= 0) throw new Error("Tiffin count must be > 0");
    if (totalPrice < 0) throw new Error("Total price cannot be negative");

    const { data, error } = await sb
      .from("subscription_plans")
      .update({
        name: name.trim(),
        tiffin_count: tiffinCount,
        total_price: totalPrice,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    await sb.from("system_logs").insert({
      action_type: "SUBSCRIPTION_PLAN_UPDATED",
      description: `Updated plan #${id}: ${name} (${tiffinCount} tiffins for ₹${totalPrice})`,
      actor: "admin",
    });

    revalidatePath("/subscriptions");
    return { data: data as SubscriptionPlan };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}

export async function deleteSubscriptionPlan(id: number) {
  try {
    const sb = getSupabaseAdmin();

    // Check if any ACTIVE subscriptions are using this plan
    const { count, error: countError } = await sb
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", id)
      .eq("status", "Active");

    if (countError) {
      return { error: countError.message };
    }

    if (count && count > 0) {
      return { error: "Cannot delete this plan, it is actively assigned to customers. Please modify it instead." };
    }

    // Attempt deletion
    const { error: deleteError } = await sb
      .from("subscription_plans")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    await sb.from("system_logs").insert({
      action_type: "SUBSCRIPTION_PLAN_DELETED",
      description: `Deleted subscription plan #${id}`,
      actor: "admin",
    });

    revalidatePath("/subscriptions");
    return { success: true };
  } catch (error) {
    return { error: toErrorMessage(error) };
  }
}
