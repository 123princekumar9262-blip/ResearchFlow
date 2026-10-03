import Link from "next/link";
import { redirect } from "next/navigation";
import { LogForm } from "@/components/logs/log-form";
import { requireSession } from "@/lib/auth";
import { composerDefaults, loadLogComposer } from "@/lib/data/log-composer";

export const metadata = { title: "Today's log" };

/** The composer on its own page, for a reload or a shared link to /log/new. */
export default async function NewLogPage({ searchParams }: PageProps<"/log/new">) {
  const { supabase, userId, profile, today } = await requireSession();
  if (profile.role === "professor") redirect("/dashboard");
  const data = await loadLogComposer(supabase, userId, profile.timezone, today);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Today&apos;s log</h1>
        <p className="mt-1 text-muted-foreground">
          About a minute. It&apos;s your evidence when results aren&apos;t in yet.{" "}
          <Link href="/log" className="underline-offset-2 hover:underline">
            Open the diary
          </Link>
        </p>
      </div>
      <LogForm {...data} today={today} {...composerDefaults(await searchParams)} />
    </div>
  );
}
