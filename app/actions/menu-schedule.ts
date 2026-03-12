"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { dayOfWeek } from "@/lib/utils";

export type MenuScheduleRow = {
  id?: number;
  day_of_week: number;
  meal_slot: string;
  veg_items: string;
  non_veg_items: string;
  veg_alternatives: string;
  side_items: string;
  notes: string;
};

export async function getWeeklySchedule(): Promise<{ data: MenuScheduleRow[]; error?: string }> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("menu_schedule")
    .select("*")
    .order("day_of_week", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  // If no schedule exists, return empty rows for each day
  if (!data || data.length === 0) {
    const defaults: MenuScheduleRow[] = Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      meal_slot: "lunch",
      veg_items: "",
      non_veg_items: "",
      veg_alternatives: "",
      side_items: "",
      notes: "",
    }));
    return { data: defaults };
  }

  return { data: data as MenuScheduleRow[] };
}

export async function saveWeeklySchedule(
  schedule: MenuScheduleRow[],
): Promise<{ data?: MenuScheduleRow[]; error?: string }> {
  const sb = getSupabaseAdmin();

  // Upsert all 7 days
  for (const row of schedule) {
    const { error } = await sb
      .from("menu_schedule")
      .upsert(
        {
          day_of_week: row.day_of_week,
          meal_slot: row.meal_slot || "lunch",
          veg_items: row.veg_items.trim(),
          non_veg_items: row.non_veg_items.trim(),
          veg_alternatives: (row.veg_alternatives || "").trim(),
          side_items: (row.side_items || "").trim(),
          notes: (row.notes || "").trim(),
          effective_from: new Date().toISOString().slice(0, 10),
        },
        { onConflict: "day_of_week,meal_slot,effective_from" },
      );

    if (error) {
      return { error: `Failed to save day ${row.day_of_week}: ${error.message}` };
    }
  }

  revalidatePath("/menus");
  revalidatePath("/operations");
  return { data: schedule };
}

export async function getScheduleForDate(
  targetDate: string,
): Promise<{ data: MenuScheduleRow | null; error?: string }> {
  const dow = dayOfWeek(targetDate);
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("menu_schedule")
    .select("*")
    .eq("day_of_week", dow)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as MenuScheduleRow | null };
}
