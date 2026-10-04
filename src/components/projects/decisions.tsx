"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/components/common/use-server-action";
import { recordDecision } from "@/server/actions/decisions";

/** A lightweight decision record: what was decided, why, and what else was on the table. */
export function DecisionForm({ projectId, today, decisions }: { projectId: string; today: string; decisions: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useServerAction();
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus /> Record a decision
      </Button>
    );
  }
  return (
    <form
      action={(form) =>
        run(
          () =>
            recordDecision({
              projectId,
              title: String(form.get("title") ?? ""),
              context: String(form.get("context") ?? ""),
              decision: String(form.get("decision") ?? ""),
              alternatives: String(form.get("alternatives") ?? ""),
              decidedOn: String(form.get("decidedOn") ?? today),
              supersedes: String(form.get("supersedes") ?? ""),
            }),
          { onSuccess: () => setOpen(false) },
        )
      }
      className="w-full space-y-3 rounded-xl border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor="dc-title">Decision</Label>
          <Input id="dc-title" name="title" required maxLength={200} autoFocus placeholder="Use synchronous rectification instead of a diode" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dc-date">Decided on</Label>
          <Input id="dc-date" name="decidedOn" type="date" defaultValue={today} max={today} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dc-context">Context: what problem forced a choice?</Label>
        <Textarea id="dc-context" name="context" rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dc-decision">What we decided, and why</Label>
        <Textarea id="dc-decision" name="decision" rows={3} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dc-alt">Alternatives considered</Label>
        <Textarea id="dc-alt" name="alternatives" rows={2} placeholder="Schottky diode: rejected because of conduction loss at 5 A…" />
      </div>
      {decisions.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="dc-sup">Replaces an earlier decision?</Label>
          <select id="dc-sup" name="supersedes" className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
            <option value="">No</option>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Record
        </Button>
      </div>
    </form>
  );
}
