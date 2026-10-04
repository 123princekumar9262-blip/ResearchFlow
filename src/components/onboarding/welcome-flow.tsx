"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Lock } from "lucide-react";
import { cn } from "cn";
import { LogoMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCode, inviteMessage } from "@/components/settings/join-code";
import { createProject } from "@/server/actions/projects";
import { linkProfessorByCode, saveOnboarding } from "@/server/actions/onboarding";
import type { Onboarding } from "@/lib/onboarding/state";

interface Person {
  id: string;
  name: string;
}

interface Props {
  role: "student" | "professor";
  firstName: string;
  joinCode: string;
  origin: string;
  today: string;
  people: Person[];
  projects: { id: string; title: string }[];
  initial: Onboarding;
  persisted: boolean;
  userId: string;
}

const STEPS = 4;
const DRAFT_KEY = "rf.welcome.draft";

function readDraft(): { code?: string; title?: string; end?: string } {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? localStorage.getItem(DRAFT_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** XXXX-XXXX from whatever was typed or pasted. */
function shapeCode(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function WelcomeFlow(props: Props) {
  const { role, firstName, joinCode, origin, today, initial, persisted, userId } = props;
  const router = useRouter();
  const [screen, setScreen] = useState(() => (initial.setup === "in_progress" ? Math.min(initial.screen ?? 0, 3) : 0));
  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const [people, setPeople] = useState<Person[]>(props.people);
  const [projects, setProjects] = useState(props.projects);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [end, setEnd] = useState("");
  const [members, setMembers] = useState<string[]>(() => props.people.map((p) => p.id));
  const [linking, startLink] = useTransition();
  const [creating, startCreate] = useTransition();
  const counted = useRef(false);

  const save = (patch: Partial<Onboarding>) => {
    try {
      const key = `rf.onboarding.${userId}`;
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? "{}"), ...patch }));
    } catch {
      /* storage blocked */
    }
    if (persisted) void saveOnboarding(patch);
  };

  // Count the visit once; after two abandoned visits the dashboard stops sending people here.
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    // Restore what was typed before the tab closed (after hydration, so server and client agree).
    requestAnimationFrame(() => {
      const d = readDraft();
      if (d.code) setCode(d.code);
      if (d.title) setTitle(d.title);
      if (d.end) setEnd(d.end);
    });
    save({ setup: "in_progress", visits: (initial.visits ?? 0) + 1, screen });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What was typed survives a closed tab.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ code, title, end }));
    } catch {
      /* storage blocked */
    }
  }, [code, title, end]);

  const go = (to: number) => {
    setDir(to > screen ? 1 : -1);
    setScreen(to);
    save({ setup: "in_progress", screen: to });
  };

  const finish = () => {
    save({ setup: "done", screen: undefined });
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage blocked */
    }
    setLeaving(true);
    setTimeout(() => router.push("/dashboard?tour=core"), 300);
  };

  const skipSetup = () => {
    save({ setup: "skipped", screen: undefined });
    router.push("/dashboard");
  };

  const link = (value: string) => {
    setCodeError(null);
    startLink(async () => {
      const res = await linkProfessorByCode({ code: value });
      if (!res.ok) return setCodeError(res.error);
      setPeople((p) => (p.some((x) => x.id === res.data.id) ? p : [...p, res.data]));
      setMembers((m) => (m.includes(res.data.id) ? m : [...m, res.data.id]));
      setCode("");
    });
  };

  const create = () => {
    if (!title.trim()) return;
    startCreate(async () => {
      const res = await createProject({ title: title.trim(), description: "", startDate: today, targetEndDate: end, memberIds: members });
      if (!res.ok) return void toast.error(res.error);
      setProjects((p) => [...p, { id: res.data as string, title: title.trim() }]);
      setTitle("");
      setEnd("");
    });
  };

  const copy = (text: string, done: string) =>
    navigator.clipboard.writeText(text).then(
      () => {
        toast.success(done);
        save({ shared: true });
      },
      () => toast.error("Couldn't copy. Select the text and copy it instead."),
    );

  // Enter continues, Esc goes back (not while a field has something to say about it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
      if (e.key === "Escape" && screen > 0) {
        e.preventDefault();
        go(screen - 1);
      } else if (e.key === "Enter" && !inField && !(el instanceof HTMLButtonElement)) {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-primary]")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const professors = people;
  const students = people;

  return (
    <div className={cn("relative flex min-h-dvh flex-col overflow-hidden bg-background transition-opacity duration-300", leaving && "opacity-0")}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_70%)]" />
      <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+24px)] sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={screen + 1} aria-label={`Step ${screen + 1} of ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => (
              <i key={i} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i <= screen ? "bg-grad-primary" : "bg-border")} />
            ))}
          </div>
          {screen > 0 && (
            <button type="button" onClick={skipSetup} className="text-xs text-muted-foreground hover:text-foreground">
              Skip setup
            </button>
          )}
        </div>

        <main key={screen} className={cn("flex flex-1 flex-col justify-center py-8", dir === 1 ? "rf-welcome-in" : "rf-welcome-back")}>
          {screen === 0 && (
            <section className="grid justify-items-center gap-5 text-center">
              <span className="rf-welcome-logo inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
                <LogoMark className="size-8 drop-shadow-[0_6px_14px_rgba(79,70,229,0.35)]" />
                ResearchFlow
              </span>
              <div className="relative flex flex-wrap justify-center gap-2 py-2">
                <span aria-hidden className="rf-welcome-line absolute inset-x-6 top-1/2 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                {[
                  { label: "Deadlines", dot: "bg-danger" },
                  { label: "Daily log", dot: "bg-primary" },
                  { label: "Weekly report", dot: "bg-success" },
                ].map((chip, i) => (
                  <span
                    key={chip.label}
                    className="rf-welcome-chip relative inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-[var(--shadow-card)]"
                    style={{ animationDelay: `${300 + i * 90}ms` }}
                  >
                    <i className={cn("size-[7px] rounded-full", chip.dot)} /> {chip.label}
                  </span>
                ))}
              </div>
              <h1 className="rf-welcome-late text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-[40px]" style={{ animationDelay: "650ms" }}>
                Stay accountable.
                <br />
                <span className="bg-grad-primary bg-clip-text text-transparent">Track real progress.</span>
              </h1>
              <p className="rf-welcome-late max-w-[40ch] text-[15px] text-muted-foreground sm:text-base" style={{ animationDelay: "750ms" }}>
                Hi {firstName}. Three quick steps and your research has a system: deadlines with owners, progress with evidence, feedback that turns into work.
              </p>
              <div className="rf-welcome-late grid justify-items-center gap-1" style={{ animationDelay: "850ms" }}>
                <Button size="lg" className="h-11 px-6 text-[15px]" onClick={() => go(1)} data-primary>
                  Start setup
                </Button>
                <button type="button" onClick={skipSetup} className="px-2 py-2 text-[13px] text-muted-foreground hover:text-foreground">
                  Skip setup, I&apos;ll explore
                </button>
              </div>
            </section>
          )}

          {screen === 1 && (
            <section className="grid gap-5">
              <h1 className="text-center text-[24px] font-semibold tracking-tight sm:text-[28px]">How ResearchFlow works for you</h1>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["student", "professor"] as const).map((r) => {
                  const mine = r === role;
                  return (
                    <div
                      key={r}
                      role="radio"
                      aria-checked={mine}
                      aria-disabled={!mine}
                      className={cn(
                        "grid gap-2 rounded-xl border p-4 text-left",
                        mine ? "border-primary bg-primary/[0.05] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_12%,transparent)]" : "bg-card opacity-60",
                      )}
                    >
                      <p className="flex items-center justify-between font-semibold">
                        {r === "student" ? "Student" : "Professor"}
                        {mine ? <Check className="size-4 text-primary" /> : <Lock className="size-3.5 text-muted-foreground" />}
                      </p>
                      <p className="text-[13px] text-foreground/80">{r === "student" ? "You own the work and the evidence." : "You own the deadlines and the approval."}</p>
                      <ul className="grid list-disc gap-0.5 pl-4 text-[12.5px] text-muted-foreground">
                        {(r === "student"
                          ? ["Write a log every day", "Finish tasks before their deadlines", "Submit work with proof attached"]
                          : ["Set milestones and deadlines", "Review submitted work", "Read weekly reports"]
                        ).map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                You signed up as a {role === "student" ? "Student" : "Professor"}. Roles are fixed because they decide who can move deadlines.
              </p>
              <div className="flex justify-center">
                <Button size="lg" className="h-11 px-6" onClick={() => go(2)} data-primary>
                  That&apos;s me, continue
                </Button>
              </div>
            </section>
          )}

          {screen === 2 && role === "student" && (
            <section className="grid gap-5">
              <div className="grid gap-2 text-center">
                <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Link your professor</h1>
                <p className="mx-auto max-w-[44ch] text-muted-foreground">
                  Ask your professor for their 8-character join code. Linking gives your deadlines an owner and your work a reviewer.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="welcome-code">Join code</Label>
                <Input
                  id="welcome-code"
                  value={code}
                  onChange={(e) => {
                    const v = shapeCode(e.target.value);
                    setCode(v);
                    setCodeError(null);
                    if (v.replace("-", "").length === 8) link(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && code.replace("-", "").length >= 4) {
                      e.preventDefault();
                      link(code);
                    }
                  }}
                  placeholder="K7Q2-MX4P"
                  autoFocus={professors.length === 0}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                  aria-invalid={!!codeError}
                  aria-describedby="welcome-code-status"
                  className="h-12 font-mono text-lg tracking-[0.18em] uppercase"
                />
                <p id="welcome-code-status" className="min-h-5 text-[13px]" role="status">
                  {linking ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Checking the code…
                    </span>
                  ) : codeError ? (
                    <span className="text-danger">{codeError}</span>
                  ) : professors.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
                      Linked to{" "}
                      {professors.map((p, i) => (
                        <b key={p.id} className="flex items-center gap-1 font-semibold text-foreground">
                          {p.name}
                          <Check className="size-3.5 text-success" />
                          {i < professors.length - 1 && ","}
                        </b>
                      ))}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => go(3)} className="px-1 py-2 text-[13px] text-muted-foreground hover:text-foreground">
                  I&apos;m working solo for now
                </button>
                <Button size="lg" className="h-11 px-6" onClick={() => go(3)} disabled={professors.length === 0} data-primary>
                  Continue
                </Button>
              </div>
            </section>
          )}

          {screen === 2 && role === "professor" && (
            <section className="grid justify-items-center gap-5 text-center">
              <div className="grid gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Bring in your students</h1>
                <p className="mx-auto max-w-[44ch] text-muted-foreground">Students enter this code to link to you. They appear on your dashboard straight away.</p>
              </div>
              <code className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.06] px-5 py-3 font-mono text-[28px] font-medium tracking-[0.16em]">
                {formatCode(joinCode)}
              </code>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => copy(formatCode(joinCode), "Code copied")}>
                  <Copy /> Copy code
                </Button>
                <Button variant="outline" onClick={() => copy(inviteMessage(joinCode, origin), "Invite message copied")}>
                  <Copy /> Copy invite message
                </Button>
              </div>
              {students.length > 0 && <p className="text-[13px] text-muted-foreground">Already linked: {students.map((s) => s.name).join(", ")}</p>}
              <Button size="lg" className="h-11 px-6" onClick={() => go(3)} data-primary>
                Continue
              </Button>
            </section>
          )}

          {screen === 3 && (
            <section className="grid gap-5">
              <div className="grid gap-2 text-center">
                <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">{role === "student" ? "Create your first project" : "Create a project"}</h1>
                <p className="mx-auto max-w-[46ch] text-muted-foreground">
                  {role === "student"
                    ? "One project per piece of research: a thesis chapter, a paper, an experiment series. You can add more later."
                    : "Set it up now and add your students, or wait for them to add you to theirs."}
                </p>
              </div>

              {projects.length > 0 ? (
                <>
                  <ul className="grid gap-2">
                    {projects.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
                        <span className="grid size-6 place-items-center rounded-full bg-success text-white">
                          <Check className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-center">
                    <Button size="lg" className="h-11 px-6" onClick={finish} data-primary>
                      Finish setup
                    </Button>
                  </div>
                </>
              ) : (
                <form
                  className="grid gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    create();
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="welcome-title">Project title</Label>
                    <Input
                      id="welcome-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={role === "student" ? "Boost converter for solar MPPT" : "Power electronics lab: 2026 projects"}
                      required
                      maxLength={200}
                      autoFocus
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="welcome-end">
                      Target end <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input id="welcome-end" type="date" min={today} value={end} onChange={(e) => setEnd(e.target.value)} className="h-12 text-base sm:w-56" />
                  </div>
                  {people.length > 0 && (
                    <fieldset className="grid gap-1.5">
                      <legend className="mb-1 text-sm font-medium">{role === "student" ? "Your professor is added" : "Add your students"}</legend>
                      {people.map((p) => (
                        <label key={p.id} className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-[14px]">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--primary)]"
                            checked={members.includes(p.id)}
                            onChange={(e) => setMembers((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))}
                          />
                          {p.name}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={finish} className="px-1 py-2 text-[13px] text-muted-foreground hover:text-foreground">
                      {role === "student" ? "I'm already on a project" : "Skip, my students will add me"}
                    </button>
                    <Button type="submit" size="lg" className="h-11 px-6" disabled={creating || !title.trim()} data-primary>
                      {creating && <Loader2 className="animate-spin" />} Create project
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}
        </main>

        {screen > 0 && (
          <button type="button" onClick={() => go(screen - 1)} className="self-start text-[13px] text-muted-foreground hover:text-foreground">
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
