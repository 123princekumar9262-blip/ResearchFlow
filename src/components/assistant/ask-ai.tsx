"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { askAssistant } from "@/server/actions/assistant";
import "katex/dist/katex.min.css";

interface Ref {
  href: string;
  label: string;
}

interface Message {
  role: "user" | "assistant" | "error";
  text: string;
  refs?: Record<string, Ref>;
}

export interface AskAiProps {
  role: "student" | "professor";
  projects: { id: string; title: string }[];
  students: { id: string; name: string }[];
}

const OPEN_EVENT = "rf:ask-ai";

/** Opens the assistant from anywhere (the top bar, a project page). */
export function openAskAi() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Questions people actually ask, by role; the subject ones are power electronics. */
function suggestions(role: "student" | "professor", students: { id: string; name: string }[], scopeStudent?: string): { project: string[]; subject: string[] } {
  if (role === "student") {
    return {
      project: ["What should I work on today, and why?", "What did my professor ask me to change, and have I done it?", "Explain my professor's latest feedback in simple words."],
      subject: ["Why does output ripple increase at light load?", "How do I choose the inductor for a boost converter?", "What causes ringing at the MOSFET switch node?"],
    };
  }
  const name = students.find((s) => s.id === scopeStudent)?.name ?? students[0]?.name;
  return {
    project: [
      ...(name ? [`How is ${name.split(" ")[0]}'s project going? Anything I should worry about?`, `Summarise ${name.split(" ")[0]}'s last two weeks before our meeting.`] : []),
      "Which students have gone quiet, and on what?",
    ],
    subject: ["What should I check in a student's converter efficiency measurement?", "What are common mistakes in a boost converter PCB layout?"],
  };
}

// KaTeX is only fetched once an answer has a formula in it.
let katex: typeof import("katex").default | null = null;
let katexLoading: Promise<unknown> | null = null;

