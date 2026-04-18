"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { getCustomerSession } from "./customerAuth";

export async function getCustomerProfile() {
  const customerId = await getCustomerSession();
  if (!customerId) return { error: "Not authenticated" };

  const sb = getSupabaseAdmin();
  const { data: customer } = await sb
    .from("customers")
    .select("id, name, phone, secondary_phone, address, saved_addresses")
    .eq("id", customerId)
    .single();

  return { data: customer };
}

export async function updateCustomerProfile(updates: {
  name?: string;
  secondary_phone?: string;
  address?: string;
  saved_addresses?: string[];
}) {
  const customerId = await getCustomerSession();
  if (!customerId) return { error: "Not authenticated" };

  const sb = getSupabaseAdmin();
  const payload: Record<string, string> = {};
  
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.secondary_phone !== undefined) payload.secondary_phone = updates.secondary_phone;
  if (updates.address !== undefined) payload.address = updates.address;
  if (updates.saved_addresses !== undefined) payload.saved_addresses = JSON.stringify(updates.saved_addresses);

  const { error } = await sb
    .from("customers")
    .update(payload)
    .eq("id", customerId);

  if (error) return { error: error.message };

  return { success: true };
}
