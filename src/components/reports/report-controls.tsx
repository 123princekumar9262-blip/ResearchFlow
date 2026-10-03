"use client";

import { useState } from "react";
import { Check, Copy, Download, Eye, Link2, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/components/common/use-server-action";
import { acknowledgeReport, draftNoteWithAi, saveWeeklyReport, setReportSharing } from "@/server/actions/reports";

export function ReportEditor({
  weekStart,
  initialNote,
  isCurrentWeek,
  aiEnabled = false,
}: {
  weekStart: string;
  initialNote: string;
  isCurrentWeek: boolean;
  aiEnabled?: boolean;
}) {
  const [note, setNote] = useState(initialNote);
  const draft = useServerAction();
  const submit = useServerAction();
  const ai = useServerAction();
  const writeWithAi = () => {
    if (note.trim() && !confirm("Replace your note with an AI draft?")) return;
    ai.run(() => draftNoteWithAi({ weekStart }), { onSuccess: (text) => typeof text === "string" && setNote(text) });
  };
  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-card p-4 shadow-[var(--shadow-card)] print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2" data-tour="report-note">
        <label htmlFor="report-note" className="text-[13px] font-medium">
          Note to your professor <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        {aiEnabled && (
          <Button type="button" size="sm" variant="outline" disabled={ai.pending} onClick={writeWithAi}>
            {ai.pending ? <Loader2 className="animate-spin" /> : <Sparkles className="text-primary" />} Draft with AI
          </Button>
        )}
      </div>
      <Textarea
        id="report-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="Context the numbers don't show: what you learned, what you need, what you'll prioritise next week."
      />
      <p className="text-xs text-muted-foreground">
        Everything above is generated from your logs and tasks, and refreshes until you submit. Submitting freezes it as a record.
        {isCurrentWeek && " The week isn't over yet; you can submit now or on Friday."}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={draft.pending || submit.pending} onClick={() => draft.run(() => saveWeeklyReport({ weekStart, note }))}>
          {draft.pending && <Loader2 className="animate-spin" />} Save draft
        </Button>
        <Button
          data-tour="report-submit"
          disabled={draft.pending || submit.pending}
          onClick={() => confirm("Submit this report? It can't be edited afterwards.") && submit.run(() => saveWeeklyReport({ weekStart, note, submit: true }))}
        >
          {submit.pending ? <Loader2 className="animate-spin" /> : <Send />} Submit report
        </Button>
      </div>
    </div>
  );
}

export function ShareControls({ reportId, enabled, token, origin }: { reportId: string; enabled: boolean; token: string; origin: string }) {
  const { pending, run } = useServerAction();
  const url = `${origin}/r/${token}`;
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4 print:hidden" data-tour="report-share">
      <div className="flex items-center gap-3">
        <Link2 className="size-4 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-[13px] font-medium">Share by link</p>
          <p className="text-xs text-muted-foreground">For a professor who isn&apos;t on ResearchFlow. Anyone with the link can read this report, and nothing else.</p>
        </div>
        <Switch checked={enabled} disabled={pending} onCheckedChange={(v) => run(() => setReportSharing({ reportId, enabled: v }))} aria-label="Share by link" />
      </div>
      {enabled && (
        <div className="flex gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">{url}</code>
          <Button size="icon-sm" variant="outline" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}>
            <Copy />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Replace link"
            title="Make a new link; the old one stops working"
            disabled={pending}
            onClick={() => run(() => setReportSharing({ reportId, enabled: true, rotate: true }))}
          >
            <RefreshCw />
          </Button>
          <Button size="icon-sm" variant="ghost" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open shared view">
              <Eye />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

export function AcknowledgeButton({ reportId }: { reportId: string }) {
  const { pending, run } = useServerAction();
  return (
    <Button disabled={pending} onClick={() => run(() => acknowledgeReport({ reportId }))} data-tour="report-ack">
      {pending ? <Loader2 className="animate-spin" /> : <Check />} Acknowledge
    </Button>
  );
}

/** The browser's print dialog, where "Save as PDF" produces the report alone (the app chrome is hidden in print). */
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()} data-tour="report-pdf">
      <Download /> Download PDF
    </Button>
  );
}
