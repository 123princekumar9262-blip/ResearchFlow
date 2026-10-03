import { BellRing, Palette, Smartphone, Sparkles, UserRound } from "lucide-react";
import { PageHeader, Section } from "@/components/common/ui-bits";
import { JoinCodeCard } from "@/components/settings/join-code";
import { JoinProfessorCard } from "@/components/settings/join-professor";
import { LinkedPeople, ProfileForm, ThemePicker } from "@/components/settings/settings-forms";
import { InstallCard } from "@/components/pwa/install";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { isEmailConfigured } from "@/lib/notify/email";
import { requireSession } from "@/lib/auth";
import { isAiEnabled } from "@/lib/ai/remark-to-tasks";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, profile } = await requireSession();
  const { data } = await supabase.rpc("linked_people");
  // Supervision links only: a student's lab-mates are linked through the professor, not directly.
  const people = (data ?? []).filter((p) => p.role !== profile.role);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader inTopBar title="Settings" />
      <div className="space-y-5">
        {profile.role === "professor" ? <JoinCodeCard code={profile.join_code ?? ""} /> : <JoinProfessorCard />}
        <Section title={profile.role === "professor" ? "Your students" : "Your professors"} count={people.length}>
          <LinkedPeople people={people} />
        </Section>
        <Section icon={UserRound} title="Profile">
          <ProfileForm fullName={profile.full_name} timezone={profile.timezone} />
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            You signed up as a <b className="capitalize">{profile.role}</b>. Roles are fixed, because they decide who owns deadlines and approvals.
          </p>
        </Section>
        <Section icon={Palette} title="Appearance">
          <ThemePicker />
        </Section>
        <Section icon={BellRing} title="Notifications">
          <NotificationsCard digestEmail={profile.digest_email ?? true} emailReady={isEmailConfigured()} />
        </Section>
        <Section icon={Smartphone} accent="success" title="App">
          <InstallCard />
        </Section>
        <Section icon={Sparkles} title="AI assistance">
          <p className="p-4 text-muted-foreground">
            {isAiEnabled()
              ? "On. You can split a professor's remark into several tasks with AI. Suggestions are drafts; nothing is created until you confirm."
              : "Off. Set ANTHROPIC_API_KEY on the server to let ResearchFlow split remarks into tasks."}
          </p>
        </Section>
      </div>
    </div>
  );
}
