"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, CornerDownRight, Loader2, MessageSquare, Users } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/common/ui-bits";
import { useServerAction } from "@/components/common/use-server-action";
import { timeAgo } from "@/lib/domain/dates";
import { postRemark } from "@/server/actions/remarks";
import type { RemarkKind, UserRole } from "@/types/database";
import { ConvertRemarkDialog } from "./convert-remark-dialog";
import { AddressedToggle } from "./remark-actions";

export type RemarkView = {
  id: string;
  body: string;
  kind: RemarkKind;
  source: "app" | "meeting";
  created_at: string;
  addressed_at: string | null;
  author_id: string;
  author_name: string;
  author_role: UserRole;
  addressed_by_name: string | null;
  task_id: string | null;
  task_title?: string | null;
  converted: { id: string; title: string; status: string }[];
  replies: { id: string; body: string; created_at: string; author_name: string; author_role: UserRole }[];
};

const KIND_LABEL: Record<RemarkKind, { label: string; className: string }> = {
  comment: { label: "Comment", className: "text-muted-foreground border-border" },
  change_request: { label: "Change request", className: "text-warning border-warning/40 bg-warning/5" },
  question: { label: "Question", className: "text-info border-info/40 bg-info/5" },
  approval: { label: "Approved", className: "text-success border-success/40 bg-success/5" },
};

function awaitsResponse(r: RemarkView) {
  return (r.kind === "change_request" || r.kind === "question") && !r.addressed_at && (r.author_role === "professor" || r.source === "meeting");
}

export function RemarkThread({
  remarks,
  projectId,
  taskId,
  viewerRole,
  today,
  aiEnabled,
  showTaskLinks,
}: {
  remarks: RemarkView[];
  projectId: string;
  taskId?: string;
  viewerRole: UserRole;
  today: string;
  aiEnabled: boolean;
  showTaskLinks?: boolean;
}) {
  return (
    <div className="space-y-4">
      {remarks.length === 0 && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <MessageSquare className="size-4" /> No remarks yet.
        </p>
      )}
      <ol className="space-y-3">
        {remarks.map((r) => (
          <RemarkItem key={r.id} r={r} projectId={projectId} viewerRole={viewerRole} today={today} aiEnabled={aiEnabled} showTaskLink={showTaskLinks} />
        ))}
      </ol>
      <RemarkComposer projectId={projectId} taskId={taskId} viewerRole={viewerRole} />
    </div>
  );
}

