import "server-only";

import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const createServerClient = cache(() =>
  createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "amrutham-erp-server",
      },
    },
  })
);

export const getSupabaseAdmin = createServerClient;
export const getSupabase = createServerClient;
