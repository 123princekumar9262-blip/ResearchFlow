import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Logo } from "@/components/brand";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Finish setup" };

const STEPS = [
  ["Create a Supabase project", "supabase.com → New project. The free tier is enough for a lab."],
  ["Apply the database", "Run the SQL files in supabase/migrations in order (SQL editor), or `npx supabase db push`."],
  ["Add your keys", "Copy .env.example to .env.local and fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."],
  ["Restart the dev server", "`npm run dev`, then open this page again."],
] as const;

export default async function SetupPage() {
  // Read the environment at request time, not build time.
  await connection();
  if (isSupabaseConfigured()) redirect("/login");

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Connect a database to start</h1>
      <p className="mt-2 text-muted-foreground">
        ResearchFlow keeps every rule (deadline ownership, evidence before review, locked history) inside Postgres. It needs a
        Supabase project before it can run.
      </p>
      <ol className="mt-8 space-y-4">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-4 rounded-lg border bg-card p-4">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs text-primary-foreground">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-muted-foreground">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-muted-foreground">Full instructions are in README.md.</p>
    </main>
  );
}
