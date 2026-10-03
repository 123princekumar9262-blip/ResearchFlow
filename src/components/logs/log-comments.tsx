"use client";

import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/common/ui-bits";
import { useServerAction } from "@/components/common/use-server-action";
import { timeAgo } from "@/lib/domain/dates";
import { postRemark } from "@/server/actions/remarks";
import type { LogComment } from "./log-entry";

/**
 * Feedback on one day's work (spec §3.4): the professor comments on the entry
 * itself, and the student answers in the same place.
 */
export function LogComments({ logId, projectId, comments }: { logId: string; projectId: string; comments: LogComment[] }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const { pending, run } = useServerAction();
  const submit = () =>
    run(() => postRemark({ projectId, progressLogId: logId, body, kind: "comment" }), {
      onSuccess: () => {
        setBody("");
        setOpen(false);
      },
    });

  return (
    <div className="mt-3 space-y-2.5 border-t pt-3">
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2 text-[12.5px]">
          <UserAvatar name={c.authorName} className="size-5 text-[8px]" />
          <p className="min-w-0 flex-1">
            <b className="font-semibold">{c.authorName}</b> <span className="text-muted-foreground">· {timeAgo(c.created_at)}</span>
            <span className="block whitespace-pre-line">{c.body}</span>
          </p>
        </div>
      ))}
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) submit();
          }}
          className="space-y-2"
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            autoFocus
            placeholder={comments.length ? "Reply…" : "Comment on this entry…"}
            onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && submit()}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending || !body.trim()}>
              {pending && <Loader2 className="animate-spin" />} Post
            </Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary">
          <MessageSquare className="size-3.5" /> {comments.length ? "Reply" : "Comment"}
        </button>
      )}
    </div>
  );
}
