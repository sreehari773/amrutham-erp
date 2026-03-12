"use server";

import { getSupabaseAdmin } from "@/lib/supabase";

export async function getKOTForDate(targetDate: string) {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb.rpc("get_kot_for_date", {
    p_target_date: targetDate,
  });

  if (error) {
    return { error: error.message, data: [] };
  }

  return { data: data ?? [] };
}

export async function getSystemLogs(limit = 50) {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("system_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { error: error.message, data: [] };
  }

  return { data: data ?? [] };
}
