"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { todayIST } from "@/lib/utils";

export type ManifestEntry = {
  subscription_id: number;
  name: string;
  phone: string;
  address: string | null;
  meal_preference: string;
  delivery_notes: string | null;
  status: string;
  remaining_tiffins: number;
  route_name: string | null;
  route_sort: number | null;
  driver_name: string | null;
  driver_phone: string | null;
};

export async function getManifest(
  targetDate?: string,
): Promise<{ data: ManifestEntry[]; error?: string }> {
  const sb = getSupabaseAdmin();
  const date = targetDate ?? todayIST();

  const { data, error } = await sb.rpc("generate_delivery_manifest", {
    p_target_date: date,
  });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as ManifestEntry[] };
}

// --- Route management ---

export type DeliveryRoute = {
  id: number;
  route_name: string;
  area_codes: string[] | null;
  sort_order: number;
};

export async function getRoutes(): Promise<{ data: DeliveryRoute[]; error?: string }> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("delivery_routes")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as DeliveryRoute[] };
}

export async function saveRoute(
  route: { route_name: string; area_codes?: string[]; sort_order?: number },
): Promise<{ data?: DeliveryRoute; error?: string }> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("delivery_routes")
    .upsert(
      {
        route_name: route.route_name.trim(),
        area_codes: route.area_codes ?? [],
        sort_order: route.sort_order ?? 0,
      },
      { onConflict: "route_name" },
    )
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { data: data as DeliveryRoute };
}

// --- Driver management ---

export type DriverAssignment = {
  id: number;
  route_id: number;
  driver_name: string;
  phone: string | null;
  active: boolean;
};

export async function getDrivers(): Promise<{ data: DriverAssignment[]; error?: string }> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from("driver_assignments")
    .select("*")
    .eq("active", true);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as DriverAssignment[] };
}
