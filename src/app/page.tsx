import Link from "next/link";
import { ArrowRight, CalendarClock, FileCheck2, MessageSquareReply, ScrollText } from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

const PILLARS = [
  {
    icon: CalendarClock,
    title: "Deadlines with owners",
    body: "Your professor sets the deadline; only they can move it, and every move is on record. Your own earlier target sits beside it.",
  },
  {
    icon: FileCheck2,
    title: "Progress with proof",
    body: "Nothing is submitted without evidence: a progress log, a file, a commit link. Done means approved, not ticked.",
  },
  {
    icon: MessageSquareReply,
    title: "Feedback that becomes work",
    body: "Every professor remark turns into a tracked task in one click, and stays open until it's addressed.",
  },
  {
    icon: ScrollText,
    title: "A report that writes itself",
    body: "Your week becomes a summary from your logs and tasks. Add a note, submit it, or send a link to your professor.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-4 font-mono text-xs tracking-wider text-muted-foreground uppercase">For research students and their professors</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Accountability through deadlines and proof-based progress.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-pretty text-muted-foreground">
          ResearchFlow replaces &ldquo;so&hellip; where are we?&rdquo; with a record. Students always know the next action; professors see who is on
          track, who is stuck and what needs them, in one screen.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">
              Create your account <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">I have an account</Link>
          </Button>
        </div>

        <ul className="mt-16 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-card p-5">
              <Icon className="mb-3 size-5 text-primary" aria-hidden />
              <h2 className="font-medium">{title}</h2>
              <p className="mt-1 text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="py-6 text-xs text-muted-foreground">Works before your professor joins: start alone, invite them with a join code later.</footer>
    </div>
  );
}