/** A formula: $...$ inline, or its own scrollable line. Shows the source until KaTeX arrives. */
function TeX({ src, block }: { src: string; block?: boolean }) {
  const [, loaded] = useState(0);
  useEffect(() => {
    if (katex) return;
    katexLoading ??= import("katex").then((m) => (katex = m.default));
    let live = true;
    katexLoading.then(() => live && loaded((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);
  const html = katex?.renderToString(src, { displayMode: !!block, throwOnError: false, strict: "ignore", output: "html" });
  if (block)
    return (
      <div className="my-1.5 overflow-x-auto rounded-lg bg-muted/60 px-3 py-2.5 text-center text-[15px] [&_.katex-display]:m-0">
        {html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <code className="font-mono text-[12.5px] text-muted-foreground">{src}</code>}
      </div>
    );
  return html ? <span className="whitespace-nowrap" dangerouslySetInnerHTML={{ __html: html }} /> : <code className="font-mono text-[0.9em]">{src}</code>;
}

/** The formula inside a line that is nothing but a formula: $$…$$, $…$ or \[…\]. */
function displayMath(line: string) {
  const t = line.trim();
  return t.match(/^\$\$(.+)\$\$$/)?.[1] ?? t.match(/^\\\[(.+)\\\]$/)?.[1] ?? t.match(/^\$([^$]+)\$[.,;:]?$/)?.[1] ?? null;
}

/** **bold**, `code`, $math$, and [T3]-style tags that become links to the cited task, log or request. */
function Inline({ text, refs }: { text: string; refs?: Record<string, Ref> }) {
  // A $…$ formula has no space just inside its dollars and no digit after, so "$5 and $10" stays text.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\\\(.+?\\\)|\$(?=\S)[^$\n]+?(?<=\S)\$(?!\d)|\[[TLRBSP]\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\\\(.+\\\)$/.test(p)) return <TeX key={i} src={p.slice(2, -2)} />;
        if (/^\$[^$]+\$$/.test(p)) return <TeX key={i} src={p.slice(1, -1)} />;
        if (/^\*\*[^*]+\*\*$/.test(p))
          return (
            <b key={i} className="font-semibold">
              <Inline text={p.slice(2, -2)} refs={refs} />
            </b>
          );
        if (/^`[^`]+`$/.test(p)) return <code key={i} className="rounded bg-muted px-1 font-mono text-[0.9em]">{p.slice(1, -1)}</code>;
        const tag = p.match(/^\[([TLRBSP]\d+)\]$/)?.[1];
        if (tag) {
          const ref = refs?.[tag];
          if (!ref) return null;
          return (
            <Link key={i} href={ref.href} className="mx-0.5 inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-primary/25 bg-primary/[0.06] px-1.5 align-baseline text-[12px] text-primary hover:bg-primary/10">
              <span className="truncate">{ref.label}</span>
            </Link>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The link chip already shows the name, so drop a copy written next to it: [T3] ("Name"), "Name" [T3], Name ([T3]). */
function dedupe(text: string, refs?: Record<string, Ref>) {
  let out = text;
  for (const [key, ref] of Object.entries(refs ?? {})) {
    const name = escape(ref.label.replace(/…$/, "").trim());
    if (name.length < 3) continue;
    const q = "[\"“”']*";
    const tag = `\\[${key}\\]`;
    out = out
      .replace(new RegExp(`${tag}\\s*\\(\\s*${q}${name}[^)]*?${q}\\s*\\)`, "gi"), `[${key}]`)
      .replace(new RegExp(`${tag}\\s*${q}${name}${q}`, "gi"), `[${key}]`)
      .replace(new RegExp(`${q}${name}${q}\\s*\\(\\s*${tag}\\s*\\)`, "gi"), `[${key}]`)
      .replace(new RegExp(`${q}${name}${q}\\s*${tag}`, "gi"), `[${key}]`);
  }
  return out;
}

interface Item {
  text: string;
  /** Formulas under a bullet, and the "where …" lines explaining them, stay with that bullet. */
  more: { math: boolean; s: string }[];
}
interface Block {
  kind: "p" | "ul" | "ol" | "h" | "math";
  items: Item[];
}

/** Lines into blocks. Lists stay open across blank lines and the formulas under their bullets. */
function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let gap = true;
  const lines = text.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim() || /^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      gap = true;
      continue;
    }
    // A formula: one line, or a $$ / \[ block over several.
    let math = displayMath(line);
    if (math === null && /^\s*(\$\$|\\\[)\s*$/.test(line)) {
      const body: string[] = [];
      while (++n < lines.length && !/^\s*(\$\$|\\\])\s*$/.test(lines[n])) body.push(lines[n]);
      math = body.join(" ");
    }
    if (math !== null) {
      if (last && (last.kind === "ul" || last.kind === "ol")) last.items[last.items.length - 1].more.push({ math: true, s: math });
      else blocks.push({ kind: "math", items: [{ text: math, more: [] }] });
      gap = false;
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const step = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const kind = heading ? "h" : bullet ? "ul" : step ? "ol" : "p";
    const text = (heading?.[1] ?? bullet?.[1] ?? step?.[1] ?? line).trim();
    const item = last && (last.kind === "ul" || last.kind === "ol") ? last.items[last.items.length - 1] : null;
    if (kind === "p" && item?.more.at(-1)?.math && (!gap || /^(where|with|here|so|and)/i.test(text))) item.more.push({ math: false, s: text });
    else if (kind === "p" && !gap && last?.kind === "p") last.items.push({ text, more: [] });
    // An indented line straight after a bullet continues it.
    else if (kind === "p" && !gap && /^\s{2,}/.test(line) && (last?.kind === "ul" || last?.kind === "ol")) last.items[last.items.length - 1].text += ` ${text}`;
    else if ((kind === "ul" || kind === "ol") && last?.kind === kind) last.items.push({ text, more: [] });
    else blocks.push({ kind, items: [{ text, more: [] }] });
    gap = false;
  }
  return blocks;
}

function ListItem({ item, refs }: { item: Item; refs?: Record<string, Ref> }) {
  return (
    <li className="pl-0.5">
      <Inline text={item.text} refs={refs} />
      {item.more.map((m, k) =>
        m.math ? (
          <TeX key={k} src={m.s} block />
        ) : (
          <p key={k} className="text-muted-foreground">
            <Inline text={m.s} refs={refs} />
          </p>
        ),
      )}
    </li>
  );
}

/** A small, safe Markdown subset: paragraphs, headings, "- " bullets, "1. " steps and formulas. */
function Answer({ text: raw, refs }: { text: string; refs?: Record<string, Ref> }) {
  const blocks = parse(dedupe(raw, refs));
  // Numbered steps keep counting across the bullet lists the model puts between them.
  const starts = new Map<number, number>();
  let step = 1;
  blocks.forEach((b, i) => {
    if (b.kind === "ol") {
      starts.set(i, step);
      step += b.items.length;
    } else if (b.kind === "p" || b.kind === "h") step = 1;
  });
  return (
    <div className="grid min-w-0 gap-2.5">
      {blocks.map((b, i) =>
        b.kind === "h" ? (
          <p key={i} className="pt-1 text-[13px] font-semibold text-foreground">
            <Inline text={b.items[0].text.replace(/\*\*/g, "")} refs={refs} />
          </p>
        ) : b.kind === "math" ? (
          <TeX key={i} src={b.items[0].text} block />
        ) : b.kind === "p" ? (
          <p key={i}>
            {b.items.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l.text} refs={refs} />
              </Fragment>
            ))}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="grid list-disc gap-1.5 pl-4 marker:text-muted-foreground">
            {b.items.map((item, j) => (
              <ListItem key={j} item={item} refs={refs} />
            ))}
          </ul>
        ) : (
          <ol key={i} start={starts.get(i)} className="grid list-decimal gap-1.5 pl-5 marker:text-muted-foreground">
            {b.items.map((item, j) => (
              <ListItem key={j} item={item} refs={refs} />
            ))}
          </ol>
        ),
      )}
    </div>
  );
}

/**
 * "Ask AI": a small tutor for both roles. Answers about the person's own
 * projects (with links to what it used) and explains power electronics.
 */
export function AskAi({ role, projects, students }: AskAiProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState("all");
  const [left, setLeft] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  // The page you're on picks the starting scope: a project, or a professor's student.
  const here = pathname.match(/^\/projects\/([0-9a-f-]{36})/i)?.[1] ?? pathname.match(/^\/students\/([0-9a-f-]{36})/i)?.[1];
  const openPanel = () => {
    if (here && messages.length === 0) {
      if (projects.some((p) => p.id === here)) setScope(`p:${here}`);
      else if (students.some((s) => s.id === here)) setScope(`s:${here}`);
    }
    setOpen(true);
  };

  useEffect(() => {
    const onOpen = () => openPanel();
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, pending]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    const history = [...messages.filter((m) => m.role !== "error"), { role: "user" as const, text: q }];
    setMessages((m) => [...m, { role: "user", text: q }]);
    setDraft("");
    start(async () => {
      const res = await askAssistant({
        scope: scope.startsWith("p:") ? { projectId: scope.slice(2) } : scope.startsWith("s:") ? { studentId: scope.slice(2) } : {},
        turns: history.slice(-12).map((m) => ({ role: m.role as "user" | "assistant", text: m.text })),
      });
      if (res.ok) {
        setMessages((m) => [...m, { role: "assistant", text: res.data.text, refs: res.data.refs }]);
        if (res.data.left !== null) setLeft(res.data.left);
      } else {
        setMessages((m) => [...m, { role: "error", text: res.error }]);
      }
    });
  };

  const ideas = suggestions(role, students, scope.startsWith("s:") ? scope.slice(2) : undefined);

  return (
    <>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground sm:px-2.5" onClick={openPanel} aria-label="Ask AI" title="Ask AI about your projects or power electronics">
        <Sparkles className="size-4 text-primary" />
        <span className="hidden lg:inline">Ask AI</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" className="flex flex-col gap-3 overflow-hidden sm:w-[min(480px,100vw)]">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-[17px]">
                <Sparkles className="size-4 text-primary" /> Ask AI
              </DialogTitle>
              <DialogDescription className="text-xs">About your projects, or any power electronics question.</DialogDescription>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="xs" onClick={() => setMessages([])} disabled={pending}>
                <RotateCcw /> New chat
              </Button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Answer about</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-8 min-w-0 flex-1 truncate rounded-md border bg-transparent px-2 text-[13px] text-foreground"
              aria-label="What the answers are about"
            >
              <option value="all">{role === "professor" ? "All my students and projects" : "All my projects"}</option>
              {role === "professor" && students.length > 0 && (
                <optgroup label="Students">
                  {students.map((s) => (
                    <option key={s.id} value={`s:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {projects.length > 0 && (
                <optgroup label="Projects">
                  {projects.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1" aria-live="polite">
            {messages.length === 0 ? (
              <div className="grid gap-4 py-2">
                {[
                  { title: "About your projects", items: ideas.project },
                  { title: "Power electronics", items: ideas.subject },
                ].map((group) => (
                  <div key={group.title} className="grid gap-1.5">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{group.title}</p>
                    {group.items.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => ask(q)}
                        className="rounded-lg border bg-card px-3 py-2 text-left text-[13.5px] transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 py-1">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <p key={i} className="ml-8 justify-self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[14px] whitespace-pre-line text-primary-foreground">
                      {m.text}
                    </p>
                  ) : m.role === "error" ? (
                    <p key={i} className="rounded-lg border border-warning/30 bg-warning/[0.07] px-3 py-2 text-[13px]">
                      {m.text}
                    </p>
                  ) : (
                    <div key={i} className="min-w-0 rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-[14px] leading-6 break-words sm:mr-4">
                      <Answer text={m.text} refs={m.refs} />
                    </div>
                  ),
                )}
                {pending && (
                  <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Thinking…
                  </p>
                )}
                <div ref={bottom} />
              </div>
            )}
          </div>

          <form
            className="grid gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder="Ask about your project, or a power electronics question…"
                className="min-h-11 resize-none text-[14px]"
                aria-label="Your question"
              />
              <Button type="submit" size="icon" disabled={pending || !draft.trim()} aria-label="Send" className="shrink-0">
                {pending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </div>
            <p className={cn("text-[11px] text-muted-foreground")}>
              Answers come from Google Gemini, using your project details. AI can be wrong: check important numbers.
              {left !== null && ` ${left} question${left === 1 ? "" : "s"} left today.`}
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
