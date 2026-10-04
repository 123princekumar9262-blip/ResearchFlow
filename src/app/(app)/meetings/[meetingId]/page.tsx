import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardList, Handshake, ListChecks, MessageSquareWarning, NotebookPen, ScrollText } from "lucide-react";
import { cn } from "cn";
import { PageHeader, Section, SectionGroup } from "@/components/common/ui-bits";
import { StatusPill } from "@/components/common/status";
import { ActionItems, AgendaCheck, MeetingControls, MeetingNotes, Topics } from "@/components/meetings/meeting-room";
import { loadMeeting, type AgendaTask } from "@/lib/data/meetings";
import { daysBetween, formatDay, formatMinutes } from "@/lib/domain/dates";
import { formatMeetingTime, formatTime } from "@/lib/domain/meetings";

export const metadata = { title: "Meeting" };

function AgendaRow({ id, href, children, aside }: { id: string; href: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 px-3.5 py-2">
      <AgendaCheck id={id} />
      <Link href={href} className="min-w-0 flex-1 text-[14px] leading-5 hover:text-primary">
        {children}
      </Link>
      {aside && <span className="shrink-0">{aside}</span>}
    </li>
  );
}

function TaskRows({ tasks, meetingId, project, today, late }: { tasks: AgendaTask[]; meetingId: string; project: (id: string) => string | null; today: string; late?: boolean }) {
  return (
    <ul>
      {tasks.map((t) => (
        <AgendaRow
          key={t.id}
          id={`${meetingId}:task:${t.id}`}
          href={`/tasks/${t.id}`}
          aside={late && t.due ? <span className="text-xs text-danger">{daysBetween(t.due, today)}d late</span> : <StatusPill status={t.status} />}
        >
          {t.title}
          {project(t.projectId) && <span className="block truncate text-xs text-muted-foreground">{project(t.projectId)}</span>}
        </AgendaRow>
      ))}
    </ul>
  );
}

