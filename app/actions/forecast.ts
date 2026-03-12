"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { tomorrowIST } from "@/lib/utils";

export type ForecastData = {
  forecast_date: string;
  veg_count: number;
  non_veg_count: number;
  mixed_count: number;
  total_count: number;
};

export async function generateForecast(
  targetDate?: string,
): Promise<{ data?: ForecastData; error?: string }> {
  const sb = getSupabaseAdmin();
  const date = targetDate ?? tomorrowIST();

  const { data, error } = await sb.rpc("generate_kitchen_forecast", {
    p_target_date: date,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/operations");
  return { data: data as ForecastData };
}

export async function getForecast(
  targetDate?: string,
): Promise<{ data?: ForecastData; error?: string }> {
  const sb = getSupabaseAdmin();
  const date = targetDate ?? tomorrowIST();

  const { data, error } = await sb
    .from("kitchen_forecast")
    .select("*")
    .eq("forecast_date", date)
    .maybeSingle();

  if (error) {
    return { error: error.message };
  }

  if (!data) {
    return { data: { forecast_date: date, veg_count: 0, non_veg_count: 0, mixed_count: 0, total_count: 0 } };
  }

  return {
    data: {
      forecast_date: data.forecast_date,
      veg_count: data.veg_count,
      non_veg_count: data.non_veg_count,
      mixed_count: data.mixed_count,
      total_count: data.total_count,
    },
  };
}
