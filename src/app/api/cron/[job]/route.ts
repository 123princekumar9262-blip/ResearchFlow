import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { buildDigests, digestEmail, quietToday } from "@/lib/notify/digest";
import { isEmailConfigured, sendEmail } from "@/lib/notify/email";
import { pushToUsers } from "@/lib/notify/push";

// Scheduled by vercel.json. Vercel calls these with "Authorization: Bearer
// $CRON_SECRET"; anything else is refused.
//   morning (08:00 IST): the email digest and a one-line push summary
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
    if (dry) return NextResponse.json({ job, digests: digests.map((d) => ({ name: d.name, headline: d.headline, email: Boolean(d.email), wantsEmail: d.wantsEmail, sections: d.sections.map((s) => `${s.title} (${s.lines.length})`) })) });
    let emails = 0;
    let pushes = 0;
    for (const d of digests) {
      if (d.headline) pushes += await pushToUsers([d.userId], { title: "Good morning", body: d.headline, url: "/dashboard", tag: "digest" });
      if (d.headline && d.wantsEmail && d.email && isEmailConfigured()) {
        if (await sendEmail({ to: d.email, ...digestEmail(d, origin) })) emails++;
      }
    }
    return NextResponse.json({ job, people: digests.length, emails, pushes });
  }

  if (job === "evening") {
    const students = await quietToday(admin);
    if (dry) return NextResponse.json({ job, students });
    const pushes = await pushToUsers(students, { title: "No log yet today", body: "About a minute. It's your evidence when results aren't in yet.", url: "/log/new", tag: "evening-log" });
    return NextResponse.json({ job, students: students.length, pushes });
  }

  return NextResponse.json({ error: "unknown job" }, { status: 404 });
}
