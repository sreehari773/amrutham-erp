"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";

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

    const { data, error } = await sb.rpc("mark_today_delivered", {
      p_target_date: targetDate,
    });

    if (error) {
      return { error: error.message };
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
  action: "DEDUCT" | "RESTORE",
  reason: string
) {
  try {
    const sb = getSupabaseAdmin();

    const { data, error } = await sb.rpc("manual_adjust_delivery", {
      p_sub_id: subId,
      p_target_date: targetDate,
      p_action: action,
      p_reason: reason,
    });

    if (error) {
      return { error: error.message };
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