/** One meeting: the live agenda on the left, shared notes and action items on the right. */
export default async function MeetingPage({ params }: PageProps<"/meetings/[meetingId]">) {
  const { meetingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) notFound();
  const detail = await loadMeeting(meetingId);
  if (!detail) notFound();
  const { meeting, role, userId, timeZone, today, agenda } = detail;

  const done = meeting.status === "done";
  const professor = role === "professor";
  const studentFirst = meeting.studentName.split(" ")[0];
  const professorShort = meeting.professorName.replace(/^((?:Prof|Dr)\.?)\s+.*?(\S+)$/, "$1 $2");
  const titles = new Map(detail.projects.map((p) => [p.id, p.title]));
  const project = (id: string) => (detail.projects.length > 1 ? (titles.get(id) ?? null) : null);
  const reportHref = agenda.report ? `/reports/${agenda.report.weekStart}${professor ? `?student=${meeting.student_id}` : ""}` : "";

  const live = [
    agenda.lastMeeting && agenda.lastMeeting.items.length > 0,
    agenda.requests.length,
    agenda.blockers.length,
    agenda.inReview.length,
    agenda.changesRequested.length,
    agenda.overdue.length,
    agenda.report,
  ].some(Boolean);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/meetings" className="hover:text-foreground">
            ← Meetings
          </Link>
        }
        title={`Meeting with ${meeting.other.name}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{formatMeetingTime(meeting.starts_at, timeZone)}</span>
            {done && meeting.ended_at && (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2 className="size-3.5" /> Ended {formatTime(meeting.ended_at, timeZone)}
              </span>
            )}
          </span>
        }
        actions={
          <MeetingControls
            role={role}
            canCancel={meeting.created_by === userId}
            meeting={{ id: meeting.id, startsAt: meeting.starts_at, status: meeting.status, otherName: meeting.other.name }}
          />
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid min-w-0 gap-5">
          {!done && (
            <Section icon={ClipboardList} title="Agenda" action="Built from what's open between you" bodyClassName="pb-1">
              {!live && <p className="px-4 py-5 text-center text-muted-foreground">Nothing open between you right now. Add a topic below.</p>}

              {agenda.lastMeeting && agenda.lastMeeting.items.length > 0 && (
                <>
                  <SectionGroup first>Agreed last time · {formatDay(agenda.lastMeeting.startsAt.slice(0, 10))}</SectionGroup>
                  <ul>
                    {agenda.lastMeeting.items.map((t) => (
                      <AgendaRow
                        key={t.id}
                        id={`${meeting.id}:last:${t.id}`}
                        href={`/tasks/${t.id}`}
                        aside={t.status === "done" ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" /> Done</span> : <StatusPill status={t.status} />}
                      >
                        {t.title}
                      </AgendaRow>
                    ))}
                  </ul>
                </>
              )}

              {agenda.requests.length > 0 && (
                <>
                  <SectionGroup first={!(agenda.lastMeeting && agenda.lastMeeting.items.length)}>{professor ? "Your open requests" : `${professorShort} asked`}</SectionGroup>
                  <ul>
                    {agenda.requests.map((r) => (
                      <AgendaRow
                        key={r.id}
                        id={`${meeting.id}:remark:${r.id}`}
                        href={r.taskId ? `/tasks/${r.taskId}#remark-${r.id}` : `/projects/${r.projectId}/remarks#remark-${r.id}`}
                        aside={<span className="text-[11px] text-muted-foreground">{r.kind === "question" ? "Question" : "Change"}</span>}
                      >
                        <span className="line-clamp-2">{r.body}</span>
                      </AgendaRow>
                    ))}
                  </ul>
                </>
              )}

              {agenda.blockers.length > 0 && (
                <>
                  <SectionGroup>Blockers</SectionGroup>
                  <ul>
                    {agenda.blockers.map((b) => (
                      <AgendaRow
                        key={b.id}
                        id={`${meeting.id}:blocker:${b.id}`}
                        href={`/projects/${b.projectId}/blockers#blocker-${b.id}`}
                        aside={<span className={cn("text-[11px] capitalize", b.severity === "high" ? "text-danger" : "text-warning")}>{b.severity}</span>}
                      >
                        {b.title}
                      </AgendaRow>
                    ))}
                  </ul>
                </>
              )}

              {agenda.inReview.length > 0 && (
                <>
                  <SectionGroup>{professor ? "Waiting for your review" : "Waiting for review"}</SectionGroup>
                  <TaskRows tasks={agenda.inReview} meetingId={meeting.id} project={project} today={today} />
                </>
              )}
              {agenda.changesRequested.length > 0 && (
                <>
                  <SectionGroup>Changes requested</SectionGroup>
                  <TaskRows tasks={agenda.changesRequested} meetingId={meeting.id} project={project} today={today} />
                </>
              )}
              {agenda.overdue.length > 0 && (
                <>
                  <SectionGroup>Overdue</SectionGroup>
                  <TaskRows tasks={agenda.overdue} meetingId={meeting.id} project={project} today={today} late />
                </>
              )}

              {agenda.report && (
                <>
                  <SectionGroup>Last weekly report · week of {formatDay(agenda.report.weekStart)}</SectionGroup>
                  <ul>
                    <AgendaRow id={`${meeting.id}:report`} href={reportHref}>
                      {agenda.report.summary || "Weekly report"}
                      {agenda.report.note && <span className="mt-0.5 block text-[13px] text-muted-foreground italic">“{agenda.report.note}”</span>}
                    </AgendaRow>
                  </ul>
                </>
              )}
            </Section>
          )}

          {!done && (
            <Section icon={NotebookPen} accent="success" title={`Since ${agenda.lastMeeting ? "the last meeting" : "last week"}`}>
              <div className="px-4 py-3 text-[14px]">
                {agenda.sinceLast.logs === 0 ? (
                  <p className="flex items-center gap-2 text-warning">
                    <AlertTriangle className="size-4" /> No progress logged since {formatDay(agenda.sinceLast.from)}.
                  </p>
                ) : (
                  <p>
                    <b className="font-semibold">{agenda.sinceLast.logs}</b> log {agenda.sinceLast.logs === 1 ? "entry" : "entries"} ·{" "}
                    <b className="font-semibold">{formatMinutes(agenda.sinceLast.minutes)}</b> of work
                  </p>
                )}
                {agenda.sinceLast.problems.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">Problems {professor ? studentFirst : "you"} wrote down</p>
                    <ul className="mt-1 grid list-disc gap-0.5 pl-4 text-[13px] marker:text-muted-foreground">
                      {agenda.sinceLast.problems.map((p) => (
                        <li key={p} className="line-clamp-2">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link href={professor ? `/students/${meeting.student_id}` : "/log"} className="mt-2 inline-block text-xs text-primary hover:underline">
                  {professor ? `Open ${studentFirst}'s logs` : "Open your log"}
                </Link>
              </div>
            </Section>
          )}

          <Section icon={MessageSquareWarning} accent="warning" title="Topics" count={detail.topics.length || undefined} bodyClassName="p-3">
            {detail.topics.length === 0 && done ? (
              <p className="text-[13px] text-muted-foreground">No extra topics were added.</p>
            ) : (
              <Topics meetingId={meeting.id} topics={detail.topics} userId={userId} open={!done} />
            )}
          </Section>
        </div>

        <div className="grid min-w-0 gap-5 lg:sticky lg:top-20">
          <Section icon={ScrollText} accent="info" title="Notes" bodyClassName="p-3">
            <MeetingNotes
              meetingId={meeting.id}
              initial={meeting.notes}
              placeholder={"What you decided, numbers worth keeping, what to try next.\n\nAction items go below, so they become tasks."}
            />
          </Section>
          <Section icon={ListChecks} accent="success" title={professor ? `Action items for ${studentFirst}` : "Your action items"} count={detail.actionItems.length || undefined} bodyClassName="p-3">
            <ActionItems meetingId={meeting.id} items={detail.actionItems} projects={detail.projects} today={today} studentFirstName={studentFirst} role={role} />
          </Section>
          {done && (
            <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Handshake className="size-3.5" /> {professor ? `${studentFirst} was notified when this meeting ended.` : `${professorShort} was notified when this meeting ended.`}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
