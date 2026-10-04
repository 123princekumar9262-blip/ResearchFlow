"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ComposerData } from "@/lib/data/log-composer";
import { LogForm } from "./log-form";
import { ChapterTrigger } from "@/components/onboarding/tips";

/**
 * The log composer as a slide-over (a tall bottom sheet on phones), opened
 * from anywhere with "+ Log", N or the Log tab. Closing goes back to the page
 * underneath; saving closes it too.
 */
export function LogSheet({
  data,
  today,
  defaultProjectId,
  defaultTaskIds,
  defaultMinutes,
  defaultCompleted,
}: {
  data: ComposerData;
  today: string;
  defaultProjectId?: string;
  defaultTaskIds?: string[];
  defaultMinutes?: number;
  defaultCompleted?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // A soft navigation elsewhere leaves this slot mounted; it only shows on /log/new.
  if (pathname !== "/log/new") return null;
  return (
    <Dialog open onOpenChange={(open) => !open && router.back()}>
      <DialogContent side="right" className="gap-3">
        <ChapterTrigger tour="log" ready={data.projects.length > 0} inDialog />
        <div className="pr-8">
          <DialogTitle className="text-[17px]">Today&apos;s log</DialogTitle>
          <DialogDescription className="text-xs">
            About a minute. It&apos;s your evidence when results aren&apos;t in yet.{" "}
            <Link href="/log" className="underline-offset-2 hover:underline">
              Open the diary
            </Link>
          </DialogDescription>
        </div>
        <LogForm
          {...data}
          today={today}
          defaultProjectId={defaultProjectId}
          defaultTaskIds={defaultTaskIds}
          defaultMinutes={defaultMinutes}
          defaultCompleted={defaultCompleted}
          variant="sheet"
          onSaved={() => router.back()}
        />
      </DialogContent>
    </Dialog>
  );
}
