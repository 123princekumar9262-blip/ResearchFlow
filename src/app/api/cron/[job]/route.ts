import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { buildDigests, digestEmail, quietToday } from "@/lib/notify/digest";
import { isEmailConfigured, sendEmail } from "@/lib/notify/email";
import { pushToUsers } from "@/lib/notify/push";
import { formatTime } from "@/lib/domain/meetings";

// Scheduled by vercel.json. Vercel calls these with "Authorization: Bearer
// $CRON_SECRET"; anything else is refused.
//   morning (08:00 IST): the email digest, a one-line push summary, and
//                        a reminder for each meeting later today
//   evening (20:00 IST): "no log yet today" for students with open work

export const maxDuration = 60;

export async function GET(request: Request, ctx: RouteContext<"/api/cron/[job]">) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not set" }, { status: 500 });
  const { job } = await ctx.params;
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;

  // ?dry=1: show who would get what, without sending anything.
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  if (job === "morning") {
    const digests = await buildDigests(admin);
    // Meetings in the next 18 hours: both people hear when, in their own time zone.
    const now = Date.now();
    const { data: meetings } = await admin
      .from("meetings")
      .select("id, starts_at, professor_id, student_id, professor:profiles!meetings_professor_id_fkey(full_name, timezone), student:profiles!meetings_student_id_fkey(full_name, timezone)")
      .eq("status", "scheduled")
      .gte("starts_at", new Date(now).toISOString())
      .lt("starts_at", new Date(now + 18 * 3_600_000).toISOString());
    const reminders = (meetings ?? []).flatMap((m) => [
      { to: m.professor_id, title: `Meeting today with ${m.student?.full_name ?? "your student"}`, time: formatTime(m.starts_at, m.professor?.timezone ?? "UTC"), id: m.id },
      { to: m.student_id, title: `Meeting today with ${m.professor?.full_name ?? "your professor"}`, time: formatTime(m.starts_at, m.student?.timezone ?? "UTC"), id: m.id },
    ]);
    if (dry) return NextResponse.json({ job, meetings: reminders.map((r) => `${r.title} at ${r.time}`), digests: digests.map((d) => ({ name: d.name, headline: d.headline, email: Boolean(d.email), wantsEmail: d.wantsEmail, sections: d.sections.map((s) => `${s.title} (${s.lines.length})`) })) });
    let emails = 0;
    let pushes = 0;
    for (const d of digests) {
      if (d.headline) pushes += await pushToUsers([d.userId], { title: "Good morning", body: d.headline, url: "/dashboard", tag: "digest" });
      if (d.headline && d.wantsEmail && d.email && isEmailConfigured()) {
        if (await sendEmail({ to: d.email, ...digestEmail(d, origin) })) emails++;
      }
    }
    for (const r of reminders) {
      pushes += await pushToUsers([r.to], { title: r.title, body: `${r.time}. The agenda is ready: open it to add a topic.`, url: `/meetings/${r.id}`, tag: `meeting-${r.id}` }, { urgent: true });
    }
    return NextResponse.json({ job, people: digests.length, emails, pushes, meetings: reminders.length / 2 });
  }

  if (job === "evening") {
    const students = await quietToday(admin);
    if (dry) return NextResponse.json({ job, students });
    const pushes = await pushToUsers(students, { title: "No log yet today", body: "About a minute. It's your evidence when results aren't in yet.", url: "/log/new", tag: "evening-log" });
    return NextResponse.json({ job, students: students.length, pushes });
  }

  return NextResponse.json({ error: "unknown job" }, { status: 404 });
}
