"use client";

import { useState } from "react";
import { CalendarClock, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DeadlinePicker } from "@/components/common/deadline-picker";
import { useServerAction } from "@/components/common/use-server-action";
import { addDays, formatDay } from "@/lib/domain/dates";
import { requestExtension, respondExtension, withdrawExtension } from "@/server/actions/extensions";
import type { ExtensionRequest } from "@/types/database";

/** The legitimate way to move a deadline you don't own: ask, with a reason. */
export function RequestExtensionButton({
  projectId,
  taskId,
  currentDeadline,
  today,
  variant = "link",
}: {
  projectId: string;
  taskId: string;
  currentDeadline: string | null;
  today: string;
  variant?: "link" | "button";
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { pending, run } = useServerAction();
  const earliest = currentDeadline && currentDeadline >= today ? addDays(currentDeadline, 1) : addDays(today, 1);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "link" ? (
          <button type="button" className="justify-self-start px-1.5 text-[11.5px] font-medium text-primary hover:underline">
            Request extension
          </button>
        ) : (
          <Button size="sm" variant="outline">
            <CalendarClock /> Request extension
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!date) return;
            run(() => requestExtension({ projectId, taskId, proposedDate: date, reason }), { onSuccess: () => setOpen(false) });
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Request an extension</DialogTitle>
            <DialogDescription>
              Your professor decides. {currentDeadline ? `The deadline stays ${formatDay(currentDeadline)} unless they approve.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Proposed deadline</Label>
            <DeadlinePicker value={date} onChange={setDate} today={today} min={earliest} kind="professor" placeholder="Pick a new date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-reason">Why do you need more time?</Label>
            <Textarea
              id="ext-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              placeholder="The PubMed runs need the A100 node, which is booked until Thursday."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !date || !reason.trim()}>
              {pending && <Loader2 className="animate-spin" />} Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A pending request: the student can withdraw it; the professor decides here. */
export function PendingExtension({
  request,
  studentName,
  isProfessor,
  isRequester,
}: {
  request: Pick<ExtensionRequest, "id" | "proposed_deadline" | "current_deadline" | "reason" | "created_at">;
  studentName: string;
  isProfessor: boolean;
  isRequester: boolean;
}) {
  const [response, setResponse] = useState("");
  const { pending, run } = useServerAction();

  return (
    <div id="extension" className="scroll-mt-20 space-y-2.5 rounded-xl border border-warning/40 bg-warning/[0.06] p-3.5">
      <div className="flex items-start gap-2.5">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {isRequester ? "You asked" : `${studentName} asks`} to move the deadline to {formatDay(request.proposed_deadline)}
            {request.current_deadline && <span className="font-normal text-muted-foreground"> (now {formatDay(request.current_deadline)})</span>}
          </p>
          <p className="mt-0.5 text-muted-foreground">&ldquo;{request.reason}&rdquo;</p>
        </div>
        {isRequester && !isProfessor && (
          <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => withdrawExtension({ requestId: request.id }))}>
            Withdraw
          </Button>
        )}
      </div>
      {isProfessor ? (
        <div className="space-y-2">
          <Textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} placeholder="Note to the student (required to decline)" aria-label="Response" />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => respondExtension({ requestId: request.id, approve: true, response }))}>
              <Check /> Approve new date
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => respondExtension({ requestId: request.id, approve: false, response }))}>
              <X /> Keep deadline
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Waiting for your professor. Keep working toward the current deadline meanwhile.</p>
      )}
    </div>
  );
}
