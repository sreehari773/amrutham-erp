"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";

export type WeeklyMenu = {
  day_of_week: string;
  veg_description: string;
  non_veg_description: string;
};

// Internal order for sorting results reliably Mon-Sat
const dayOrder: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

export async function getWeeklyMenus() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("weekly_menus").select("*");

    if (error) {
      return { error: error.message, data: [] };
    }

    // Sort Monday -> Saturday
    const sorted = (data ?? []).sort((a, b) => dayOrder[a.day_of_week] - dayOrder[b.day_of_week]);
    return { data: sorted as WeeklyMenu[] };
  } catch (error) {
    if (error instanceof Error) return { error: error.message, data: [] };
    return { error: "Failed to fetch weekly menus", data: [] };
  }
}

export async function updateWeeklyMenu(formData: FormData) {
  try {
    const sb = getSupabaseAdmin();
    const dayOfWeek = formData.get("dayOfWeek")?.toString();
    const vegDesc = formData.get("vegDescription")?.toString();
    const nonVegDesc = formData.get("nonVegDescription")?.toString();

    if (!dayOfWeek) throw new Error("Day of week is required.");

    const { error } = await sb
      .from("weekly_menus")
      .update({
        veg_description: vegDesc ?? "",
        non_veg_description: nonVegDesc ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("day_of_week", dayOfWeek);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/");
    revalidatePath("/menus");
    revalidatePath("/kot");
    return { success: true };
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to update weekly menu" };
  }
}

export async function getMenuForDay(dateStr: string) {
  try {
    // Determine the day of the week from the given date (e.g. "2026-03-17" -> Tuesday)
    const dateObj = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', timeZone: 'Asia/Kolkata' };
    const dayName = new Intl.DateTimeFormat('en-US', options).format(dateObj);

    if (dayName === 'Sunday') {
      return { 
        data: { 
          day_of_week: "Sunday", 
          veg_description: "Kitchen Closed", 
          non_veg_description: "Kitchen Closed" 
        } 
      };
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("weekly_menus")
      .select("*")
      .eq("day_of_week", dayName)
      .single();

    if (error) {
      return { error: error.message, data: null };
    }

    return { data: data as WeeklyMenu };
  } catch (error) {
    if (error instanceof Error) return { error: error.message, data: null };
    return { error: "Failed to determine daily menu", data: null };
  }
}
