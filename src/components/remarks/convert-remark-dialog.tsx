"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerAction } from "@/components/common/use-server-action";
import { convertRemarkToTask } from "@/server/actions/remarks";
import type { TaskPriority } from "@/types/database";
import { AiSplitButton } from "./ai-split";
import { DeadlinePicker } from "@/components/common/deadline-picker";

function suggestTitle(body: string): string {
  const first = body.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? body;
  return (first.length > 120 ? `${first.slice(0, 117)}…` : first).replace(/[.]$/, "");
}

/** Turn a remark into a tracked task. The remark is marked addressed and linked to the task. */
export function ConvertRemarkDialog({
  remarkId,
  body,
  authorName,
  today,
  aiEnabled,
  trigger,
}: {
  remarkId: string;
  body: string;
  authorName: string;
  today: string;
  aiEnabled?: boolean;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(() => suggestTitle(body));
  const [description, setDescription] = useState(() => `From ${authorName}: "${body}"`);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [deadline, setDeadline] = useState<string | null>(null);
  const { pending, run } = useServerAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => convertRemarkToTask({ remarkId, title, description, priority, personalDeadline: deadline ?? "" }), {
      onSuccess: (taskId) => {
        setOpen(false);
        router.push(`/tasks/${taskId}`);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="xs" variant="outline">
            <ListPlus /> Convert to task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Convert remark to task</DialogTitle>
            <DialogDescription>The task links back to this remark, and the remark is marked as addressed.</DialogDescription>
          </DialogHeader>
          <blockquote className="rounded-md border-l-2 border-primary bg-muted/60 px-3 py-2 text-muted-foreground">{body}</blockquote>
          {aiEnabled && <AiSplitButton remarkId={remarkId} onDone={() => setOpen(false)} today={today} />}
          <div className="space-y-1.5">
            <Label htmlFor={`t-${remarkId}`}>Task title</Label>
            <Input id={`t-${remarkId}`} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`d-${remarkId}`}>Description</Label>
            <Textarea id={`d-${remarkId}`} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["urgent", "high", "medium", "low"] as const).map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`dl-${remarkId}`}>Your deadline</Label>
              <DeadlinePicker id={`dl-${remarkId}`} value={deadline} onChange={setDeadline} today={today} placeholder="Your own target" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending && <Loader2 className="animate-spin" />} Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
