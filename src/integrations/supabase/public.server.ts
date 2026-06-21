import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let _publicSupabase: SupabaseClient<Database> | undefined;

export function getPublicSupabaseClient(): SupabaseClient<Database> {
  if (_publicSupabase) return _publicSupabase;

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["VITE_SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase public environment variable(s): ${missing.join(", ")}.`);
  }

  _publicSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _publicSupabase;
}