export function RemarkItem({
  r,
  projectId,
  viewerRole,
  today,
  aiEnabled,
  showTaskLink,
}: {
  r: RemarkView;
  projectId: string;
  viewerRole: UserRole;
  today: string;
  aiEnabled: boolean;
  showTaskLink?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const waiting = awaitsResponse(r);
  const kind = KIND_LABEL[r.kind];

  return (
    <li id={`remark-${r.id}`} data-tour="remark" className={cn("scroll-mt-20 rounded-xl border bg-card target:ring-2 target:ring-primary/40", waiting && "border-warning/40")}>
      <div className="flex gap-3 p-3">
        <UserAvatar name={r.author_name} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-medium">{r.author_name}</span>
            <span data-tour="remark-kind" className={cn("rounded border px-1.5 py-px text-[11px]", kind.className)}>
              {kind.label}
            </span>
            {r.source === "meeting" && (
              <span className="flex items-center gap-1 text-muted-foreground" title="Recorded by the student from a meeting">
                <Users className="size-3" /> from a meeting
              </span>
            )}
            <span className="text-muted-foreground">{timeAgo(r.created_at)}</span>
            {showTaskLink && r.task_id && r.task_title && (
              <Link href={`/tasks/${r.task_id}`} className="truncate text-muted-foreground hover:text-foreground hover:underline">
                on {r.task_title}
              </Link>
            )}
          </div>
          <p className="mt-1 whitespace-pre-line">{r.body}</p>

          {(r.converted.length > 0 || r.addressed_at || waiting) && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {waiting && (
                <span data-tour="needs-response" className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                  Needs a response
                </span>
              )}
              {r.addressed_at && (
                <span className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="size-3" /> Addressed{r.addressed_by_name ? ` by ${r.addressed_by_name}` : ""}
                </span>
              )}
              {r.converted.map((t) => (
                <Link key={t.id} href={`/tasks/${t.id}`} className="rounded border px-1.5 py-0.5 text-muted-foreground hover:text-foreground">
                  → {t.title} <span className="opacity-70">({t.status.replace("_", " ")})</span>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-1" data-tour="remark-actions">
            <Button size="xs" variant="ghost" onClick={() => setReplying((v) => !v)}>
              <CornerDownRight /> Reply
            </Button>
            {(r.kind === "change_request" || r.kind === "question") && (
              <>
                {viewerRole === "student" && (waiting || r.converted.length > 0) && (
                  <span data-tour="remark-convert" className="inline-flex">
                    <ConvertRemarkDialog remarkId={r.id} body={r.body} authorName={r.author_name} today={today} aiEnabled={aiEnabled} />
                  </span>
                )}
                <AddressedToggle remarkId={r.id} addressed={!!r.addressed_at} />
              </>
            )}
          </div>
        </div>
      </div>

      {(r.replies.length > 0 || replying) && (
        <div className="space-y-2 border-t bg-muted/30 px-3 py-2.5 pl-12">
          {r.replies.map((reply) => (
            <div key={reply.id} className="flex gap-2">
              <UserAvatar name={reply.author_name} className="size-5 text-[9px]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-medium">{reply.author_name}</span> <span className="text-muted-foreground">{timeAgo(reply.created_at)}</span>
                </p>
                <p className="whitespace-pre-line">{reply.body}</p>
              </div>
            </div>
          ))}
          {replying && <ReplyForm parent={r} projectId={projectId} onDone={() => setReplying(false)} canAddress={waiting} />}
        </div>
      )}
    </li>
  );
}

/** Convert, reply and mark addressed for a remark shown outside its thread (the dashboard). */
export function RemarkQuickActions({ remarkId, projectId, convert }: { remarkId: string; projectId: string; convert: React.ReactNode }) {
  const [replying, setReplying] = useState(false);
  return (
    <>
      <div className="flex flex-wrap gap-1" data-tour="remark-actions">
        <span data-tour="remark-convert" className="inline-flex">
          {convert}
        </span>
        <Button size="xs" variant="ghost" onClick={() => setReplying((v) => !v)} aria-expanded={replying}>
          <CornerDownRight /> Reply
        </Button>
        <AddressedToggle remarkId={remarkId} addressed={false} />
      </div>
      {replying && <ReplyForm parent={{ id: remarkId }} projectId={projectId} onDone={() => setReplying(false)} canAddress />}
    </>
  );
}

function ReplyForm({ parent, projectId, onDone, canAddress }: { parent: { id: string }; projectId: string; onDone: () => void; canAddress: boolean }) {
  const [body, setBody] = useState("");
  const [address, setAddress] = useState(canAddress);
  const { pending, run } = useServerAction();
  const submit = () =>
    run(() => postRemark({ projectId, parentId: parent.id, body, addressParent: canAddress && address }), {
      onSuccess: () => {
        setBody("");
        onDone();
      },
    });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Write a reply…"
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && submit()}
      />
      <div className="flex items-center gap-3">
        {canAddress && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={address} onCheckedChange={(v) => setAddress(v === true)} /> This reply addresses it
          </label>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending || !body.trim()}>
            {pending && <Loader2 className="animate-spin" />} Reply
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * New remark. Professors pick the kind. Students write comments, or record
 * what the professor said in a meeting, labelled as such.
 */
export function RemarkComposer({ projectId, taskId, viewerRole }: { projectId: string; taskId?: string; viewerRole: UserRole }) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<RemarkKind>("comment");
  const [meeting, setMeeting] = useState(false);
  const { pending, run } = useServerAction();
  const isProfessor = viewerRole === "professor";
  const kinds: RemarkKind[] = isProfessor || meeting ? ["comment", "change_request", "question"] : ["comment"];

  const submit = () =>
    run(() => postRemark({ projectId, taskId: taskId ?? "", body, kind: kinds.includes(kind) ? kind : "comment", source: meeting ? "meeting" : "app" }), {
      onSuccess: () => {
        setBody("");
        setKind("comment");
        setMeeting(false);
      },
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2 rounded-xl border bg-card p-3"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={
          isProfessor
            ? "Feedback, a requested change, or a question…"
            : meeting
              ? "What did your professor say? Record it in their words."
              : "Comment, or note progress for your professor…"
        }
        onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && submit()}
        aria-label="Remark"
      />
      <div className="flex flex-wrap items-center gap-2">
        {!isProfessor && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={meeting} onCheckedChange={(v) => setMeeting(v === true)} /> Record from a meeting
          </label>
        )}
        {kinds.length > 1 && (
          <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Kind" data-tour="remark-kinds">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cn("rounded px-2 py-0.5 text-xs", kind === k ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {KIND_LABEL[k].label}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">Ctrl/⌘ ↵ to send</span>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending && <Loader2 className="animate-spin" />} Post
        </Button>
      </div>
      {(kind === "change_request" || kind === "question") && kinds.includes(kind) && (
        <p className="text-xs text-muted-foreground">
          {isProfessor ? "This shows up on the student's dashboard until it's addressed." : "This stays open on your dashboard until you address it."}
        </p>
      )}
    </form>
  );
}
