/**
 * Server-side Supabase client using the service-role key.
 *
 * The service-role key bypasses Row Level Security, which is intentional
 * here — the backend has already verified the caller's identity via the
 * JWT passed in the Authorization header, so it's allowed to write rows
 * on their behalf. Never expose this key to the frontend.
 *
 * Usage: import { supabaseAdmin } from "./supabaseAdmin.js"
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the backend .env"
    );
  }

  _client = createClient(url, serviceKey, {
    auth: {
      // The backend never uses auth flows — it just reads/writes data.
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}
