import "server-only";

import { addDays, daysBetween, formatDay, todayIn } from "@/lib/domain/dates";
import { remarksAwaiting, type ActionRemark } from "@/lib/domain/next-action";
import type { adminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

export interface DigestLine {
  text: string;
  href: string;
  tone?: "danger" | "warning" | "info";
}

export interface Digest {
  userId: string;
  name: string;
  email: string | null;
  wantsEmail: boolean;
  /** One line for the subject and the morning notification; null when there's nothing to say. */
  headline: string | null;
  sections: { title: string; lines: DigestLine[] }[];
}

const excerpt = (text: string, max = 90) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Everyone's morning summary, built from the same data the dashboards use. */
export async function buildDigests(admin: Admin): Promise<Digest[]> {
  const [{ data: profiles }, { data: members }, { data: tasks }, { data: remarks }, { data: blockers }, { data: reports }, { data: logs }, usersPage] = await Promise.all([
    // "*" so this works before and after the digest_email column exists.
    admin.from("profiles").select("*"),
    admin.from("project_members").select("project_id, user_id, role"),
    admin
      .from("tasks")
      .select("id, title, project_id, assignee_id, status, priority, professor_deadline, personal_deadline, effective_deadline, submitted_at, updated_at")
      .neq("status", "done"),
    admin
      .from("remarks")
      .select("id, body, kind, source, task_id, project_id, parent_id, addressed_at, created_at, author:profiles!remarks_author_id_fkey(full_name, role)")
      .is("addressed_at", null)
      .in("kind", ["change_request", "question"]),
    admin.from("blockers").select("id, title, project_id, raised_by, severity, needs_professor, created_at").eq("status", "open"),
    admin.from("weekly_reports").select("id, student_id, week_start").not("submitted_at", "is", null).is("acknowledged_at", null),
    admin.from("progress_logs").select("author_id, log_date").gte("log_date", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailOf = new Map((usersPage.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const projectsOf = (userId: string, role: "student" | "professor") =>
    new Set((members ?? []).filter((m) => m.user_id === userId && m.role === role).map((m) => m.project_id));
  const lastLog = new Map<string, string>();
  for (const l of logs ?? []) if ((lastLog.get(l.author_id) ?? "") < l.log_date) lastLog.set(l.author_id, l.log_date);

  return (profiles ?? []).map((p) => {
    const today = todayIn(p.timezone);
    const sections: Digest["sections"] = [];
    const counts: string[] = [];

    if (p.role === "student") {
      const mine = (tasks ?? []).filter((t) => t.assignee_id === p.id);
      const overdue = mine.filter((t) => t.status !== "in_review" && t.effective_deadline && t.effective_deadline < today);
      const dueToday = mine.filter((t) => t.status !== "in_review" && t.effective_deadline === today);
      const projects = projectsOf(p.id, "student");
      const asks = remarksAwaiting(
        (remarks ?? [])
          .filter((r) => projects.has(r.project_id))
          .map((r) => ({ ...r, author_role: r.author?.role ?? "student" }) as ActionRemark & { author: { full_name: string } | null }),
        tasks ?? [],
        p.id,
      );
      const changes = mine.filter((t) => t.status === "changes_requested");
      if (overdue.length) {
        counts.push(`${overdue.length} overdue`);
        sections.push({ title: "Overdue", lines: overdue.map((t) => ({ text: `${t.title} · was due ${formatDay(t.effective_deadline!)}`, href: `/tasks/${t.id}`, tone: "danger" })) });
      }
      if (dueToday.length) {
        counts.push(`${dueToday.length} due today`);
        sections.push({ title: "Due today", lines: dueToday.map((t) => ({ text: t.title, href: `/tasks/${t.id}`, tone: "warning" })) });
      }
      if (asks.length || changes.length) {
        const from = asks[0]?.author?.full_name;
        counts.push(asks.length ? `${plural(asks.length, "request")}${from ? ` from ${from}` : ""}` : `${plural(changes.length, "task")} sent back`);
        sections.push({
          title: "Your professor is waiting",
          lines: [
            ...asks.map((r) => ({ text: `"${excerpt(r.body)}"`, href: r.task_id ? `/tasks/${r.task_id}#remark-${r.id}` : `/projects/${r.project_id}/remarks#remark-${r.id}` })),
            ...changes.map((t) => ({ text: `Changes requested on ${t.title}`, href: `/tasks/${t.id}` })),
          ],
        });
      }
    } else {
      const projects = projectsOf(p.id, "professor");
      const reviews = (tasks ?? []).filter((t) => projects.has(t.project_id) && t.status === "in_review");
      const needYou = (blockers ?? []).filter((b) => projects.has(b.project_id) && b.needs_professor);
      const students = [...new Set((members ?? []).filter((m) => projects.has(m.project_id) && m.role === "student").map((m) => m.user_id))];
      const quiet = students.filter((s) => {
        const last = lastLog.get(s);
        return !last || daysBetween(last, today) >= 3;
      });
      const unread = (reports ?? []).filter((r) => students.includes(r.student_id));
      if (reviews.length) {
        counts.push(`${plural(reviews.length, "review")} waiting`);
        sections.push({ title: "Waiting for your review", lines: reviews.map((t) => ({ text: `${t.title} · ${nameOf.get(t.assignee_id ?? "") ?? "a student"}`, href: `/reviews?task=${t.id}`, tone: "info" })) });
      }
      if (needYou.length) {
        counts.push(plural(needYou.length, "blocker"));
        sections.push({ title: "Blockers that need you", lines: needYou.map((b) => ({ text: `${b.title} · ${nameOf.get(b.raised_by) ?? "a student"} · ${b.severity}`, href: `/projects/${b.project_id}/blockers#blocker-${b.id}`, tone: "danger" })) });
      }
      if (quiet.length) {
        counts.push(`${plural(quiet.length, "quiet student")}`);
        sections.push({
          title: "No progress logged for 3+ days",
          lines: quiet.map((s) => ({ text: `${nameOf.get(s) ?? "A student"} · ${lastLog.get(s) ? `last log ${formatDay(lastLog.get(s)!)}` : "no logs yet"}`, href: `/students/${s}`, tone: "warning" })),
        });
      }
      if (unread.length) {
        counts.push(`${plural(unread.length, "report")} to read`);
        sections.push({ title: "Weekly reports to read", lines: unread.map((r) => ({ text: `${nameOf.get(r.student_id) ?? "A student"} · week of ${formatDay(r.week_start)}`, href: `/reports/${r.week_start}?student=${r.student_id}` })) });
      }
    }

    return {
      userId: p.id,
      name: p.full_name,
      email: emailOf.get(p.id) ?? null,
      wantsEmail: p.digest_email ?? true,
      headline: counts.length ? `Today: ${counts.join(" · ")}` : null,
      sections,
    };
  });
}

/** Students with open work and no log today: the evening nudge. */
export async function quietToday(admin: Admin): Promise<string[]> {
  const [{ data: profiles }, { data: tasks }, { data: logs }] = await Promise.all([
    admin.from("profiles").select("id, timezone").eq("role", "student"),
    admin.from("tasks").select("assignee_id").in("status", ["todo", "in_progress", "changes_requested"]),
    admin.from("progress_logs").select("author_id, log_date").gte("log_date", addDays(new Date().toISOString().slice(0, 10), -1)),
  ]);
  const busy = new Set((tasks ?? []).map((t) => t.assignee_id));
  return (profiles ?? [])
    .filter((p) => busy.has(p.id))
    .filter((p) => {
      const today = todayIn(p.timezone);
      return !(logs ?? []).some((l) => l.author_id === p.id && l.log_date === today);
    })
    .map((p) => p.id);
}

/** The digest as an email: plain, readable, and every line links into the app. */
export function digestEmail(d: Digest, origin: string): { subject: string; html: string; text: string } {
  const color = { danger: "#DC2626", warning: "#A16207", info: "#2563EB" } as const;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html><body style="margin:0;background:#FBFBFA;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1C1C1E">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-weight:650;font-size:15px;color:#4F46E5;margin-bottom:16px">ResearchFlow</div>
<div style="background:#fff;border:1px solid #E7E6E3;border-radius:12px;padding:20px">
<p style="margin:0 0 4px;font-size:18px;font-weight:600">Good morning, ${esc(d.name.split(" ")[0] ?? d.name)}</p>
<p style="margin:0 0 16px;color:#6B6B72">${esc(d.headline ?? "Nothing needs you today.")}</p>
${d.sections
  .map(
    (s) => `<p style="margin:16px 0 6px;font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#6B6B72">${esc(s.title)}</p>
${s.lines.map((l) => `<p style="margin:0 0 6px"><a href="${origin}${l.href}" style="color:${l.tone ? color[l.tone] : "#1C1C1E"};text-decoration:none">${esc(l.text)}</a></p>`).join("")}`,
  )
  .join("")}
<p style="margin:20px 0 0"><a href="${origin}/dashboard" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:500">Open ResearchFlow</a></p>
</div>
<p style="color:#6B6B72;font-size:12px;margin-top:16px">You get this because the morning email is on. Turn it off in Settings → Notifications.</p>
</div></body></html>`;
  const text = [`Good morning, ${d.name}`, d.headline ?? "Nothing needs you today.", ...d.sections.flatMap((s) => ["", s.title.toUpperCase(), ...s.lines.map((l) => `- ${l.text} (${origin}${l.href})`)]), "", `${origin}/dashboard`].join("\n");
  return { subject: d.headline ?? "ResearchFlow: nothing needs you today", html, text };
}
