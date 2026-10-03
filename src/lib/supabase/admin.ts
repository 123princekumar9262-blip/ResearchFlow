import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_URL } from "./env";

/**
 * A client with the secret key: it bypasses row-level security. Used only on
 * the server, and only for work no single user's session can do: reading
 * other people's push subscriptions to notify them, and the scheduled digest.
 * Never import this from anything a request handler returns data from.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient<Database>(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
