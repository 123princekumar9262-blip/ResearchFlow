// Public Supabase settings. The publishable key (or a legacy anon key) is safe in
// the browser: every table is behind row-level security.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.startsWith("http") && SUPABASE_PUBLISHABLE_KEY.length > 0;
}

export const ATTACHMENTS_BUCKET = "attachments";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
