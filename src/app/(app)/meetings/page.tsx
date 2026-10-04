import Link from "next/link";
import { ChevronRight, Handshake } from "lucide-react";
import { cn } from "cn";
import { EmptyState, PageHeader, Section, UserAvatar } from "@/components/common/ui-bits";
import { ScheduleMeetingDialog } from "@/components/meetings/schedule-dialog";
import { requireSession } from "@/lib/auth";
import { listMeetings, type MeetingWithPeople } from "@/lib/data/meetings";
import { formatMeetingTime, splitMeetings } from "@/lib/domain/meetings";

export const metadata = { title: "Meetings" };

function Row({ m, timeZone, past }: { m: MeetingWithPeople; timeZone: string; past?: boolean }) {
  return (
    <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-primary/[0.04]">
      <UserAvatar name={m.other.name} className="size-8 text-xs" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{m.other.name}</span>
        <span className="block text-[13px] text-muted-foreground">{formatMeetingTime(m.starts_at, timeZone)}</span>
      </span>
      {past && (
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", m.status === "done" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground")}>
          {m.status === "done" ? "Notes" : "Not ended"}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** One-to-ones between a professor and a student: book one, open its agenda, read past notes. */
export default async function MeetingsPage() {
  const { profile } = await requireSession();
  const { ready, meetings, people } = await listMeetings();
  const { upcoming, past } = splitMeetings(meetings);
  const schedule = <ScheduleMeetingDialog people={people} role={profile.role} />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Meetings" description="Your one-to-ones. The agenda builds itself from what's open between you." actions={ready ? schedule : undefined} />

      {!ready ? (
        <div className="rounded-xl border border-warning/35 bg-wash-warning p-4 text-[14px]">
          <p className="font-medium">Meetings need a one-time database update.</p>
          <p className="mt-1 text-muted-foreground">Run migration 11 (meetings) in the Supabase SQL editor, then reload this page.</p>
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Handshake} title="No meetings yet" action={schedule}>
            {profile.role === "professor"
              ? "Book a one-to-one with a student. Their open requests, blockers, reviews and last report become the agenda, and what you agree becomes their tasks."
              : "Book a one-to-one with your professor. Your blockers, open requests and last report become the agenda, and what you agree becomes your tasks."}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-5">
          <Section icon={Handshake} title="Upcoming" count={upcoming.length} bodyClassName="divide-y">
            {upcoming.length === 0 ? (
              <p className="px-4 py-5 text-center text-muted-foreground">Nothing booked.</p>
            ) : (
              upcoming.map((m) => <Row key={m.id} m={m} timeZone={profile.timezone} />)
            )}
          </Section>
          {past.length > 0 && (
            <Section title="Past" count={past.length} accent="info" bodyClassName="divide-y">
              {past.map((m) => (
                <Row key={m.id} m={m} timeZone={profile.timezone} past />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
