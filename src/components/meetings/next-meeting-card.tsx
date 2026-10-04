import Link from "next/link";
import { ChevronRight, Handshake } from "lucide-react";
import { formatMeetingTime } from "@/lib/domain/meetings";
import type { MeetingWithPeople } from "@/lib/data/meetings";

/** The dashboard's reminder of the next one-to-one, with a way into its agenda. */
export function NextMeetingCard({ meeting, timeZone }: { meeting: MeetingWithPeople; timeZone: string }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.06] p-3.5 transition-colors hover:border-success/50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success/14 text-success">
        <Handshake className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">Meeting with {meeting.other.name}</span>
        <span className="block text-[13px] text-muted-foreground">{formatMeetingTime(meeting.starts_at, timeZone)} · open the agenda</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
