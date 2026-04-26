import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export async function logShadowMismatch(
  actionType: string,
  payload: Record<string, unknown>,
  actor = "shadow-mode",
) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from("system_logs").insert({
      action_type: actionType,
      description: JSON.stringify(payload),
      actor,
    });
  } catch (error) {
    console.error(`[shadow-log-failed] ${actionType}`, error);
  }
}
