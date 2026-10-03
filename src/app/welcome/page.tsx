import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { readOnboarding } from "@/lib/onboarding/state";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";

export const metadata = { title: "Welcome" };

/** The first-run setup, full screen and outside the app shell (onboarding spec, Phase 02). */
export default async function WelcomePage() {
  const { supabase, userId, profile, today } = await requireSession();
  const onboarding = readOnboarding(profile);
  if (onboarding?.setup === "done" || onboarding?.setup === "skipped") redirect("/dashboard");

  const [links, memberships] = await Promise.all([
    profile.role === "student"
      ? supabase.from("supervisions").select("person:profiles!supervisions_professor_id_fkey(id, full_name)").eq("student_id", userId)
      : supabase.from("supervisions").select("person:profiles!supervisions_student_id_fkey(id, full_name)").eq("professor_id", userId),
    supabase.from("project_members").select("project:projects!project_members_project_id_fkey(id, title, status)").eq("user_id", userId),
  ]);
  const people = (links.data ?? []).flatMap((l) => (l.person ? [{ id: l.person.id, name: l.person.full_name }] : []));
  const projects = (memberships.data ?? []).flatMap((m) => (m.project && m.project.status !== "archived" ? [{ id: m.project.id, title: m.project.title }] : []));

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <WelcomeFlow
      role={profile.role}
      firstName={profile.full_name.split(" ")[0]}
      joinCode={profile.join_code ?? ""}
      origin={origin}
      today={today}
      people={people}
      projects={projects}
      initial={onboarding ?? {}}
      persisted={onboarding !== null}
      userId={userId}
    />
  );
}
