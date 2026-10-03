import { redirect } from "next/navigation";
import { LogSheet } from "@/components/logs/log-sheet";
import { requireSession } from "@/lib/auth";
import { composerDefaults, loadLogComposer } from "@/lib/data/log-composer";

/** "+ Log" from any page: the composer slides over what you were looking at. */
export default async function LogSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, userId, profile, today } = await requireSession();
  if (profile.role === "professor") redirect("/dashboard");
  const data = await loadLogComposer(supabase, userId, profile.timezone, today);
  return <LogSheet data={data} today={today} {...composerDefaults(await searchParams)} />;
}
