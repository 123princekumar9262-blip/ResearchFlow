import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/domain/dates";
import type { Profile } from "@/types/database";

export interface Session {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  profile: Profile;
  /** Today's date in the user's timezone. */
  today: string;
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (!profile) return null;

  return { supabase, userId, profile, today: todayIn(profile.timezone) };
});

/** For pages: the session, or a redirect to sign-in. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
