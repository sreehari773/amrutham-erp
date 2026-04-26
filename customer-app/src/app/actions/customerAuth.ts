"use server";

import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sign, verify } from "@/lib/session";

export async function customerLogin(phone: string, password: string) {
  try {
    const sb = getSupabaseAdmin();
    
    // Look up customer by phone and app_password
    const { data: customer, error } = await sb
      .from("customers")
      .select("id, name")
      .eq("phone", phone.trim())
      .eq("app_password", password)
      .single();
      
    if (error || !customer) {
      return { error: "Invalid phone number or password." };
    }
    
    // Set a secure HTTP-only cookie with the signed customer ID
    // In a production app with auth.users, we would use Supabase SSR tokens.
    // For this fast managed iteration, a signed generic cookie suffices.
    const signedSession = sign(String(customer.id));

    cookies().set("amrutham_customer_session", signedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365 * 10, // 10 years (never auto log out)
      path: "/",
    });
    
    return { success: true };
  } catch {
    return { error: "An unexpected error occurred. Please try again." };
  }
}

export async function customerLogout() {
  cookies().delete("amrutham_customer_session");
  return { success: true };
}

// Utility for Server Components to get the current customer ID
export async function getCustomerSession() {
  const sessionCookie = cookies().get("amrutham_customer_session");
  if (!sessionCookie) return null;

  const customerId = verify(sessionCookie.value);
  return customerId ? parseInt(customerId, 10) : null;
}
