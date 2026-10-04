"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerAction } from "@/components/common/use-server-action";
import { rescheduleMeeting, scheduleMeeting } from "@/server/actions/meetings";

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Tomorrow at 4 pm, or the meeting's current time when moving it. */
function defaults(startsAt?: string) {
  if (startsAt) {
    const d = new Date(startsAt);
    return { date: localDate(d), time: localTime(d) };
  }
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return { date: localDate(d), time: "16:00" };
}

/**
 * Book a meeting (pick who and when) or, with `meeting`, move one. Times are
 * entered in this device's time zone; everyone sees them in their own.
 */
export function ScheduleMeetingDialog({
  people,
  defaultPersonId,
  meeting,
  trigger,
  role,
}: {
  people: { id: string; name: string }[];
  defaultPersonId?: string;
  meeting?: { id: string; startsAt: string; otherName: string };
  trigger?: React.ReactNode;
  role: "student" | "professor";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState(defaultPersonId ?? people[0]?.id ?? "");
  const [when, setWhen] = useState({ date: "", time: "" });
  const { pending, run } = useServerAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startsAt = new Date(`${when.date}T${when.time}`);
    if (Number.isNaN(startsAt.getTime())) return;
    if (meeting) {
      run(() => rescheduleMeeting({ meetingId: meeting.id, startsAt: startsAt.toISOString() }), { onSuccess: () => setOpen(false) });
    } else {
      run(() => scheduleMeeting({ personId, startsAt: startsAt.toISOString() }), {
        onSuccess: (newId) => {
          setOpen(false);
          router.push(`/meetings/${newId}`);
        },
      });
    }
  };

  const noOne = !meeting && people.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setWhen(defaults(meeting?.startsAt));
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <CalendarPlus /> Schedule meeting
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{meeting ? "Move this meeting" : "Schedule a meeting"}</DialogTitle>
            <DialogDescription>
              {meeting
                ? `${meeting.otherName} gets a notification with the new time.`
                : "The agenda builds itself from what's open between you. They get a notification."}
            </DialogDescription>
          </DialogHeader>

          {noOne ? (
            <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
              {role === "professor" ? "No students are linked to you yet. Share your join code from Settings first." : "Link your professor first (Settings → Professor), then schedule a meeting."}
            </p>
          ) : (
            <>
              {!meeting && (
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-person">{role === "professor" ? "Student" : "With"}</Label>
                  <select
                    id="meeting-person"
                    value={personId}
                    onChange={(e) => setPersonId(e.target.value)}
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-date">Date</Label>
                  <Input id="meeting-date" type="date" required value={when.date} onChange={(e) => setWhen((w) => ({ ...w, date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-time">Time</Label>
                  <Input id="meeting-time" type="time" required step={300} value={when.time} onChange={(e) => setWhen((w) => ({ ...w, time: e.target.value }))} />
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            {!noOne && (
              <Button type="submit" disabled={pending || !when.date || !when.time}>
                {pending && <Loader2 className="animate-spin" />} {meeting ? "Move meeting" : "Schedule"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
